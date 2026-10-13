#!/usr/bin/env bash
# Weaver Android: 16KB ページサイズ整列の検査（K-79/R0。詳細設計 §5.7・FR-12）。
#
# 使い方: weaver_android_16k_check.sh <APKファイル または 展開済みディレクトリ>
#   環境変数: WEAVER_OBJDUMP（llvm-objdump のパス。既定は PATH 上の llvm-objdump）
#             WEAVER_ZIPALIGN（zipalign のパス。既定は PATH 上の zipalign。入力が APK のときだけ使う）
#   終了コード: 0＝合格 / 1＝違反あり・解析不能・対象なし / 2＝使い方の誤り
#
# 規則: lib/arm64-v8a/*.so と lib/x86_64/*.so の全件について、`objdump -p` の全 LOAD セグメントの align が 2**14 以上。
#       64ビットの .so が1件も無ければ違反（空振り防止）。armeabi-v7a は対象外。
#       入力が APK のときは `zipalign -c -P 16 -v 4 <apk>` も成功すること（ZIP 整列だけで合格にはしない）。
#       bundletool dump config の PAGE_ALIGNMENT は判定に使わない。
# 出力: `OK 2**N <パス>` / `FAIL 2**N <パス>` を1件1行、末尾に `P16 CHECKED: <n> shared object(s), violations: <k>`。
# 実装: bash と perl（IO::Uncompress::Unzip でAPKの .so だけを一時ディレクトリへ展開。読み取りと一時展開のみで、APKは実行しない）。

set -u

perl - "$@" <<'PERL_16K'
use strict;
use warnings;
use File::Find;
use File::Temp qw(tempdir);
use File::Path qw(make_path);
use IO::Uncompress::Unzip qw($UnzipError);

$| = 1;
my $input = shift @ARGV;
if (!defined $input || @ARGV) {
    print STDERR "usage: weaver_android_16k_check.sh <apk-file|extracted-directory>\n";
    exit 2;
}
if (!-e $input) {
    print STDERR "weaver_android_16k_check: input not found: $input\n";
    print STDERR "usage: weaver_android_16k_check.sh <apk-file|extracted-directory>\n";
    exit 2;
}

my $objdump = (defined $ENV{WEAVER_OBJDUMP} && $ENV{WEAVER_OBJDUMP} ne '') ? $ENV{WEAVER_OBJDUMP} : 'llvm-objdump';
my $zipalign = (defined $ENV{WEAVER_ZIPALIGN} && $ENV{WEAVER_ZIPALIGN} ne '') ? $ENV{WEAVER_ZIPALIGN} : 'zipalign';
my $violations = 0;
my $checked = 0;

sub run_capture {
    my (@cmd) = @_;
    pipe(my $r, my $w) or return (127, '');
    my $pid = fork();
    return (127, '') unless defined $pid;
    if (!$pid) {
        close($r);
        open(STDOUT, '>&', $w);
        open(STDERR, '>&', $w);
        exec(@cmd) or exit 127;
    }
    close($w);
    local $/;
    my $out = <$r>;
    close($r);
    waitpid($pid, 0);
    return ($? >> 8, defined $out ? $out : '');
}

my $root;
my $is_apk = -f $input ? 1 : 0;
if ($is_apk) {
    $root = tempdir('weaver-16k-XXXXXX', TMPDIR => 1, CLEANUP => 1);
    my $z = IO::Uncompress::Unzip->new($input, Name => undef, Append => 0) or do {
        print "FAIL: cannot read the APK as a ZIP file: $input\n";
        print "P16 CHECKED: 0 shared object(s), violations: 1\n";
        exit 1;
    };
    my $status;
    for ($status = 1; $status > 0; $status = $z->nextStream()) {
        my $name = $z->getHeaderInfo()->{Name};
        if (defined $name && $name =~ m{\Alib/(?:arm64-v8a|x86_64)/[^/]+\.so\z}) {
            my $dest = "$root/$name";
            (my $dir = $dest) =~ s{/[^/]+\z}{};
            make_path($dir);
            open(my $out, '>:raw', $dest) or next;
            my $buf;
            while (($status = $z->read($buf)) > 0) { print $out $buf; }
            close($out);
        }
        last if $status < 0;
    }
    $z->close();
} else {
    $root = $input;
    $root =~ s{/+\z}{} unless $root eq '/';
}

my @sos;
for my $abi (qw(arm64-v8a x86_64)) {
    my $d = "$root/lib/$abi";
    next unless -d $d;
    opendir(my $dh, $d) or next;
    for my $f (sort readdir($dh)) {
        push @sos, "lib/$abi/$f" if $f =~ /\.so\z/ && -f "$d/$f";
    }
    closedir($dh);
}

for my $rel (@sos) {
    $checked++;
    my ($rc, $out) = run_capture($objdump, '-p', "$root/$rel");
    my @aligns;
    if ($rc == 0) {
        for my $line (split /\n/, $out) {
            push @aligns, $1 if $line =~ /\bLOAD\b.*\balign 2\*\*([0-9]+)/;
        }
    }
    if ($rc != 0 || !@aligns) {
        print "FAIL 2**? $rel\n";
        print "FAIL: cannot analyze $rel (objdump rc=$rc, LOAD segments found: " . scalar(@aligns) . ")\n";
        $violations++;
        next;
    }
    my ($min) = sort { $a <=> $b } @aligns;
    if ($min >= 14) {
        print "OK 2**$min $rel\n";
    } else {
        print "FAIL 2**$min $rel\n";
        $violations++;
    }
}

if (!@sos) {
    print "FAIL: no 64-bit shared objects (lib/arm64-v8a, lib/x86_64) were found in $input; nothing was checked\n";
    $violations++;
}

if ($is_apk) {
    my ($rc, $out) = run_capture($zipalign, '-c', '-P', '16', '-v', '4', $input);
    if ($rc != 0) {
        print "FAIL: zipalign -c -P 16 -v 4 failed (rc=$rc) for $input\n";
        $violations++;
    }
}

print "P16 CHECKED: $checked shared object(s), violations: $violations\n";
exit($violations ? 1 : 0);
PERL_16K
exit $?
