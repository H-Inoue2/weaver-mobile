#!/usr/bin/env bash
# Weaver Android: versionCode / versionName 注入（K-79/R0。詳細設計 §5.5・FR-03）。
#
# 使い方: weaver_android_inject_version.sh --gradle FILE --run-number N --app-version V [--base B]
#   versionCode = B + N（B の既定は 1000）、versionName = V を android/app/build.gradle の該当2行へ書く。
#   終了コード: 0＝成功 / 1＝検証・事後検査・置換の失敗（ファイルは書く前と同一） / 2＝使い方の誤り
#
# 方針:
#   - 書く前に N・V の書式と、対象行（`versionCode <数字>`・`versionName "<値>"`）がそれぞれちょうど1行であることを確かめる。
#   - 一時ファイル（同じディレクトリ）へ書き、weaver_android_guard.sh の ag7（宣言形の規則を含む）で事後検査してから mv で置換する。
#     検査・置換に失敗したら一時ファイルを消し、元のファイルには触れない。
#   - インデント・行末（LF／CRLF）・権限を保つ。同じ引数で2回実行しても結果は同じ（冪等）。
#   - 書き込む先は --gradle のファイルだけ。外部コマンドは bash・perl・mktemp・cp・mv・rm のみ。

set -u

usage() {
    echo "usage: weaver_android_inject_version.sh --gradle FILE --run-number N --app-version V [--base B]" >&2
}

GRADLE=""
RUN_NUMBER=""
APP_VERSION=""
BASE="1000"
GRADLE_SET=0
RUN_SET=0
VER_SET=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --gradle)
            [ "$#" -ge 2 ] || { usage; exit 2; }
            GRADLE="$2"; GRADLE_SET=1; shift 2 ;;
        --run-number)
            [ "$#" -ge 2 ] || { usage; exit 2; }
            RUN_NUMBER="$2"; RUN_SET=1; shift 2 ;;
        --app-version)
            [ "$#" -ge 2 ] || { usage; exit 2; }
            APP_VERSION="$2"; VER_SET=1; shift 2 ;;
        --base)
            [ "$#" -ge 2 ] || { usage; exit 2; }
            BASE="$2"; shift 2 ;;
        *)
            echo "weaver_android_inject_version: unknown option: $1" >&2
            usage
            exit 2 ;;
    esac
done

if [ "$GRADLE_SET" -eq 0 ] || [ "$RUN_SET" -eq 0 ] || [ "$VER_SET" -eq 0 ]; then
    usage
    exit 2
fi

case "$BASE" in
    ''|*[!0-9]*)
        echo "weaver_android_inject_version: --base must be digits only" >&2
        usage
        exit 2 ;;
esac

fail() {
    echo "FAIL: INJECT: $1"
    exit 1
}

case "$RUN_NUMBER" in
    ''|*[!0-9]*) fail "--run-number must be digits only (got '$RUN_NUMBER')" ;;
esac
if ! printf '%s' "$APP_VERSION" | perl -ne 'exit(($_ =~ /\A[0-9]+\.[0-9]+\.[0-9]+\z/) ? 0 : 1)'; then
    fail "--app-version must look like 2.45.0 (got '$APP_VERSION')"
fi
[ -f "$GRADLE" ] || fail "build.gradle not found: $GRADLE"

VERSION_CODE=$((BASE + RUN_NUMBER))
TMP="$(mktemp "${GRADLE}.XXXXXX")" || fail "cannot create a temporary file next to $GRADLE"
cleanup() {
    rm -f "$TMP"
}
trap cleanup EXIT

# 一時ファイルは元ファイルの権限のコピーとして作る（内容は perl が上書きする）
cp -p "$GRADLE" "$TMP" || fail "cannot copy $GRADLE"

perl -e '
use strict;
use warnings;
my ($file, $code, $name, $out) = @ARGV;
open(my $in, "<:raw", $file) or exit 3;
local $/;
my $text = <$in>;
close($in);
my @lines = split(/(?<=\n)/, $text);
my ($nc, $nn) = (0, 0);
for my $l (@lines) {
    (my $x = $l) =~ s/\r?\n\z//;
    $nc++ if $x =~ /^\s*versionCode\s+\d+\s*$/;
    $nn++ if $x =~ /^\s*versionName\s+"[^"]*"\s*$/;
}
if ($nc != 1) { print "FAIL: INJECT: versionCode line must appear exactly once (found $nc)\n"; exit 4; }
if ($nn != 1) { print "FAIL: INJECT: versionName line must appear exactly once (found $nn)\n"; exit 4; }
for my $l (@lines) {
    $l =~ s/^([ \t]*)versionCode[ \t]+[0-9]+[ \t]*(\r?\n?)\z/$1versionCode $code$2/;
    $l =~ s/^([ \t]*)versionName[ \t]+"[^"]*"[ \t]*(\r?\n?)\z/$1versionName "$name"$2/;
}
open(my $o, ">:raw", $out) or exit 3;
print $o @lines;
close($o) or exit 3;
' "$GRADLE" "$VERSION_CODE" "$APP_VERSION" "$TMP"
rc=$?
if [ "$rc" -ne 0 ]; then
    [ "$rc" -eq 4 ] && exit 1
    fail "cannot rewrite $GRADLE"
fi

# 事後検査: AG7 と同じ規則（宣言形の定義を含む）。失敗したら置換しない
GUARD="$(cd "$(dirname "$0")" && pwd)/weaver_android_guard.sh"
if ! bash "$GUARD" ag7 --gradle "$TMP" --run-number "$RUN_NUMBER" --app-version "$APP_VERSION" --base "$BASE" > /dev/null; then
    echo "FAIL: INJECT: post-check (AG7) failed; $GRADLE is unchanged"
    exit 1
fi

if ! mv -f "$TMP" "$GRADLE"; then
    echo "FAIL: INJECT: cannot replace $GRADLE; it is unchanged"
    exit 1
fi
trap - EXIT
echo "INJECT OK: versionCode=$VERSION_CODE versionName=$APP_VERSION"
exit 0
