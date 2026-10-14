#!/usr/bin/env bash
# Weaver Android ビルドガード（K-79/R0。詳細設計 §5.1〜§5.3・§5.8）。
#
# 使い方: weaver_android_guard.sh <サブコマンド> [--名前 値 ...]
#   サブコマンド: mode | ag1 .. ag10 | abi | sdk | baseline | pre | post
#   post の --signing は「このAABに署名が有るか」、--signing-mode は「リポジトリの署名モード（目印で決まる）」。後者の既定は --signing と同じ。
#   署名モードが signed の post では、許可リストの（b）が未固定（B-PENDING）なら違反にする（signed でのみ許可リストの未固定を許さない）。
#   オプションは `--名前 値` の形のみ（`--名前=値` は不可）。同じオプションは後勝ち。フラグは --allow-pending だけ。
#   終了コード: 0＝合格（警告あり含む） / 1＝違反あり（全件を列挙してから終了。検査できなかった場合も違反） / 2＝使い方の誤り
#
# 出力（すべて標準出力。標準エラーは使い方の誤りだけ）:
#   FAIL: <AGn>: <場所>: <説明>   違反（秘密の値は出さない）
#   WARN: <AGn>: ...              警告（合格）
#   NOTE: <AGn>: ...              参考情報
#   ANDROID GUARD <AGn> PASSED / FAILED (<n> violation(s))    各検査の末尾。集約は ANDROID GUARD pre|post PASSED (<mode>, <signing>)
#
# 検査:
#   AG1 権限 / AG2 google-services.json / AG3 署名 / AG4 namespaceとクラス / AG5 ブランド / AG6 外部送信・平文通信
#   AG7 版 / AG8 rnbeta / AG9 端末種別 / AG10 秘密の追跡検出 / abi 同梱ABI / sdk SDK版 / baseline 型検査・jestの基準値
#   成果物の種別（kind）: confirm（確認用）・submission（提出用）・unsigned-verification-only（署名なし検証）
#
# 実装の方針: 外部コマンドは bash・perl・git・keytool だけ（Git Bash・macOS・Ubuntu で動かす。python3 は使わない）。
# このスクリプトは読み取り専用で、一時ファイルを作らない。パスワードは環境変数で受け、引数・出力に出さない。
# 検査する全ファイルの CR（0x0D）を取り除いてから解析する。このファイル自身は LF で保存する（.gitattributes の eol=lf）。

set -u

perl - "$@" <<'PERL_GUARD'
use strict;
use warnings;
use JSON::PP;
use File::Find;
use Digest::SHA qw(sha256_hex);

$| = 1;

# ---------------------------------------------------------------- 引数
my $DEFAULT_APPLICATION_ID = 'com.metarchitect.Weaver';
my $DEFAULT_NAMESPACE      = 'com.mattermost.rnbeta';
my $DEFAULT_ABIS           = 'arm64-v8a,armeabi-v7a,x86_64';
my $MM_PROJECT_ID          = 'api-7231322553409637977-752355';

my @SUBCOMMANDS = (qw(mode ag1 ag2 ag3 ag4 ag5 ag6 ag7 ag8 ag9 ag10 abi sdk baseline pre post));
my %VALUE_OPT = map { $_ => 1 } qw(
    root dir mode signing signing-mode phase upload-to-play keystore-check cert-file expected-sha256 manifest allowlist kind
    application-id google-services firebase-project-id namespace hash-list cleartext user-ca gradle run-number
    app-version base abis tsc-log tsc-exit jest-json baseline
);
my %FLAG_OPT = ('allow-pending' => 1);

sub usage_die {
    my ($msg) = @_;
    print STDERR "weaver_android_guard: $msg\n" if defined $msg && $msg ne '';
    print STDERR "usage: weaver_android_guard.sh <" . join('|', @SUBCOMMANDS) . "> [--option value ...]\n";
    exit 2;
}

my $SUB = shift @ARGV;
usage_die('missing subcommand') unless defined $SUB;
usage_die("unknown subcommand: $SUB") unless grep { $_ eq $SUB } @SUBCOMMANDS;

my %O;
while (@ARGV) {
    my $a = shift @ARGV;
    if ($a =~ /\A--([A-Za-z0-9-]+)\z/) {
        my $name = $1;
        if ($FLAG_OPT{$name}) {
            $O{$name} = 1;
        } elsif ($VALUE_OPT{$name}) {
            usage_die("option needs a value: --$name") unless @ARGV;
            $O{$name} = shift @ARGV;
        } else {
            usage_die("unknown option: $a");
        }
    } else {
        usage_die("unknown argument: $a");
    }
}

sub opt { my ($n, $d) = @_; return exists $O{$n} ? $O{$n} : $d; }
sub need { my ($n) = @_; usage_die("missing required option: --$n") unless exists $O{$n}; return $O{$n}; }
sub enum {
    my ($n, $default, @vals) = @_;
    my $v = exists $O{$n} ? $O{$n} : $default;
    usage_die("missing required option: --$n") unless defined $v;
    usage_die("--$n must be one of: " . join('|', @vals)) unless grep { $_ eq $v } @vals;
    return $v;
}
sub root_dir {
    my $r = opt('root', '.');
    usage_die("--root is not a directory: $r") unless -d $r;
    $r =~ s{/+\z}{} unless $r eq '/';
    return $r;
}
sub digits_opt {
    my ($n, $default) = @_;
    my $v = exists $O{$n} ? $O{$n} : $default;
    usage_die("--$n must be digits only") if !defined $v || $v !~ /\A[0-9]+\z/;
    return $v;
}

# ---------------------------------------------------------------- 共通部品
my ($CUR, @FAILS) = ('');

sub begin_check { ($CUR) = @_; @FAILS = (); }
sub fail { my ($where, $msg) = @_; push @FAILS, "FAIL: $CUR: $where: $msg"; }
sub warn_line { my ($msg) = @_; print "WARN: $CUR: $msg\n"; }
sub note_line { my ($msg) = @_; print "NOTE: $CUR: $msg\n"; }
sub end_check {
    my ($suffix) = @_;
    $suffix = '' unless defined $suffix;
    print "$_\n" for @FAILS;
    my $n = scalar @FAILS;
    if ($n) {
        print "ANDROID GUARD $CUR FAILED ($n violation(s))\n";
    } else {
        print "ANDROID GUARD $CUR PASSED$suffix\n";
    }
    return $n;
}

sub slurp {
    my ($p) = @_;
    return undef unless defined $p && -f $p;
    open(my $fh, '<:raw', $p) or return undef;
    local $/;
    my $t = <$fh>;
    close($fh);
    $t = '' unless defined $t;
    $t =~ s/\r//g;
    return $t;
}
sub strip_xml_comments { my ($t) = @_; $t =~ s/<!--.*?-->//gs; return $t; }
sub strip_gradle_comments {
    my ($t) = @_;
    $t =~ s{/\*.*?\*/}{}gs;
    $t =~ s{//[^\n]*}{}g;
    return $t;
}
sub json_file {
    my ($p) = @_;
    my $t = slurp($p);
    return (undef, 'file not found or unreadable') unless defined $t;
    my $j = eval { JSON::PP->new->decode($t) };
    return (undef, 'not valid JSON') unless defined $j;
    return ($j, undef);
}
sub norm_sha { my ($v) = @_; $v = '' unless defined $v; $v =~ s/[:\s]//g; return uc $v; }
sub attr_of { my ($attrs, $name) = @_; return ($attrs =~ /\b\Q$name\E\s*=\s*["']([^"']*)["']/) ? $1 : undef; }
sub app_attrs { my ($xml) = @_; return ($xml =~ /<application\b([^>]*)>/s) ? $1 : undef; }
sub short_name { my ($n) = @_; $n =~ s/\Aandroid\.permission\.//; return $n; }

# 子プロセスを実行し、標準出力と標準エラーをまとめて返す（リスト形式の exec。シェルを通さない）
sub run_capture {
    my (@cmd) = @_;
    pipe(my $r, my $w) or return (127, '');
    my $pid = fork();
    return (127, '') unless defined $pid;
    if (!$pid) {
        close($r);
        open(STDOUT, '>&', $w);
        open(STDERR, '>&', $w);
        { no warnings 'exec'; exec(@cmd) or exit 127; }
    }
    close($w);
    local $/;
    my $out = <$r>;
    close($r);
    waitpid($pid, 0);
    return ($? >> 8, defined $out ? $out : '');
}

# ---------------------------------------------------------------- 許可リスト・権限
sub load_allowlist {
    my ($path, $appid) = @_;
    my $t = slurp($path);
    return (undef, "allowlist not found or unreadable") unless defined $t;
    my %L = (A => {}, B => {}, C => {}, pending => 0, errors => []);
    for my $line (split /\n/, $t) {
        $line =~ s/#.*//;
        $line =~ s/\A\s+|\s+\z//g;
        next if $line eq '';
        if ($line eq 'B-PENDING') {
            $L{pending} = 1;
            next;
        }
        if ($line =~ /\A([ABC])\s+(\S+)(?:\s+maxSdk=([0-9]+))?\z/) {
            my ($c, $n, $m) = ($1, $2, $3);
            $n =~ s/\{APPLICATION_ID\}/$appid/g;
            $L{$c}{$n} = defined $m ? $m : '';
        } else {
            push @{$L{errors}}, $line;
        }
    }
    return (\%L, undef);
}
sub parse_perms {
    my ($xml) = @_;
    my (%d, @order);
    while ($xml =~ /<uses-permission(?:-sdk-23)?\b([^>]*)>/g) {
        my $at = $1;
        next if $at =~ /tools:node\s*=\s*["']remove["']/;
        my $n = attr_of($at, 'android:name');
        next unless defined $n;
        next if exists $d{$n};
        $d{$n} = attr_of($at, 'android:maxSdkVersion');
        push @order, $n;
    }
    return (\%d, \@order);
}

# ---------------------------------------------------------------- AG1 権限
sub ag1 {
    my (%a) = @_;
    begin_check('AG1');
    my ($kind, $mf, $al, $appid, $pend) = @a{qw(kind manifest allowlist appid allow_pending)};
    my $where = $mf;
    my $xml = slurp($mf);
    if (!defined $xml) {
        fail($mf, 'manifest not found or unreadable');
        return end_check(" ($kind)");
    }
    my ($L, $err) = load_allowlist($al, $appid);
    if (!defined $L) {
        fail($al, $err);
        return end_check(" ($kind)");
    }
    fail($al, "unparseable allowlist line: $_") for @{$L->{errors}};
    fail($al, 'allowlist has no A (allowed) entries') unless %{$L->{A}};
    my ($decl, $order) = parse_perms(strip_xml_comments($xml));
    my %handled;
    for my $n (@$order) {
        if (exists $L->{C}{$n}) {
            fail($where, "forbidden permission declared: " . short_name($n));
            $handled{$n} = 1;
        }
    }
    if ($kind eq 'source') {
        for my $n (@$order) {
            next if $handled{$n};
            fail($where, "permission is not in the allowlist: " . short_name($n)) unless exists $L->{A}{$n};
        }
        for my $n (sort keys %{$L->{A}}) {
            if (!exists $decl->{$n}) {
                fail($where, "allowed permission is not declared: " . short_name($n));
                next;
            }
            my $want = $L->{A}{$n};
            if ($want ne '') {
                my $have = $decl->{$n};
                fail($where, "maxSdkVersion of " . short_name($n) . " must be $want (found " . (defined $have ? $have : 'none') . ')')
                    if !defined $have || $have ne $want;
            }
        }
    } else {
        for my $n (@$order) {
            next if $handled{$n};
            next if exists $L->{A}{$n} || exists $L->{B}{$n};
            if ($L->{pending}) {
                note_line("candidate (b) permission: $n");
                fail($where, "permission is not in the allowlist and (b) is not fixed yet: " . short_name($n)) unless $pend;
            } else {
                fail($where, "permission is not in the allowlist: " . short_name($n));
            }
        }
        for my $n (sort(keys %{$L->{A}}, keys %{$L->{B}})) {
            fail($where, "allowed permission is missing from the merged manifest: " . short_name($n)) unless exists $decl->{$n};
        }
        for my $n (sort keys %{$L->{A}}) {
            my $want = $L->{A}{$n};
            next if $want eq '' || !exists $decl->{$n};
            my $have = $decl->{$n};
            fail($where, "maxSdkVersion of " . short_name($n) . " must stay $want after the merge (found " . (defined $have ? $have : 'none') . ')')
                if !defined $have || $have ne $want;
        }
        my $x = strip_xml_comments($xml);
        while ($x =~ /<service\b([^>]*)>/g) {
            my $at = $1;
            my $type = attr_of($at, 'android:foregroundServiceType');
            next unless defined $type;
            my @types = grep { $_ ne '' } map { s/\A\s+|\s+\z//gr } split(/\|/, $type);
            # bundletool dump manifest は種別を16進の数値（dataSync＝0x00000001）で出す。数値のときは dataSync のビット(1)だけかを見る
            @types = ($type =~ /\A\s*0x0*1\s*\z/i) ? ('dataSync') : @types if $type =~ /\A\s*0x[0-9a-fA-F]+\s*\z/;
            if (grep { $_ ne 'dataSync' } @types or !@types) {
                my $sn = attr_of($at, 'android:name');
                fail($where, "foreground service type must be dataSync only: service " . (defined $sn ? $sn : '(unnamed)') . " has $type");
            }
        }
    }
    return end_check(" ($kind)");
}

# ---------------------------------------------------------------- AG2 google-services.json
sub collect_strings {
    my ($v, $path, $out) = @_;
    if (ref($v) eq 'HASH') {
        collect_strings($v->{$_}, ($path eq '' ? $_ : "$path.$_"), $out) for sort keys %$v;
    } elsif (ref($v) eq 'ARRAY') {
        for my $i (0 .. $#$v) { collect_strings($v->[$i], "$path\[$i\]", $out); }
    } elsif (defined $v && !ref($v)) {
        push @$out, [$path, "$v"];
    }
}
sub marker_exists {
    # 大文字小文字を区別する（Windows の作業ツリーでは -f だけだと別名の大文字小文字違いにも当たる）
    my ($root) = @_;
    opendir(my $dh, "$root/.github") or return 0;
    my $hit = grep { $_ eq 'android_firebase_real' } readdir($dh);
    closedir($dh);
    return ($hit && -f "$root/.github/android_firebase_real") ? 1 : 0;
}

sub ag2_decide {
    # 切替規則（詳細設計 §4.5）。$dummy＝ダミー値あり、$mark＝目印あり
    my (%a) = @_;
    my ($mark, $dummy, $mode, $signing, $where, $dummy_where) = @a{qw(mark dummy mode signing where dummy_where)};
    if (!$mark && $dummy) {
        if ($mode eq 'confirm' && $signing eq 'unsigned') {
            warn_line('dummy google-services.json (unsigned verification only)');
        } else {
            fail($where, "DUMMY values are allowed only for an unsigned confirm build (mode=$mode, signing=$signing)");
        }
        return 0;
    }
    if ($mark && $dummy) {
        fail($where, "DUMMY values remain although .github/android_firebase_real exists: $dummy_where");
        return 0;
    }
    if (!$mark && !$dummy) {
        fail($where, 'real-looking values without .github/android_firebase_real (the switch to the real key is incomplete)');
        return 0;
    }
    return 1;    # 目印あり・実キー形式 → 呼び出し側が実キーを検査する
}

sub ag2 {
    my (%a) = @_;
    begin_check('AG2');
    my ($phase, $root, $mode, $signing, $appid, $fpid) = @a{qw(phase root mode signing appid fpid)};
    my $mark = marker_exists($root);
    if ($phase eq 'post') {
        my $rf = "$a{dir}/resources.txt";
        my $t = slurp($rf);
        if (!defined $t) {
            fail($rf, 'file not found or unreadable');
            return end_check(' (post)');
        }
        my ($pid) = $t =~ /^string\/project_id:\s*(.*?)\s*$/m;
        my ($app) = $t =~ /^string\/google_app_id:\s*(.*?)\s*$/m;
        if (!defined $pid || $pid eq '' || !defined $app || $app eq '') {
            fail($rf, 'string/project_id and string/google_app_id must both be present and non-empty');
            return end_check(' (post)');
        }
        for my $v ($pid, $app) {
            fail($rf, "com.mattermost value found in the AAB resources: $v") if $v =~ /com\.mattermost/;
        }
        fail($rf, "project_id is the Mattermost project: $pid") if $pid eq $MM_PROJECT_ID;
        my $dummy = ($pid =~ /DUMMY/ || $app =~ /DUMMY/) ? 1 : 0;
        my $real = ag2_decide(mark => $mark, dummy => $dummy, mode => $mode, signing => $signing, where => $rf, dummy_where => 'project_id/google_app_id');
        if ($real) {
            fail($rf, "firebase project id is not registered (set WEAVER_FIREBASE_PROJECT_ID)") if !defined $fpid || $fpid eq '';
            fail($rf, "project_id '$pid' does not match the registered Firebase project id") if defined $fpid && $fpid ne '' && $pid ne $fpid;
        }
        return end_check(' (post)');
    }
    my $gs = $a{google_services};
    my ($j, $err) = json_file($gs);
    if (!defined $j) {
        fail($gs, $err);
        return end_check();
    }
    if (ref($j) ne 'HASH' || ref($j->{client}) ne 'ARRAY') {
        fail($gs, 'no client array');
        return end_check();
    }
    my @strings;
    collect_strings($j, '', \@strings);
    my @dummy_paths = map { $_->[0] } grep { $_->[1] =~ /DUMMY/ } @strings;
    my @pkgs;
    my $first_weaver;
    for my $c (@{$j->{client}}) {
        next unless ref($c) eq 'HASH';
        my $p = (ref($c->{client_info}) eq 'HASH' && ref($c->{client_info}{android_client_info}) eq 'HASH') ? $c->{client_info}{android_client_info}{package_name} : undef;
        next unless defined $p;
        push @pkgs, $p;
        $first_weaver = $c if $p eq $appid && !$first_weaver;
    }
    my $n_app = scalar grep { $_ eq $appid } @pkgs;
    fail($gs, "exactly one client for package $appid is required (found $n_app)") if $n_app != 1;
    for my $p (@pkgs) {
        fail($gs, "client package com.mattermost.* is not allowed: $p") if $p =~ /\Acom\.mattermost\./;
    }
    my $real = ag2_decide(mark => $mark, dummy => scalar(@dummy_paths) ? 1 : 0, mode => $mode, signing => $signing, where => $gs, dummy_where => join(', ', @dummy_paths));
    if ($real && $first_weaver) {
        my $pi = $j->{project_info};
        my $project_id = (ref($pi) eq 'HASH') ? $pi->{project_id} : undef;
        my $app_id = $first_weaver->{client_info}{mobilesdk_app_id};
        my $key = (ref($first_weaver->{api_key}) eq 'ARRAY' && ref($first_weaver->{api_key}[0]) eq 'HASH') ? $first_weaver->{api_key}[0]{current_key} : undef;
        fail($gs, 'project_id is empty') if !defined $project_id || $project_id eq '';
        fail($gs, 'mobilesdk_app_id is empty') if !defined $app_id || $app_id eq '';
        fail($gs, 'current_key is empty') if !defined $key || $key eq '';
        fail($gs, 'firebase project id is not registered (set WEAVER_FIREBASE_PROJECT_ID)') if !defined $fpid || $fpid eq '';
        if (defined $project_id && $project_id ne '') {
            fail($gs, "project_id is the Mattermost project: $project_id") if $project_id eq $MM_PROJECT_ID;
            fail($gs, "project_id '$project_id' does not match the registered Firebase project id") if defined $fpid && $fpid ne '' && $project_id ne $fpid;
        }
    }
    return end_check();
}

# ---------------------------------------------------------------- AG3 署名
sub ag3 {
    my (%a) = @_;
    begin_check('AG3');
    my ($phase, $mode, $signing) = @a{qw(phase mode signing)};
    if ($phase eq 'post') {
        my $cf = $a{cert_file};
        my $t = slurp($cf);
        if (!defined $t) {
            fail($cf, 'certificate file not found or unreadable');
            return end_check(' (post)');
        }
        my @sha = ($t =~ /^\s*SHA256:\s*([0-9A-Fa-f:]+)/mg);
        if ($signing eq 'unsigned') {
            fail($cf, 'the AAB must not be signed before signing but has ' . scalar(@sha) . ' SHA256 certificate line(s)') if @sha;
        } else {
            if (@sha != 1) {
                fail($cf, 'exactly one SHA256 certificate line is required (found ' . scalar(@sha) . ')');
            } else {
                fail($cf, 'the AAB is signed with an Android Debug certificate') if $t =~ /CN=Android Debug/;    # keytool の Owner の語は環境の言語で変わるため、行頭の語に頼らない
                my $exp = norm_sha($a{expected});
                if ($exp eq '') {
                    fail($cf, 'no registered certificate SHA-256 (set WEAVER_EXPECTED_CERT_SHA256)');
                } elsif (norm_sha($sha[0]) ne $exp) {
                    fail($cf, 'certificate SHA-256 does not match the registered value');
                }
            }
        }
        return end_check(' (post)');
    }
    # pre
    if ($a{upload} eq 'true') {
        fail('upload_to_play', 'manual upload only (uploading to Google Play from CI is not implemented)');
    }
    if ($signing eq 'unsigned') {
        fail('mode', 'a submission build must be signed') if $mode eq 'submission';
        return end_check(' (pre)');
    }
    if ($a{check} eq 'required') {
        my @names = qw(WEAVER_KEYSTORE_FILE WEAVER_KEYSTORE_PASSWORD WEAVER_KEY_ALIAS);
        my @missing = grep { !defined $ENV{$_} || $ENV{$_} eq '' } @names;
        if (@missing) {
            fail('env', "$_ is not set or empty") for @missing;
        } else {
            my $ks = $ENV{WEAVER_KEYSTORE_FILE};
            if (!-f $ks) {
                fail('WEAVER_KEYSTORE_FILE', 'keystore file does not exist or is not a regular file');
            } elsif (-z $ks) {
                fail('WEAVER_KEYSTORE_FILE', 'keystore file is empty');
            } else {
                my $keytool = (defined $ENV{WEAVER_KEYTOOL} && $ENV{WEAVER_KEYTOOL} ne '') ? $ENV{WEAVER_KEYTOOL} : 'keytool';
                my @cmd = ($keytool, '-list', '-v', '-keystore', $ks, '-alias', $ENV{WEAVER_KEY_ALIAS});
                push @cmd, qw(-storepass:env WEAVER_KEYSTORE_PASSWORD);
                my ($rc, $out) = run_capture(@cmd);
                if ($rc != 0) {
                    fail('keytool', 'keytool -list failed (check the store password and the key alias)');
                } else {
                    my @sha = ($out =~ /^\s*SHA256:\s*([0-9A-Fa-f:]+)/mg);
                    my $exp = norm_sha(defined $a{expected} ? $a{expected} : '');
                    if (!@sha) {
                        fail('keytool', 'no SHA256 certificate fingerprint found for the key alias');
                    } elsif ($exp eq '') {
                        fail('WEAVER_EXPECTED_CERT_SHA256', 'no registered certificate SHA-256');
                    } elsif (norm_sha($sha[0]) ne $exp) {
                        fail('keystore', 'the key certificate SHA-256 does not match the registered value');
                    }
                }
            }
        }
    }
    return end_check(' (pre)');
}

# ---------------------------------------------------------------- AG4 namespace とクラス
sub list_sources {
    my (@dirs) = @_;
    my @files;
    for my $d (@dirs) {
        next unless -d $d;
        find({wanted => sub { push @files, $File::Find::name if -f $_ && /\.(?:kt|java)\z/; }, no_chdir => 1}, $d);
    }
    return sort @files;
}
sub package_of {
    my ($path) = @_;
    my $t = slurp($path);
    return undef unless defined $t;
    $t = strip_gradle_comments($t);
    return ($t =~ /\A\s*package\s+([A-Za-z0-9_.]+)/) ? $1 : undef;
}

sub ag4 {
    my (%a) = @_;
    begin_check('AG4');
    my $ns = $a{namespace};
    if ($a{phase} eq 'post') {
        my $mf = "$a{dir}/manifest.xml";
        my $df = "$a{dir}/dex-classes.txt";
        my $m = slurp($mf);
        my $d = slurp($df);
        fail($mf, 'file not found or unreadable') unless defined $m;
        fail($df, 'file not found or unreadable') unless defined $d;
        if (defined $d && $d !~ /\S/) {
            fail($df, 'file is empty (no classes listed)');
            $d = undef;
        }
        if (defined $m && defined $d) {
            my %classes = map { my $x = $_; $x =~ s/\A\s+|\s+\z//g; ($x => 1) } split /\n/, $d;
            my $x = strip_xml_comments($m);
            my $n = 0;
            while ($x =~ /<(?:application|activity|service|receiver|provider)\b([^>]*)>/g) {
                my $name = attr_of($1, 'android:name');
                next unless defined $name && index($name, "$ns.") == 0;
                $n++;
                fail($mf, "class declared in the merged manifest is not in the dex: $name") unless $classes{$name};
            }
            fail($mf, "fewer than 3 classes under $ns found in the merged manifest ($n); the extraction may have failed") if $n < 3;
        }
        return end_check(' (post)');
    }
    my $root = $a{root};
    my $gradle = "$root/android/app/build.gradle";
    my $g = slurp($gradle);
    if (!defined $g) {
        fail($gradle, 'file not found or unreadable');
    } else {
        my @n = (strip_gradle_comments($g) =~ /^\s*namespace\s+["']([^"']+)["']/mg);
        if (@n != 1) {
            fail($gradle, 'exactly one namespace declaration is required (found ' . scalar(@n) . ")");
        } elsif ($n[0] ne $ns) {
            fail($gradle, "namespace is '$n[0]' but '$ns' is required");
        }
    }
    (my $nspath = $ns) =~ s{\.}{/}g;
    my $src_main = "$root/android/app/src/main";
    my $src_test = "$root/android/app/src/androidTest";
    my @files = list_sources($src_main, $src_test);
    my $direct_main = "$src_main/java/$nspath";
    my $direct_test = "$src_test/java/$nspath";
    for my $f (@files) {
        my $p = package_of($f);
        next unless defined $p;
        (my $rel = $f) =~ s{\A\Q$root\E/}{};
        if ($p ne $ns && index($p, "$ns.") == 0) {
            fail($rel, "package '$p' is a sub-package of the namespace '$ns' (must be exactly the namespace)");
        }
        my ($dir) = $f =~ m{\A(.*)/[^/]+\z};
        if (defined $dir && ($dir eq $direct_main || $dir eq $direct_test) && $p ne $ns) {
            fail($rel, "package '$p' differs from the namespace '$ns' although the file is in $nspath/");
        }
    }
    if (!@files) {
        fail("$root/android/app/src", 'no .kt or .java source files were read (0 files under src/main and src/androidTest)');
    } else {
        my $mf = "$src_main/AndroidManifest.xml";
        my $m = slurp($mf);
        if (!defined $m) {
            fail($mf, 'file not found or unreadable');
        } else {
            my $x = strip_xml_comments($m);
            my @rel = ($x =~ /android:name\s*=\s*["'](\.[^"']+)["']/g);
            if (!@rel) {
                fail($mf, 'no relative (".Name") class names found in the source manifest (0); the parsing may have failed');
            }
            for my $r (@rel) {
                (my $cp = substr($r, 1)) =~ s{\.}{/}g;
                my $base = "$src_main/java/$nspath/$cp";
                fail($mf, "class for $r not found as $nspath/$cp.kt or .java") unless -f "$base.kt" || -f "$base.java";
            }
        }
    }
    return end_check(' (pre)');
}

# ---------------------------------------------------------------- AG5 ブランド
sub ag5 {
    my (%a) = @_;
    begin_check('AG5');
    my ($root, $mode) = @a{qw(root mode)};
    my $consts = "$root/app/weaver/constants.ts";
    my $ct = slurp($consts);
    my $expected;
    if (!defined $ct) {
        fail($consts, 'file not found (APP_NAME cannot be read)');
    } elsif ($ct =~ /^export const APP_NAME = '([^']*)';[ \t]*$/m) {
        $expected = $1;
    } else {
        fail($consts, "APP_NAME is not defined in the one-line format: export const APP_NAME = '...';");
    }
    my $sf = "$root/android/app/src/main/res/values/strings.xml";
    my $st = slurp($sf);
    if (!defined $st) {
        fail($sf, 'file not found or unreadable');
    } else {
        my @names = (strip_xml_comments($st) =~ /<string\s+name="app_name"[^>]*>(.*?)<\/string>/gs);
        if (@names != 1) {
            fail($sf, 'exactly one app_name string is required (found ' . scalar(@names) . ')');
        } elsif (defined $expected && $names[0] ne $expected) {
            my $msg = "app_name is '$names[0]' but APP_NAME in constants.ts is '$expected'";
            if ($mode eq 'submission') { fail($sf, $msg); } else { warn_line("$sf: $msg"); }
        }
    }
    my $hl = $a{hash_list};
    my $ht = slurp($hl);
    if (!defined $ht) {
        fail($hl, 'hash list not found or unreadable');
    } else {
        my $rows = 0;
        for my $line (split /\n/, $ht) {
            next if $line =~ /\A\s*(?:#.*)?\z/;
            if ($line !~ /\A([0-9a-f]{64})  (\S+)\z/) {
                fail($hl, "malformed hash list row: $line");
                next;
            }
            my ($h, $p) = ($1, $2);
            $rows++;
            my $path = "$root/$p";
            if (!-f $path) {
                fail($p, 'file listed in the upstream hash list does not exist');
                next;
            }
            open(my $fh, '<:raw', $path) or do { fail($p, 'cannot read'); next; };
            local $/;
            my $bytes = <$fh>;
            close($fh);
            if (sha256_hex($bytes) eq $h) {
                if ($mode eq 'submission') { fail($p, 'image is still the unchanged upstream image'); }
                else { warn_line("$p: unchanged upstream image (replace it before submission)"); }
            }
        }
        fail($hl, 'hash list has no rows') unless $rows;
    }
    return end_check();
}

# ---------------------------------------------------------------- AG6 外部送信・平文通信
sub ag6 {
    my (%a) = @_;
    begin_check('AG6');
    my $want = $a{cleartext} eq 'allow' ? 'true' : 'false';
    my $user = $a{user_ca};
    if ($a{phase} eq 'post') {
        my $mf = "$a{dir}/manifest.xml";
        my $nf = "$a{dir}/nsc.txt";
        my $m = slurp($mf);
        my $n = slurp($nf);
        if (!defined $m) {
            fail($mf, 'file not found or unreadable');
        } else {
            my $at = app_attrs(strip_xml_comments($m));
            my $v = defined $at ? attr_of($at, 'android:usesCleartextTraffic') : undef;
            if (!defined $v) {
                fail($mf, 'android:usesCleartextTraffic is not set in the merged manifest (usesCleartextTraffic must be explicit)');
            } elsif ($v ne $want) {
                fail($mf, "merged android:usesCleartextTraffic is '$v' but '$want' is required (usesCleartextTraffic)");
            }
        }
        if (!defined $n) {
            fail($nf, 'file not found or unreadable');
        } elsif ($n =~ /cleartextTrafficPermitted(?:\([^)]*\))?=(true|false)/) {
            my $v = $1;
            fail($nf, "cleartextTrafficPermitted is '$v' but '$want' is required") if $v ne $want;
            my $has_user = ($n =~ /\bsrc\s*=\s*"user"/) ? 1 : 0;
            fail($nf, 'user certificates are trusted but --user-ca forbid was requested') if $user eq 'forbid' && $has_user;
            fail($nf, 'user certificates are not trusted but --user-ca keep requires them') if $user eq 'keep' && !$has_user;
        } else {
            fail($nf, 'cleartextTrafficPermitted was not found in an unrecognized nsc.txt format');
        }
        return end_check(' (post)');
    }
    my $root = $a{root};
    # ① Sentry の dsn
    my $sf = "$root/android/app/src/main/assets/sentry.options.json";
    my ($sj, $se) = json_file($sf);
    if (!defined $sj) {
        fail($sf, $se);
    } elsif (ref($sj) ne 'HASH' || !exists $sj->{dsn}) {
        fail($sf, 'dsn key not found');
    } elsif (!defined $sj->{dsn} || $sj->{dsn} ne '') {
        fail($sf, 'dsn must be an empty string');
    }
    # ② config.json
    my $cf = "$root/assets/base/config.json";
    my ($cj, $ce) = json_file($cf);
    if (!defined $cj) {
        fail($cf, $ce);
    } elsif (ref($cj) ne 'HASH') {
        fail($cf, 'not a JSON object');
    } else {
        if (!exists $cj->{SentryEnabled}) {
            fail($cf, 'SentryEnabled key not found');
        } elsif ($cj->{SentryEnabled}) {
            fail($cf, 'SentryEnabled must be false');
        }
        for my $k (qw(SentryDsnAndroid RudderApiKey)) {
            if (!exists $cj->{$k}) {
                fail($cf, "$k key not found");
            } elsif (!defined $cj->{$k} || $cj->{$k} ne '') {
                fail($cf, "$k must be an empty string");
            }
        }
    }
    # ③ マニフェスト
    my $mf = "$root/android/app/src/main/AndroidManifest.xml";
    my $m = slurp($mf);
    my $man_ct;
    if (!defined $m) {
        fail($mf, 'file not found or unreadable');
    } else {
        my $x = strip_xml_comments($m);
        my $found = 0;
        while ($x =~ /<meta-data\b([^>]*)>/g) {
            my $at = $1;
            my $n = attr_of($at, 'android:name');
            next unless defined $n && $n eq 'firebase_analytics_collection_deactivated';
            $found = 1;
            my $v = attr_of($at, 'android:value');
            fail($mf, 'firebase_analytics_collection_deactivated must be "true"') unless defined $v && $v eq 'true';
        }
        fail($mf, 'firebase_analytics_collection_deactivated meta-data not found') unless $found;
        my $at = app_attrs($x);
        $man_ct = defined $at ? attr_of($at, 'android:usesCleartextTraffic') : undef;
    }
    # ④⑤ NSC
    my $nf = "$root/android/app/src/main/res/xml/network_security_config.xml";
    my $n = slurp($nf);
    my $nsc_ct;
    if (!defined $n) {
        fail($nf, 'file not found or unreadable');
    } else {
        my $x = strip_xml_comments($n);
        if ($x =~ /<base-config\b([^>]*)>/s) {
            $nsc_ct = attr_of($1, 'cleartextTrafficPermitted');
        }
        if (!defined $nsc_ct) {
            fail($nf, 'cleartextTrafficPermitted is not set on <base-config>');
        } elsif ($nsc_ct ne $want) {
            fail($nf, "cleartextTrafficPermitted is '$nsc_ct' but '$want' is required");
        }
        my $has_user = ($x =~ /<certificates\b[^>]*\bsrc\s*=\s*["']user["']/) ? 1 : 0;
        fail($nf, 'user certificates (src="user") must be kept but are missing') if $user eq 'keep' && !$has_user;
        fail($nf, 'user certificates (src="user") must not be trusted') if $user eq 'forbid' && $has_user;
    }
    # ⑥ マニフェストの usesCleartextTraffic（NSC と食い違わず、期待値と一致）
    if (defined $m) {
        if (!defined $man_ct) {
            fail($mf, 'android:usesCleartextTraffic is not set (usesCleartextTraffic must be explicit)');
        } elsif ($man_ct ne $want) {
            fail($mf, "android:usesCleartextTraffic is '$man_ct' but '$want' is required (usesCleartextTraffic)");
        }
    }
    return end_check(' (pre)');
}

# ---------------------------------------------------------------- AG7 版
sub decl_lines {
    my ($text, $word) = @_;
    my @hit;
    for my $line (split /\n/, $text) {
        if ($line =~ /(?:\A|[{;])\s*\Q$word\E(?=[\s=(])/ || $line =~ /\b[A-Za-z_][A-Za-z0-9_]*\.\Q$word\E\s*=(?!=)/) {
            push @hit, $line;
        }
    }
    return @hit;
}
sub ag7 {
    my (%a) = @_;
    begin_check('AG7');
    my ($n, $v, $base) = @a{qw(run_number app_version base)};
    if ($a{phase} eq 'post') {
        my $mf = "$a{dir}/manifest.xml";
        my $m = slurp($mf);
        if (!defined $m || $m !~ /\S/) {
            fail($mf, 'file not found, unreadable or empty');
            return end_check(' (post)');
        }
        if ($n !~ /\A[0-9]+\z/) {
            fail('run-number', "must be digits only (got '$n')");
            return end_check(' (post)');
        }
        my $root_attrs = ($m =~ /<manifest\b([^>]*)>/s) ? $1 : '';
        my $vc = attr_of($root_attrs, 'android:versionCode');
        my $vn = attr_of($root_attrs, 'android:versionName');
        my $want = $base + $n;
        if (!defined $vc) {
            fail($mf, 'android:versionCode not found in the merged manifest');
        } elsif ($vc ne "$want") {
            fail($mf, "merged versionCode is $vc but $want (base $base + run $n) is required");
        }
        if (!defined $vn) {
            fail($mf, 'android:versionName not found in the merged manifest');
        } elsif ($vn ne $v) {
            fail($mf, "merged versionName is '$vn' but '$v' is required");
        }
        return end_check(' (post)');
    }
    my $gf = $a{gradle};
    my $g = slurp($gf);
    if (!defined $g) {
        fail($gf, 'file not found or unreadable');
        return end_check();
    }
    fail('run-number', "must be digits only (got '$n')") if $n !~ /\A[0-9]+\z/;
    fail('app-version', "must look like 2.45.0 (got '$v')") if $v !~ /\A[0-9]+\.[0-9]+\.[0-9]+\z/;
    my $t = strip_gradle_comments($g);
    my @strict = ($t =~ /^[ \t]*versionCode[ \t]+([0-9]+)[ \t]*$/mg);
    if (@strict != 1) {
        fail($gf, 'exactly one "versionCode <number>" line is required (found ' . scalar(@strict) . ')');
    } elsif ($n =~ /\A[0-9]+\z/) {
        my $want = $base + $n;
        fail($gf, "versionCode is $strict[0] but $want (base $base + run $n) is required") if $strict[0] != $want;
    }
    my @decl = decl_lines($t, 'versionCode');
    fail($gf, 'versionCode is declared in more than one place or in a form the injection cannot rewrite (' . scalar(@decl) . ' declaration lines)') if @decl != 1;
    my @vn_decl = decl_lines($t, 'versionName');
    my @vn_strict = ($t =~ /^[ \t]*versionName[ \t]+"([^"]*)"[ \t]*$/mg);
    if (@vn_decl != 1 || @vn_strict != 1) {
        fail($gf, 'exactly one versionName "<value>" declaration is required (found ' . scalar(@vn_decl) . ' declaration lines, ' . scalar(@vn_strict) . ' in the expected form)');
    } elsif ($vn_strict[0] ne $v) {
        fail($gf, "versionName is '$vn_strict[0]' but '$v' is required");
    }
    return end_check();
}

# ---------------------------------------------------------------- AG8 rnbeta
sub ag8 {
    my (%a) = @_;
    begin_check('AG8');
    if ($a{phase} eq 'post') {
        my $mf = "$a{dir}/manifest.xml";
        my $m = slurp($mf);
        if (!defined $m) {
            fail($mf, 'file not found or unreadable');
        } else {
            my $root_attrs = ($m =~ /<manifest\b([^>]*)>/s) ? $1 : '';
            my $pkg = attr_of($root_attrs, 'package');
            if (!defined $pkg) {
                fail($mf, 'package attribute not found on the manifest root');
            } else {
                fail($mf, "package '$pkg' contains rnbeta") if index($pkg, 'rnbeta') >= 0;
                fail($mf, "package '$pkg' differs from the application id '$a{appid}'") if $pkg ne $a{appid};
            }
        }
        return end_check(' (post)');
    }
    my $gf = "$a{root}/android/app/build.gradle";
    my $g = slurp($gf);
    if (!defined $g) {
        fail($gf, 'file not found or unreadable');
    } else {
        my @ids = (strip_gradle_comments($g) =~ /^\s*applicationId\s+["']([^"']+)["']/mg);
        if (@ids != 1) {
            fail($gf, 'exactly one applicationId declaration is required (found ' . scalar(@ids) . ')');
        } else {
            fail($gf, "applicationId '$ids[0]' contains rnbeta") if index($ids[0], 'rnbeta') >= 0;
        }
    }
    return end_check(' (pre)');
}

# ---------------------------------------------------------------- AG9 端末種別
sub ag9 {
    my (%a) = @_;
    begin_check('AG9');
    my $mf = $a{phase} eq 'post' ? "$a{dir}/manifest.xml" : "$a{root}/android/app/src/main/AndroidManifest.xml";
    my $m = slurp($mf);
    if (!defined $m) {
        fail($mf, 'file not found or unreadable');
    } else {
        my $at = app_attrs(strip_xml_comments($m));
        if (!defined $at) {
            fail($mf, '<application> element not found');
        } else {
            my $v = attr_of($at, 'android:resizeableActivity');
            if (!defined $v) {
                fail($mf, 'android:resizeableActivity is not set on <application> (resizeableActivity must be "false")');
            } elsif ($v ne 'false') {
                fail($mf, "android:resizeableActivity is '$v' but 'false' is required (resizeableActivity)");
            }
        }
    }
    return end_check($a{phase} eq 'post' ? ' (post)' : ' (pre)');
}

# ---------------------------------------------------------------- AG10 秘密の追跡検出
sub ag10 {
    my (%a) = @_;
    begin_check('AG10');
    my $root = $a{root};
    my ($rc, $out) = run_capture('git', '-C', $root, '-c', 'core.quotepath=off', 'ls-files', '-v');
    if ($rc != 0) {
        fail($root, 'git ls-files failed (the root must be a Git working tree)');
        return end_check();
    }
    my $skipped = 0;
    my @files;
    for my $line (split /\n/, $out) {
        next unless $line =~ /\A(\S) (.+)\z/;
        push @files, [$1, $2];
    }
    for my $f (@files) {
        my ($tag, $p) = @$f;
        my $base = ($p =~ m{([^/]+)\z}) ? $1 : $p;
        my $named = 0;
        if ($base =~ /\.(?:jks|p12|pem|p8|keystore|b64|base64)\z/i) {
            $named = 1;
        } elsif ($base =~ /\.json\z/i && ($base =~ /service[-_]?account/i || $base =~ /-adminsdk-/i)) {
            $named = 1;
        }
        if ($named && $p ne 'android/app/debug.keystore') {
            fail($p, 'tracked file looks like a signing key or service-account credential');
        }
        if ($tag =~ /\A[Ss]\z/) {
            $skipped++;
            next;
        }
        my $path = "$root/$p";
        next if -d $path;    # サブモジュール（gitlink）のディレクトリは内容を読まない
        if (!-f $path) {
            fail($p, 'tracked file is missing from the working tree (not a sparse-checkout exclusion)');
            next;
        }
        next if $p =~ m{\Aapp/weaver/__tests__/} || $p eq '.github/scripts/weaver_android_guard.sh';
        next if -s $path > 20 * 1024 * 1024;
        open(my $fh, '<:raw', $path) or do { fail($p, 'tracked file cannot be read'); next; };
        local $/;
        my $bytes = <$fh>;
        close($fh);
        if (defined $bytes && ($bytes =~ /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/ || $bytes =~ /"private_key"/)) {
            fail($p, 'tracked file contains private key material');
        }
    }
    note_line("skipped (sparse): $skipped") if $skipped;
    return end_check();
}

# ---------------------------------------------------------------- abi・sdk
sub abi {
    my (%a) = @_;
    begin_check('ABI');
    my $af = "$a{dir}/abis.txt";
    my $t = slurp($af);
    if (!defined $t || $t !~ /\S/) {
        fail($af, 'file not found, unreadable or empty (no ABI directories were extracted)');
        return end_check();
    }
    my %have = map { my $x = $_; $x =~ s/\A\s+|\s+\z//g; $x ne '' ? ($x => 1) : () } split /\n/, $t;
    my %want = map { $_ => 1 } grep { $_ ne '' } split /,/, $a{abis};
    for my $x (sort keys %have) { fail($af, "unexpected ABI in the AAB: $x") unless $want{$x}; }
    for my $x (sort keys %want) { fail($af, "expected ABI is missing from the AAB: $x") unless $have{$x}; }
    return end_check();
}
sub sdk {
    my (%a) = @_;
    begin_check('SDK');
    my $mf = "$a{dir}/manifest.xml";
    my $m = slurp($mf);
    if (!defined $m) {
        fail($mf, 'file not found or unreadable');
        return end_check();
    }
    my $sdk = ($m =~ /<uses-sdk\b([^>]*)>/s) ? $1 : '';
    my $t = attr_of($sdk, 'android:targetSdkVersion');
    my $mn = attr_of($sdk, 'android:minSdkVersion');
    if (!defined $t || $t !~ /\A[0-9]+\z/) { fail($mf, 'targetSdkVersion not found'); }
    elsif ($t < 36) { fail($mf, "targetSdkVersion is $t but 36 or more is required"); }
    if (!defined $mn || $mn !~ /\A[0-9]+\z/) { fail($mf, 'minSdkVersion not found'); }
    elsif ($mn != 30) { fail($mf, "minSdkVersion is $mn but 30 is required"); }
    my $root_attrs = ($m =~ /<manifest\b([^>]*)>/s) ? $1 : '';
    my $pkg = attr_of($root_attrs, 'package');
    if (!defined $pkg) { fail($mf, 'package attribute not found on the manifest root'); }
    elsif ($pkg ne $a{appid}) { fail($mf, "package '$pkg' differs from the application id '$a{appid}'"); }
    return end_check();
}

# ---------------------------------------------------------------- baseline
sub baseline {
    my (%a) = @_;
    begin_check('baseline');
    my ($bj, $be) = json_file($a{baseline_file});
    my %base;
    if (!defined $bj || ref($bj) ne 'HASH') {
        fail($a{baseline_file}, defined $be ? $be : 'not a JSON object');
    } else {
        for my $k (qw(tsc_errors jest_passed jest_pending)) {
            my $v = $bj->{$k};
            if (!defined $v || ref($v) || !($v =~ /\A[0-9]+\z/ || $v eq 'PENDING')) {
                fail($a{baseline_file}, "$k must be a non-negative integer or \"PENDING\"");
            } else {
                $base{$k} = $v;
            }
        }
    }
    my $code = $a{tsc_exit};
    my $tsc_count;
    if ($code !~ /\A-?[0-9]+\z/) {
        fail('tsc', "exit code is not a number: $code");
    } elsif ($code != 0 && $code != 1 && $code != 2) {
        fail('tsc', "exit code $code is not one of 0, 1, 2 (the type check did not complete)");
    } else {
        my $t = slurp($a{tsc_log});
        if (!defined $t) {
            fail($a{tsc_log}, 'tsc log not found or unreadable');
        } else {
            $tsc_count = scalar(grep { /error TS/ } split /\n/, $t);
        }
    }
    my ($jj, $je) = json_file($a{jest_json});
    my ($passed, $pending);
    if (!defined $jj || ref($jj) ne 'HASH') {
        fail($a{jest_json}, defined $je ? $je : 'not a JSON object');
    } else {
        for my $k (qw(numPassedTests numPendingTests numFailedTests numFailedTestSuites)) {
            fail($a{jest_json}, "$k not found") unless defined $jj->{$k} && !ref($jj->{$k}) && $jj->{$k} =~ /\A[0-9]+\z/;
        }
        fail($a{jest_json}, 'success is not true') unless $jj->{success};
        fail($a{jest_json}, "numFailedTests is $jj->{numFailedTests}") if defined $jj->{numFailedTests} && $jj->{numFailedTests} =~ /\A[0-9]+\z/ && $jj->{numFailedTests} > 0;
        fail($a{jest_json}, "numFailedTestSuites is $jj->{numFailedTestSuites}") if defined $jj->{numFailedTestSuites} && $jj->{numFailedTestSuites} =~ /\A[0-9]+\z/ && $jj->{numFailedTestSuites} > 0;
        $passed = $jj->{numPassedTests};
        $pending = $jj->{numPendingTests};
    }
    my $measure = sub {
        my ($key, $actual, $cmp) = @_;
        return unless defined $actual && exists $base{$key};
        my $b = $base{$key};
        if ($b eq 'PENDING') {
            if ($a{allow_pending}) {
                note_line("$key=$actual");
            } else {
                fail($a{baseline_file}, "$key baseline is PENDING (measure it and fix the value before a signed build); measured $actual");
            }
            return;
        }
        $cmp->($actual, $b);
    };
    $measure->('tsc_errors', $tsc_count, sub {
        my ($act, $b) = @_;
        if ($act > $b) { fail('tsc', "error count $act exceeds the baseline $b"); }
        elsif ($act < $b) { warn_line("tsc error count $act is below the baseline $b; lower the baseline"); }
    });
    $measure->('jest_passed', $passed, sub {
        my ($act, $b) = @_;
        fail('jest', "passed tests $act is below the baseline $b") if $act < $b;
    });
    $measure->('jest_pending', $pending, sub {
        my ($act, $b) = @_;
        fail('jest', "pending (skipped) tests $act exceeds the baseline $b") if $act > $b;
    });
    return end_check();
}

# ---------------------------------------------------------------- 署名ありの依存解決（npm ci）
sub npmci {
    # 署名ありのビルドは、ロックファイルどおりに再現する npm ci --ignore-scripts で依存を入れていること（詳細設計 4.4。S4 の開始条件）
    my (%a) = @_;
    begin_check('NPMCI');
    my $cf = "$a{root}/.github/actions/weaver-prepare-js/action.yml";
    my $t = slurp($cf);
    if (!defined $t) {
        fail($cf, 'composite action not found or unreadable (a signed build must use npm ci)');
    } else {
        fail($cf, 'a signed build requires "npm ci --ignore-scripts" in the composite action') unless $t =~ /npm ci --ignore-scripts/;
        fail($cf, 'a signed build must not use "npm install" in the composite action') if $t =~ /npm install/;
    }
    return end_check();
}

# ---------------------------------------------------------------- 集約
sub common_enums {
    my %c;
    $c{mode} = enum('mode', undef, qw(confirm submission));
    $c{signing} = enum('signing', undef, qw(signed unsigned));
    $c{cleartext} = enum('cleartext', 'forbid', qw(allow forbid));
    $c{user_ca} = enum('user-ca', 'keep', qw(keep forbid));
    return %c;
}

sub run_pre {
    my %c = common_enums();
    my $upload = enum('upload-to-play', 'false', qw(true false));
    my $check = enum('keystore-check', 'required', qw(required skip));
    my $root = root_dir();
    my $n = digits_opt('base', '1000');
    my $run = need('run-number');
    my $ver = need('app-version');
    my $appid = opt('application-id', $DEFAULT_APPLICATION_ID);
    my $fpid = exists $O{'firebase-project-id'} ? $O{'firebase-project-id'} : $ENV{WEAVER_FIREBASE_PROJECT_ID};
    my $total = 0;
    $total += ag1(kind => 'source', manifest => "$root/android/app/src/main/AndroidManifest.xml", allowlist => opt('allowlist', "$root/.github/android_permissions_allowlist.txt"), appid => $appid, allow_pending => 0);
    $total += ag2(phase => 'pre', root => $root, mode => $c{mode}, signing => $c{signing}, appid => $appid, fpid => $fpid, google_services => opt('google-services', "$root/android/app/google-services.json"));
    $total += ag3(phase => 'pre', mode => $c{mode}, signing => $c{signing}, upload => $upload, check => $check, expected => (exists $O{'expected-sha256'} ? $O{'expected-sha256'} : $ENV{WEAVER_EXPECTED_CERT_SHA256}));
    $total += ag4(phase => 'pre', root => $root, namespace => opt('namespace', $DEFAULT_NAMESPACE));
    $total += ag5(root => $root, mode => $c{mode}, hash_list => opt('hash-list', "$root/.github/android_upstream_asset_hashes.txt"));
    $total += ag6(phase => 'pre', root => $root, cleartext => $c{cleartext}, user_ca => $c{user_ca});
    $total += ag7(phase => 'pre', gradle => "$root/android/app/build.gradle", run_number => $run, app_version => $ver, base => $n);
    $total += ag8(phase => 'pre', root => $root, appid => $appid);
    $total += ag9(phase => 'pre', root => $root);
    $total += ag10(root => $root);
    $total += npmci(root => $root) if $c{signing} eq 'signed';
    return finish('pre', $c{mode}, $c{signing}, $total);
}

sub run_post {
    my %c = common_enums();
    my $dir = need('dir');
    usage_die("--dir is not a directory: $dir") unless -d $dir;
    my $root = root_dir();
    my $base = digits_opt('base', '1000');
    my $run = need('run-number');
    my $ver = need('app-version');
    my $appid = opt('application-id', $DEFAULT_APPLICATION_ID);
    my $fpid = exists $O{'firebase-project-id'} ? $O{'firebase-project-id'} : $ENV{WEAVER_FIREBASE_PROJECT_ID};
    my $expected = exists $O{'expected-sha256'} ? $O{'expected-sha256'} : $ENV{WEAVER_EXPECTED_CERT_SHA256};
    my $repo_mode = enum('signing-mode', $c{signing}, qw(signed unsigned));    # リポジトリの署名モード。AABの署名状態（--signing）とは別
    my $total = 0;
    $total += ag1(kind => 'merged', manifest => "$dir/manifest.xml", allowlist => opt('allowlist', "$root/.github/android_permissions_allowlist.txt"), appid => $appid, allow_pending => ($repo_mode eq 'unsigned' ? 1 : 0));
    $total += ag2(phase => 'post', root => $root, dir => $dir, mode => $c{mode}, signing => $c{signing}, appid => $appid, fpid => $fpid);
    $total += ag7(phase => 'post', dir => $dir, run_number => $run, app_version => $ver, base => $base);
    $total += ag3(phase => 'post', signing => $c{signing}, cert_file => "$dir/cert.txt", expected => $expected);
    $total += ag4(phase => 'post', dir => $dir, namespace => opt('namespace', $DEFAULT_NAMESPACE));
    $total += ag6(phase => 'post', dir => $dir, cleartext => $c{cleartext}, user_ca => $c{user_ca});
    $total += ag8(phase => 'post', dir => $dir, appid => $appid);
    $total += ag9(phase => 'post', dir => $dir);
    $total += abi(dir => $dir, abis => $DEFAULT_ABIS);
    $total += sdk(dir => $dir, appid => $appid);
    return finish('post', $c{mode}, $c{signing}, $total);
}

sub finish {
    my ($name, $mode, $signing, $total) = @_;
    if ($total) {
        print "ANDROID GUARD $name FAILED ($total violation(s))\n";
        return 1;
    }
    print "ANDROID GUARD $name PASSED ($mode, $signing)\n";
    return 0;
}

# ---------------------------------------------------------------- ディスパッチ
sub phase_opt { return enum('phase', 'pre', qw(pre post)); }
my $rc = 0;

if ($SUB eq 'mode') {
    my $root = root_dir();
    print marker_exists($root) ? "signed\n" : "unsigned\n";
    exit 0;
} elsif ($SUB eq 'ag1') {
    my $kind = enum('kind', undef, qw(source merged));
    $rc = ag1(kind => $kind, manifest => need('manifest'), allowlist => need('allowlist'), appid => opt('application-id', $DEFAULT_APPLICATION_ID), allow_pending => ($O{'allow-pending'} ? 1 : 0));
} elsif ($SUB eq 'ag2') {
    my $phase = phase_opt();
    my $root = root_dir();
    my $fpid = exists $O{'firebase-project-id'} ? $O{'firebase-project-id'} : $ENV{WEAVER_FIREBASE_PROJECT_ID};
    my %x = (phase => $phase, root => $root, mode => enum('mode', 'confirm', qw(confirm submission)), signing => enum('signing', 'unsigned', qw(signed unsigned)), appid => opt('application-id', $DEFAULT_APPLICATION_ID), fpid => $fpid);
    if ($phase eq 'post') { $x{dir} = need('dir'); } else { $x{google_services} = opt('google-services', "$root/android/app/google-services.json"); }
    $rc = ag2(%x);
} elsif ($SUB eq 'ag3') {
    my $phase = phase_opt();
    if ($phase eq 'post') {
        $rc = ag3(phase => 'post', signing => enum('signing', undef, qw(signed unsigned)), cert_file => need('cert-file'), expected => (exists $O{'expected-sha256'} ? $O{'expected-sha256'} : $ENV{WEAVER_EXPECTED_CERT_SHA256}));
    } else {
        $rc = ag3(phase => 'pre', mode => enum('mode', undef, qw(confirm submission)), signing => enum('signing', undef, qw(signed unsigned)), upload => enum('upload-to-play', 'false', qw(true false)), check => enum('keystore-check', 'required', qw(required skip)), expected => (exists $O{'expected-sha256'} ? $O{'expected-sha256'} : $ENV{WEAVER_EXPECTED_CERT_SHA256}));
    }
} elsif ($SUB eq 'ag4') {
    my $phase = phase_opt();
    my %x = (phase => $phase, namespace => opt('namespace', $DEFAULT_NAMESPACE));
    if ($phase eq 'post') { $x{dir} = need('dir'); } else { $x{root} = root_dir(); }
    $rc = ag4(%x);
} elsif ($SUB eq 'ag5') {
    my $root = root_dir();
    $rc = ag5(root => $root, mode => enum('mode', undef, qw(confirm submission)), hash_list => opt('hash-list', "$root/.github/android_upstream_asset_hashes.txt"));
} elsif ($SUB eq 'ag6') {
    my $phase = phase_opt();
    my %x = (phase => $phase, cleartext => enum('cleartext', 'forbid', qw(allow forbid)), user_ca => enum('user-ca', 'keep', qw(keep forbid)));
    if ($phase eq 'post') { $x{dir} = need('dir'); } else { $x{root} = root_dir(); }
    $rc = ag6(%x);
} elsif ($SUB eq 'ag7') {
    my $phase = phase_opt();
    my $run = need('run-number');
    my $ver = need('app-version');
    my $base = digits_opt('base', '1000');
    my %x = (phase => $phase, run_number => $run, app_version => $ver, base => $base);
    if ($phase eq 'post') { $x{dir} = need('dir'); } else { $x{gradle} = need('gradle'); }
    $rc = ag7(%x);
} elsif ($SUB eq 'ag8') {
    my $phase = phase_opt();
    my %x = (phase => $phase, appid => opt('application-id', $DEFAULT_APPLICATION_ID));
    if ($phase eq 'post') { $x{dir} = need('dir'); } else { $x{root} = root_dir(); }
    $rc = ag8(%x);
} elsif ($SUB eq 'ag9') {
    my $phase = phase_opt();
    my %x = (phase => $phase);
    if ($phase eq 'post') { $x{dir} = need('dir'); } else { $x{root} = root_dir(); }
    $rc = ag9(%x);
} elsif ($SUB eq 'ag10') {
    $rc = ag10(root => root_dir());
} elsif ($SUB eq 'abi') {
    $rc = abi(dir => need('dir'), abis => opt('abis', $DEFAULT_ABIS));
} elsif ($SUB eq 'sdk') {
    $rc = sdk(dir => need('dir'), appid => opt('application-id', $DEFAULT_APPLICATION_ID));
} elsif ($SUB eq 'baseline') {
    $rc = baseline(tsc_log => need('tsc-log'), tsc_exit => need('tsc-exit'), jest_json => need('jest-json'), baseline_file => need('baseline'), allow_pending => ($O{'allow-pending'} ? 1 : 0));
} elsif ($SUB eq 'pre') {
    $rc = run_pre();
} elsif ($SUB eq 'post') {
    $rc = run_post();
}
exit($rc ? 1 : 0);
PERL_GUARD
exit $?
