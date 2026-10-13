#!/usr/bin/env bash
# Weaver Android: AAB の道具探索・取り出し・入力検証・要約（K-79/R0。詳細設計 §5.6・§4.6）。
#
# 使い方: weaver_android_aab.sh <サブコマンド> [--名前 値 ...]（`--名前=値` は不可）
#   tools         --ndk-version V                     build-tools 36.0.0 と NDK から道具を探し、KEY=VALUE の5行を標準出力へ
#   extract       --aab F --bundletool-jar J --signing signed|unsigned --out DIR
#                                                      AABから検査用のテキスト（manifest.xml・cert.txt・universal.apk・nsc.txt・
#                                                      dex-classes.txt・abis.txt・resources.txt）を取り出す。AABは展開・実行しない
#   verify-input  --aab F --sha256-file F --max-bytes N 入力AABの検証（通常ファイル・sha256・サイズ・署名ブロック0件・名前の安全）
#   verify-hash   --aab F --expect-sha256 HEX           通常ファイルであることと sha256 の一致だけを確かめる（ZIPを開かない）
#   facts         --dir DIR --run N --out FILE          要約用の事実（固定3キー）を書く。書式が合わなければ書かない
#   summary       --facts F [--cert F] --signing S --kind K --run N --expect-version V --expect-version-code C --out FILE
#   終了コード: 0＝成功 / 1＝検証・取り出しの失敗 / 2＝使い方の誤り
#
# 成果物の名前の書式（詳細設計 §3.2・§4.6）:
#   weaver-android-<version>-<versionCode>-<kind>.aab ／ weaver-android-summary-<run>.txt
#   kind は confirm・submission・unsigned-verification-only の3値
# 実装: bash と perl。環境ファイル（$GITHUB_ENV・$GITHUB_OUTPUT・$GITHUB_PATH）へは何も書かない。eval・コマンド置換に値を渡さない。

set -u

perl - "$@" <<'PERL_AAB'
use strict;
use warnings;
use File::Path qw(make_path);
use File::Temp qw(tempdir);
use Digest::SHA qw(sha256_hex);
use POSIX ();
use File::Spec;

$| = 1;
binmode(STDOUT);

my @SUBCOMMANDS = qw(tools extract verify-input verify-hash facts summary);
my %ALLOWED = (
    'tools'        => [qw(ndk-version)],
    'extract'      => [qw(aab bundletool-jar signing out)],
    'verify-input' => [qw(aab sha256-file max-bytes)],
    'verify-hash'  => [qw(aab expect-sha256)],
    'facts'        => [qw(dir run out)],
    'summary'      => [qw(facts cert signing kind run expect-version expect-version-code out)],
);
my @KINDS = qw(confirm submission unsigned-verification-only);

sub usage_die {
    my ($msg) = @_;
    print STDERR "weaver_android_aab: $msg\n" if defined $msg && $msg ne '';
    print STDERR "usage: weaver_android_aab.sh <" . join('|', @SUBCOMMANDS) . "> [--option value ...]\n";
    exit 2;
}

my $SUB = shift @ARGV;
usage_die('missing subcommand') unless defined $SUB;
usage_die("unknown subcommand: $SUB") unless grep { $_ eq $SUB } @SUBCOMMANDS;
my %O;
{
    my %ok = map { $_ => 1 } @{$ALLOWED{$SUB}};
    while (@ARGV) {
        my $a = shift @ARGV;
        usage_die("unknown argument: $a") unless $a =~ /\A--([A-Za-z0-9-]+)\z/;
        my $n = $1;
        usage_die("unknown option for $SUB: $a") unless $ok{$n};
        usage_die("option needs a value: --$n") unless @ARGV;
        $O{$n} = shift @ARGV;
    }
}
sub need { my ($n) = @_; usage_die("missing required option: --$n") unless exists $O{$n}; return $O{$n}; }

# ---------------------------------------------------------------- 共通部品
my @FAILS;
my $TAG = '';
sub fail { my ($msg) = @_; push @FAILS, "FAIL: $TAG: $msg"; }
sub finish_fail {
    print "$_\n" for @FAILS;
    exit 1;
}
sub slurp_bin {
    my ($p) = @_;
    open(my $fh, '<:raw', $p) or return undef;
    local $/;
    my $t = <$fh>;
    close($fh);
    return $t;
}
sub write_file {
    my ($p, $text) = @_;
    open(my $fh, '>:raw', $p) or return 0;
    print $fh $text;
    return close($fh) ? 1 : 0;
}
# 子プロセスを実行し、標準出力を指定ファイルへ、標準エラーを捨てて、終了コードを返す（シェルを通さない）
sub run_to_file {
    my ($file, @cmd) = @_;
    my $pid = fork();
    return 127 unless defined $pid;
    if (!$pid) {
        open(STDOUT, '>', $file) or POSIX::_exit(127);
        binmode(STDOUT);
        open(STDERR, '>', File::Spec->devnull()) or POSIX::_exit(127);
        exec(@cmd);
        POSIX::_exit(127);
    }
    waitpid($pid, 0);
    return $? >> 8;
}
sub run_text {
    my (@cmd) = @_;
    my $tmp = tempdir('wvrXXXXXX', TMPDIR => 1, CLEANUP => 1);
    my $f = "$tmp/out";
    my $rc = run_to_file($f, @cmd);
    my $t = slurp_bin($f);
    $t = '' unless defined $t;
    unlink $f;
    rmdir $tmp;
    return ($rc, $t);
}
sub which {
    my ($name) = @_;
    for my $d (split /:/, (defined $ENV{PATH} ? $ENV{PATH} : '')) {
        next if $d eq '';
        return "$d/$name" if -f "$d/$name";
    }
    return undef;
}
sub file_size { my ($p) = @_; return (-e $p) ? (-s $p) : 0; }
sub is_hex64 { my ($v) = @_; return defined $v && $v =~ /\A[0-9a-f]{64}\z/; }
sub sha_of_file {
    my ($p) = @_;
    open(my $fh, '<:raw', $p) or return undef;
    my $d = Digest::SHA->new(256);
    $d->addfile($fh);
    close($fh);
    return $d->hexdigest;
}

# ZIP の中央ディレクトリからエントリ名を読む（展開しない・実行しない）。読めなければ undef
sub zip_names {
    my ($path) = @_;
    open(my $fh, '<:raw', $path) or return undef;
    my $size = -s $path;
    return undef if !defined $size || $size < 22;
    my $tail = $size < 70000 ? $size : 70000;
    sysseek($fh, $size - $tail, 0) or return undef;
    my $buf = '';
    my $got = sysread($fh, $buf, $tail);
    return undef unless defined $got && $got == $tail;
    my $pos = rindex($buf, "PK\x05\x06");
    return undef if $pos < 0;
    my ($entries, $cd_size, $cd_off) = unpack('x10 v V V', substr($buf, $pos, 22));
    return undef if $entries == 0xFFFF || $cd_size == 0xFFFFFFFF || $cd_off == 0xFFFFFFFF;
    return [] if $entries == 0;
    return undef if $cd_off + $cd_size > $size;
    sysseek($fh, $cd_off, 0) or return undef;
    my $cd = '';
    $got = sysread($fh, $cd, $cd_size);
    return undef unless defined $got && $got == $cd_size;
    my @names;
    my $o = 0;
    for (1 .. $entries) {
        return undef if $o + 46 > length($cd) || substr($cd, $o, 4) ne "PK\x01\x02";
        my ($nl, $el, $cl) = unpack('x28 v v v', substr($cd, $o, 34));
        return undef if $o + 46 + $nl > length($cd);
        push @names, substr($cd, $o + 46, $nl);
        $o += 46 + $nl + $el + $cl;
    }
    close($fh);
    return \@names;
}

# ---------------------------------------------------------------- tools
sub cmd_tools {
    $TAG = 'TOOLS';
    my $ndk = need('ndk-version');
    my $home = (defined $ENV{ANDROID_HOME} && $ENV{ANDROID_HOME} ne '') ? $ENV{ANDROID_HOME} : $ENV{ANDROID_SDK_ROOT};
    my %found;
    my @missing;
    my $bt = (defined $home && $home ne '') ? "$home/build-tools/36.0.0" : undef;
    for my $pair (['WEAVER_ZIPALIGN', 'zipalign'], ['WEAVER_AAPT2', 'aapt2'], ['WEAVER_DEXDUMP', 'dexdump']) {
        my ($key, $tool) = @$pair;
        if (defined $bt && -f "$bt/$tool") { $found{$key} = "$bt/$tool"; } else { push @missing, "$key ($tool in build-tools/36.0.0)"; }
    }
    my $obj;
    if (defined $home && $home ne '') {
        for my $c (glob("$home/ndk/$ndk/toolchains/llvm/prebuilt/*/bin/llvm-objdump")) {
            if (-f $c) { $obj = $c; last; }
        }
    }
    if (defined $obj) { $found{WEAVER_OBJDUMP} = $obj; } else { push @missing, "WEAVER_OBJDUMP (llvm-objdump in ndk/$ndk)"; }
    my $kt = which('keytool');
    if (defined $kt && ($^O eq 'msys' || $^O eq 'cygwin')) {
        # Windows の Git Bash では PATH 由来のパスが /tmp/... 形式になるため、Windows 側からも読める形へ直す
        my ($crc, $mixed) = run_text('cygpath', '-m', $kt);
        ($kt = $mixed) =~ s/\s+\z// if $crc == 0 && $mixed =~ /\S/;
    }
    if (!defined $kt && defined $ENV{JAVA_HOME} && -f "$ENV{JAVA_HOME}/bin/keytool") { $kt = "$ENV{JAVA_HOME}/bin/keytool"; }
    if (defined $kt) { $found{WEAVER_KEYTOOL} = $kt; } else { push @missing, 'WEAVER_KEYTOOL (keytool)'; }
    fail("not found: $_") for @missing;
    if (!defined $home || $home eq '') { fail('ANDROID_HOME (or ANDROID_SDK_ROOT) is not set'); }
    finish_fail() if @FAILS;
    print "$_=$found{$_}\n" for qw(WEAVER_KEYTOOL WEAVER_AAPT2 WEAVER_ZIPALIGN WEAVER_DEXDUMP WEAVER_OBJDUMP);
    exit 0;
}

# ---------------------------------------------------------------- extract
sub random_password {
    my $pw = '';
    if (open(my $r, '<:raw', '/dev/urandom')) {
        my $b;
        read($r, $b, 24);
        close($r);
        $pw = join('', map { ('a' .. 'z', 'A' .. 'Z', 0 .. 9)[ord($_) % 62] } split //, (defined $b ? $b : ''));
    }
    $pw .= join('', map { ('a' .. 'z', 'A' .. 'Z', 0 .. 9)[int(rand(62))] } 1 .. 12);
    return $pw;
}
sub cmd_extract {
    $TAG = 'EXTRACT';
    my $aab = need('aab');
    my $jar = exists $O{'bundletool-jar'} ? $O{'bundletool-jar'} : '';    # 無い・読めない場合は使い方の誤りでなく失敗（rc=1）
    my $signing = need('signing');
    my $out = need('out');
    usage_die('--signing must be signed or unsigned') unless $signing eq 'signed' || $signing eq 'unsigned';
    fail("AAB not found: $aab") unless -f $aab;
    fail("bundletool jar not found or unreadable (--bundletool-jar): $jar") unless $jar ne '' && -f $jar && -r $jar;
    finish_fail() if @FAILS;
    make_path($out);
    fail("cannot create the output directory: $out") unless -d $out;
    finish_fail() if @FAILS;
    my $keytool = $ENV{WEAVER_KEYTOOL} || 'keytool';
    my $aapt2 = $ENV{WEAVER_AAPT2} || 'aapt2';
    my $dexdump = $ENV{WEAVER_DEXDUMP} || 'dexdump';
    my $tmp = tempdir('wvrXXXXXX', TMPDIR => 1, CLEANUP => 1);
    my @java = ('java', '-jar', $jar);

    # manifest.xml
    my $rc = run_to_file("$out/manifest.xml", @java, 'dump', 'manifest', "--bundle=$aab");
    fail("manifest: bundletool dump manifest failed (rc=$rc) or produced no output") if $rc != 0 || !file_size("$out/manifest.xml");

    # cert.txt（署名なしでは keytool が失敗しても出力を保存する）
    $rc = run_to_file("$out/cert.txt", $keytool, '-printcert', '-jarfile', $aab);
    if ($signing eq 'signed') {
        fail("cert: keytool -printcert failed (rc=$rc) or produced no output") if $rc != 0 || !file_size("$out/cert.txt");
    } elsif (!file_size("$out/cert.txt")) {
        write_file("$out/cert.txt", "jar is unsigned.\n") or fail('cert: cannot write cert.txt');
    }

    # universal.apk（実行ごとに作る使い捨て鍵で署名。検証にだけ使い、一時ディレクトリごと消す）
    my $pw = random_password();
    my $ks = "$tmp/verify-only.jks";
    $ENV{WEAVER_VERIFY_TMP_PW} = $pw;
    my @gen = ($keytool, '-genkeypair', '-keystore', $ks, '-alias', 'weaver-verify', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2', '-dname', 'CN=weaver-verify');
    push @gen, qw(-storepass:env WEAVER_VERIFY_TMP_PW -keypass:env WEAVER_VERIFY_TMP_PW);
    $rc = run_to_file("$tmp/genkey.out", @gen);
    delete $ENV{WEAVER_VERIFY_TMP_PW};
    my $universal_ok = 0;
    if ($rc != 0) {
        fail("universal: cannot create the throwaway signing key (rc=$rc)");
    } else {
        my $apks = "$tmp/universal.apks";
        $rc = run_to_file("$tmp/build-apks.out", @java, 'build-apks', "--bundle=$aab", "--output=$apks", '--mode=universal', "--ks=$ks", "--ks-pass=pass:$pw", '--ks-key-alias=weaver-verify', "--key-pass=pass:$pw");
        if ($rc != 0) {
            fail("universal: bundletool build-apks failed (rc=$rc)");
        } else {
            $rc = run_to_file("$out/universal.apk", 'unzip', '-p', $apks, 'universal.apk');
            if ($rc != 0 || !file_size("$out/universal.apk")) { fail("universal: cannot read universal.apk from the generated APK set (rc=$rc)"); } else { $universal_ok = 1; }
        }
    }
    unlink $ks;

    # nsc.txt（ネットワークセキュリティ設定。パスが短縮されていても resources の一覧から探す）
    if ($universal_ok) {
        my ($rrc, $rtext) = run_text($aapt2, 'dump', 'resources', "$out/universal.apk");
        my $nsc = ($rrc == 0 && $rtext =~ m{(res/[^\s"]*network_security_config[^\s"]*\.xml)}) ? $1 : 'res/xml/network_security_config.xml';
        $rc = run_to_file("$out/nsc.txt", $aapt2, 'dump', 'xmltree', '--file', $nsc, "$out/universal.apk");
        fail("nsc: aapt2 dump xmltree failed (rc=$rc) or produced no output") if $rc != 0 || !file_size("$out/nsc.txt");
    } else {
        fail('nsc: skipped because universal.apk is not available');
    }

    # dex-classes.txt（dexdump の Class descriptor をドット区切りの完全修飾名にする）
    my ($lrc, $list) = run_text('unzip', '-Z1', $aab);
    my @dex = $lrc == 0 ? grep { m{\Abase/dex/[^/]+\.dex\z} } map { s/\r//gr } split(/\n/, $list) : ();
    my @classes;
    my $dex_ok = (@dex && $lrc == 0) ? 1 : 0;
    my $i = 0;
    for my $d (@dex) {
        $i++;
        my $df = "$tmp/classes$i.dex";
        my $prc = run_to_file($df, 'unzip', '-p', $aab, $d);
        my ($drc, $dtext) = $prc == 0 ? run_text($dexdump, $df) : ($prc, '');
        unlink $df;
        if ($prc != 0 || $drc != 0) { $dex_ok = 0; last; }
        while ($dtext =~ /Class descriptor\s*:\s*'L([^;']+);'/g) {
            (my $c = $1) =~ s{/}{.}g;
            push @classes, $c;
        }
    }
    if (!$dex_ok || !@classes) {
        fail('dex-classes: could not list the classes of the dex files (unzip/dexdump failed or no class was found)');
    } else {
        write_file("$out/dex-classes.txt", join("\n", @classes) . "\n") or fail('dex-classes: cannot write dex-classes.txt');
    }

    # abis.txt（lib/ 直下のABI名）
    my ($arc, $atext) = run_text('unzip', '-l', $aab);
    my %abi;
    if ($arc == 0) {
        while ($atext =~ m{(?:\A|[/\s])lib/([^/\s]+)/[^/\s]+\.so\b}g) { $abi{$1} = 1; }
    }
    if ($arc != 0 || !%abi) {
        fail("abis: could not list the lib/ ABI directories of the AAB (rc=$arc)");
    } else {
        write_file("$out/abis.txt", join("\n", sort keys %abi) . "\n") or fail('abis: cannot write abis.txt');
    }

    # resources.txt（AG2 post 用。`string/<名前>: <値>` の正規化した形で保存）
    my @res;
    for my $name (qw(project_id google_app_id)) {
        my ($rrc, $rtext) = run_text(@java, 'dump', 'resources', "--bundle=$aab", "--resource=string/$name", '--values');
        my $v;
        if ($rrc == 0) {
            if ($rtext =~ /^string\/\Q$name\E:\s*(.*?)\s*$/m) { $v = $1; }
            elsif ($rtext =~ /\bValue:\s*"(.*?)"\s*$/m) { $v = $1; }
        }
        if (!defined $v || $v eq '') { fail("resources: string/$name was not found in the AAB (rc=$rrc)"); }
        else { push @res, "string/$name: $v"; }
    }
    write_file("$out/resources.txt", join("\n", @res) . "\n") if @res == 2;

    finish_fail() if @FAILS;
    print "ANDROID AAB extract PASSED\n";
    exit 0;
}

# ---------------------------------------------------------------- verify-input
sub cmd_verify_input {
    $TAG = 'INPUT';
    my $aab = need('aab');
    my $shaf = need('sha256-file');
    my $max = need('max-bytes');
    usage_die('--max-bytes must be digits only') unless $max =~ /\A[0-9]+\z/;
    if (-l $aab) {
        fail("not a regular file (symbolic link): $aab");
    } elsif (-d $aab) {
        fail("not a regular file (directory): $aab");
    } elsif (!-f $aab) {
        fail("file not found: $aab");
    } else {
        my $t = slurp_bin($shaf);
        my ($want) = defined $t ? ($t =~ /\A\s*([0-9a-f]{64})(?:\s|\z)/) : (undef);
        if (!defined $want) {
            fail("sha256 file is missing or malformed: $shaf");
        } else {
            my $have = sha_of_file($aab);
            fail("sha256 mismatch: expected $want but the file is " . (defined $have ? $have : 'unreadable')) if !defined $have || $have ne $want;
        }
        my $size = -s $aab;
        fail("size $size exceeds the limit $max bytes") if $size > $max;
        my $names = zip_names($aab);
        if (!defined $names) {
            fail('not a readable ZIP file (central directory)');
        } else {
            fail('the ZIP file has no entries') unless @$names;
            for my $n (@$names) {
                if ($n =~ m{\AMETA-INF/(?:[^/]*\.(?:SF|RSA|DSA|EC)|SIG-[^/]*)\z}i) {
                    fail("signature block entry found before signing: $n");
                }
                if ($n =~ m{\A/} || $n =~ m{(?:\A|/)\.\.(?:/|\z)} || $n =~ /\\/) {
                    fail("unsafe entry name (absolute path or ..): $n");
                }
            }
        }
    }
    finish_fail() if @FAILS;
    print "ANDROID AAB verify-input PASSED\n";
    exit 0;
}

# ---------------------------------------------------------------- verify-hash
sub cmd_verify_hash {
    $TAG = 'HASH';
    my $aab = need('aab');
    my $exp = need('expect-sha256');
    usage_die('--expect-sha256 must be 64 lowercase hex digits') unless is_hex64($exp);
    if (-l $aab) {
        fail("not a regular file (symbolic link): $aab");
    } elsif (-d $aab) {
        fail("not a regular file (directory): $aab");
    } elsif (!-f $aab) {
        fail("file not found: $aab");
    } else {
        my $have = sha_of_file($aab);
        fail("sha256 mismatch: expected $exp but the file is " . (defined $have ? $have : 'unreadable')) if !defined $have || $have ne $exp;
    }
    finish_fail() if @FAILS;
    print "ANDROID AAB verify-hash PASSED\n";
    exit 0;
}

# ---------------------------------------------------------------- facts・summary
sub facts_problems {
    my ($version, $code, $run) = @_;
    my @p;
    push @p, "version '" . (defined $version ? $version : '') . "' does not match ^[0-9]+(\\.[0-9]+)*\$ (max 32 chars)"
        unless defined $version && length($version) <= 32 && $version =~ /\A[0-9]+(?:\.[0-9]+)*\z/;
    push @p, "versionCode '" . (defined $code ? $code : '') . "' does not match ^[0-9]{1,10}\$"
        unless defined $code && $code =~ /\A[0-9]{1,10}\z/;
    push @p, "run '" . (defined $run ? $run : '') . "' does not match ^[0-9]{1,10}\$"
        unless defined $run && $run =~ /\A[0-9]{1,10}\z/;
    return @p;
}
sub cmd_facts {
    $TAG = 'FACTS';
    my $dir = need('dir');
    my $run = need('run');
    my $out = need('out');
    my $m = slurp_bin("$dir/manifest.xml");
    if (!defined $m) {
        fail("manifest.xml not found in $dir");
    } else {
        $m =~ s/\r//g;
        my $attrs = ($m =~ /<manifest\b([^>]*)>/s) ? $1 : '';
        my ($vn) = $attrs =~ /android:versionName\s*=\s*"([^"]*)"/;
        my ($vc) = $attrs =~ /android:versionCode\s*=\s*"([^"]*)"/;
        fail($_) for facts_problems($vn, $vc, $run);
        if (!@FAILS) {
            my $text = "version=$vn\nversionCode=$vc\nrun=$run\n";
            (my $d = $out) =~ s{/[^/]*\z}{};
            make_path($d) if $d ne '' && $d ne $out && !-d $d;
            write_file($out, $text) or fail("cannot write $out");
        }
    }
    finish_fail() if @FAILS;
    print "ANDROID AAB facts PASSED\n";
    exit 0;
}

sub cmd_summary {
    $TAG = 'FACTS';
    my $facts = need('facts');
    my $signing = need('signing');
    my $kind = need('kind');
    my $run = need('run');
    my $ev = need('expect-version');
    my $evc = need('expect-version-code');
    my $out = need('out');
    fail("kind '$kind' is not one of: " . join(', ', @KINDS)) unless grep { $_ eq $kind } @KINDS;
    fail("signing '$signing' is not signed or unsigned") unless $signing eq 'signed' || $signing eq 'unsigned';
    my $t = slurp_bin($facts);
    my %f;
    if (!defined $t) {
        fail("facts file not found: $facts");
    } else {
        fail('facts file is larger than 1KB') if length($t) > 1024;
        fail('facts file contains control characters') if $t =~ /[\x00-\x09\x0b-\x1f\x7f]/;
        my $body = $t;
        $body =~ s/\n\z//;
        my @lines = split(/\n/, $body, -1);
        fail('facts must have exactly 3 lines (found ' . scalar(@lines) . ')') if @lines != 3;
        my %seen;
        for my $l (@lines) {
            if ($l =~ /\A(version|versionCode|run)=(.*)\z/) {
                fail("duplicate key in facts: $1") if $seen{$1}++;
                $f{$1} = $2;
            } else {
                fail("unexpected line in facts (allowed keys: version, versionCode, run)");
            }
        }
        fail($_) for facts_problems($f{version}, $f{versionCode}, $f{run});
        fail("facts run '$f{run}' differs from --run '$run'") if defined $f{run} && $f{run} ne $run;
        fail("facts version '$f{version}' differs from the expected '$ev'") if defined $f{version} && $f{version} ne $ev;
        fail("facts versionCode '$f{versionCode}' differs from the expected '$evc'") if defined $f{versionCode} && $f{versionCode} ne $evc;
    }
    my $cert_line;
    if ($signing eq 'signed') {
        my $cf = exists $O{cert} ? $O{cert} : undef;
        my $c = defined $cf ? slurp_bin($cf) : undef;
        if (!defined $c) {
            $TAG = 'CERT';
            fail('certificate file is missing (--cert)');
        } else {
            my @sha = ($c =~ /^\s*SHA256:\s*([0-9A-Fa-f:]+)/mg);
            if (@sha != 1) {
                $TAG = 'CERT';
                fail('exactly one SHA256 certificate line is required (found ' . scalar(@sha) . ')');
            } else {
                ($cert_line = uc $sha[0]) =~ s/://g;
            }
        }
    } else {
        $cert_line = "UNSIGNED \xE2\x80\x94 verification only";
    }
    finish_fail() if @FAILS;
    my @lines = (
        'ANDROID BUILD SUMMARY',
        "kind: $kind",
        "version: $f{version}",
        "versionCode: $f{versionCode}",
        "run: $f{run}",
        "cert_sha256: $cert_line",
        "aab: weaver-android-$f{version}-$f{versionCode}-$kind.aab",
    );
    push @lines, 'This AAB is not signed and cannot be uploaded to Google Play.' if $signing eq 'unsigned';
    my $text = join("\n", @lines) . "\n";
    (my $d = $out) =~ s{/[^/]*\z}{};
    make_path($d) if $d ne '' && $d ne $out && !-d $d;
    if (!write_file($out, $text)) {
        $TAG = 'SUMMARY';
        fail("cannot write $out");
        finish_fail();
    }
    print $text;
    exit 0;
}

if    ($SUB eq 'tools')        { cmd_tools(); }
elsif ($SUB eq 'extract')      { cmd_extract(); }
elsif ($SUB eq 'verify-input') { cmd_verify_input(); }
elsif ($SUB eq 'verify-hash')  { cmd_verify_hash(); }
elsif ($SUB eq 'facts')        { cmd_facts(); }
elsif ($SUB eq 'summary')      { cmd_summary(); }
PERL_AAB
exit $?
