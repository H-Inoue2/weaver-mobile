#!/usr/bin/env bash
# Weaver ビルド時ガード（K-39/R1。詳細設計 §3.13）。
#
# 使い方: weaver_release_guard.sh [--release] [ROOT]
#   ROOT の既定は "."（リポジトリの直下）。手元やテストでは、フィクスチャのフォルダを渡す。
#   終了コード: 0＝合格 / 1＝違反あり（全件を列挙してから終了） / 2＝使い方の誤り（不明なオプション・ROOT が無い）
#
# 検査（G1〜G5）:
#   G1 常に: ios/Mattermost.xcodeproj/project.pbxproj の TARGETED_DEVICE_FAMILY（条件付きキーを含む全件）が 1 で、件数が6以上
#   G2 常に: ios/Mattermost/Info.plist の NS*UsageDescription の値に $(PRODUCT_NAME) と Mattermost（大文字小文字不問）が無い
#   G3 --release: app/weaver 配下（__tests__ と *.test.ts(x) を除く）にプレースホルダ（穴埋め記号など）が残っていない
#   G4 --release: constants.ts の URL・メールが確定値（https・空白なし・mattermost を含まない）
#   G5 常に: constants.ts の7定数が `export const NAME = '...';` の1行書式で定義されている
#
# 実装の方針: 外部コマンドは bash と perl だけ（macOS ランナーと Git Bash の両方で動かすため）。
# 検査する全ファイルの CR（0x0D）を取り除いてから解析する（Windows の作業ツリーは CRLF になりうる）。
# このファイル自身は LF で保存する（.gitattributes の eol=lf）。

set -u

RELEASE=0
ROOT=""
ROOT_SET=0

usage() {
    echo "usage: weaver_release_guard.sh [--release] [ROOT]" >&2
}

for ARG in "$@"; do
    case "$ARG" in
        --release)
            RELEASE=1
            ;;
        -*)
            echo "weaver_release_guard: unknown option: $ARG" >&2
            usage
            exit 2
            ;;
        *)
            if [ "$ROOT_SET" -eq 1 ]; then
                echo "weaver_release_guard: too many arguments: $ARG" >&2
                usage
                exit 2
            fi
            ROOT="$ARG"
            ROOT_SET=1
            ;;
    esac
done

if [ "$ROOT_SET" -eq 0 ]; then
    ROOT="."
fi

if [ ! -d "$ROOT" ]; then
    echo "weaver_release_guard: ROOT is not a directory: $ROOT" >&2
    usage
    exit 2
fi

if [ "$RELEASE" -eq 1 ]; then
    MODE="release"
else
    MODE="basic"
fi

perl - "$MODE" "$ROOT" <<'PERL_GUARD'
use strict;
use warnings;
use utf8;
use File::Find;

binmode(STDOUT, ':encoding(UTF-8)');

my ($mode, $root) = @ARGV;
my $release = ($mode eq 'release') ? 1 : 0;
my @violations;

sub slurp {
    my ($path) = @_;
    open(my $fh, '<:raw', $path) or return undef;
    local $/;
    my $text = <$fh>;
    close($fh);
    utf8::decode($text);
    $text =~ s/\r//g;
    return $text;
}

sub violation {
    my ($where, $message) = @_;
    push @violations, "FAIL: $where: $message";
}

# ---- G1: TARGETED_DEVICE_FAMILY（iPhone 専用）----
my $pbx = 'ios/Mattermost.xcodeproj/project.pbxproj';
my $pbx_text = slurp("$root/$pbx");
if (!defined $pbx_text) {
    violation($pbx, 'file not found (TARGETED_DEVICE_FAMILY cannot be checked)');
} else {
    my $count = 0;
    while ($pbx_text =~ /"?TARGETED_DEVICE_FAMILY(?:\[[^\]]*\])?"?\s*=\s*([^;]*);/g) {
        my $value = $1;
        $count++;
        (my $clean = $value) =~ s/[\s"(),]//g;
        if ($clean ne '1') {
            violation($pbx, "TARGETED_DEVICE_FAMILY must be 1 (iPhone only) but is '$clean'");
        }
    }
    if ($count < 6) {
        violation($pbx, "TARGETED_DEVICE_FAMILY found $count time(s); at least 6 are expected");
    }
}

# ---- G2: 許可ダイアログの文言 ----
my $plist = 'ios/Mattermost/Info.plist';
my $plist_text = slurp("$root/$plist");
if (!defined $plist_text) {
    violation($plist, 'file not found (NS*UsageDescription cannot be checked)');
} else {
    while ($plist_text =~ m{<key>(NS\w*UsageDescription)</key>\s*<string>(.*?)</string>}gs) {
        my ($key, $value) = ($1, $2);
        if (index($value, '$(PRODUCT_NAME)') >= 0) {
            violation($plist, "$key contains \$(PRODUCT_NAME); write the app name Weaver directly");
        }
        if ($value =~ /mattermost/i) {
            violation($plist, "$key contains 'Mattermost'");
        }
    }
}

# ---- G3: プレースホルダ残り（--release のみ）----
if ($release) {
    my $dir = "$root/app/weaver";
    my @files;
    if (-d $dir) {
        find(sub {
            return unless -f $_;
            return unless $_ =~ /\.tsx?$/;
            return if $_ =~ /\.test\.tsx?$/;
            return if $File::Find::name =~ m{/__tests__/};
            push @files, $File::Find::name;
        }, $dir);
    }
    my @markers = ('⟦', '⟧', '要確定', '確定】', 'TODO_WEAVER');
    for my $path (sort @files) {
        my $text = slurp($path);
        next unless defined $text;
        (my $rel = $path) =~ s/^\Q$root\E\/?//;
        for my $marker (@markers) {
            if (index($text, $marker) >= 0) {
                violation($rel, "placeholder '$marker' remains; fix it before a submission build");
            }
        }
    }
}

# ---- G5: constants.ts の書式（常に）と G4: 値の検査（--release のみ）----
my $constants = 'app/weaver/constants.ts';
my @names = qw(APP_NAME PRIVACY_POLICY_URL TERMS_OF_SERVICE_URL SUPPORT_URL REPORT_A_PROBLEM_EMAIL NOTIFICATION_HELP_URL ACCOUNT_DELETION_URL);
my %value;
my $constants_text = slurp("$root/$constants");
if (!defined $constants_text) {
    violation($constants, 'file not found (the 7 constants cannot be checked)');
} else {
    for my $name (@names) {
        if ($constants_text =~ /^export const \Q$name\E = '([^']*)';[ \t]*$/m) {
            $value{$name} = $1;
        } else {
            violation($constants, "$name is not defined in the one-line format: export const $name = '...';");
        }
    }
}

sub check_value {
    my ($name, $kind, $required) = @_;
    return unless exists $value{$name};
    my $text = $value{$name};
    if ($text eq '') {
        violation($constants, "$name is empty") if $required;
        return;
    }
    violation($constants, "$name contains whitespace") if $text =~ /\s/;
    violation($constants, "$name contains 'mattermost'") if $text =~ /mattermost/i;
    if ($kind eq 'url') {
        violation($constants, "$name must start with https://") unless $text =~ m{^https://};
    } else {
        violation($constants, "$name must contain an @") unless index($text, '@') >= 0;
    }
}

if ($release) {
    check_value('PRIVACY_POLICY_URL', 'url', 1);
    check_value('SUPPORT_URL', 'url', 1);
    check_value('REPORT_A_PROBLEM_EMAIL', 'mail', 1);
    check_value('TERMS_OF_SERVICE_URL', 'url', 0);
    check_value('NOTIFICATION_HELP_URL', 'url', 0);
    check_value('ACCOUNT_DELETION_URL', 'url', 0);
}

if (@violations) {
    print "$_\n" for @violations;
    print 'RELEASE GUARD FAILED (' . scalar(@violations) . " violation(s), mode: $mode)\n";
    exit 1;
}

print $release ? "RELEASE GUARD PASSED (--release)\n" : "RELEASE GUARD PASSED (basic)\n";
exit 0;
PERL_GUARD
exit $?
