#!/usr/bin/env bash
# Weaver ビルド時ガード（K-39/R1。詳細設計 §3.13）。
#
# 使い方: weaver_release_guard.sh [--release] [ROOT]
#   ROOT の既定は "."（リポジトリの直下）。手元やテストでは、フィクスチャのフォルダを渡す。
#   終了コード: 0＝合格 / 1＝違反あり（全件を列挙してから終了） / 2＝使い方の誤り（不明なオプション・ROOT が無い）
#
# K-79 追加: weaver_release_guard.sh [--release] [--shared-only] [ROOT]
#   --shared-only は G1・G2（ios/ 配下の検査）を実行しない。Android のビルドが共用する G3〜G5 だけを使うため。
#   合格表示は `RELEASE GUARD PASSED (basic, shared-only)` / `(--release, shared-only)`。失敗時の末尾行の mode にも shared-only が付く。
#   オプション無しの挙動・出力は変えない。
#
# K-139 追加: IG1（ios/ を読むので --shared-only では実行しない）
#   IG1 A: 通知拡張 NotificationService.swift の badge 代入が、ApplicationIsForeground が "true" のときだけ実行される if の直下の nil 代入であること。
#   IG1 B: AppDelegate.swift が前面フラグを DidBecomeActive で true・WillResignActive で false に、関数の直下で書いていること。
#   形が違えば「人手確認が必要」として FAIL にする。合格時は何も出力しない（既存の出力は変えない）。
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
SHARED=0
ROOT=""
ROOT_SET=0

usage() {
    echo "usage: weaver_release_guard.sh [--release] [--shared-only] [ROOT]" >&2
}

for ARG in "$@"; do
    case "$ARG" in
        --release)
            RELEASE=1
            ;;
        --shared-only)
            SHARED=1
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

perl - "$MODE" "$ROOT" "$SHARED" <<'PERL_GUARD'
use strict;
use warnings;
use utf8;
use File::Find;

binmode(STDOUT, ':encoding(UTF-8)');

my ($mode, $root, $shared) = @ARGV;
my $release = ($mode eq 'release') ? 1 : 0;
my @violations;
my $mode_label = $mode . ($shared ? ', shared-only' : '');

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

my $check = "";    # --shared-only のときだけ違反行に検査名（G3〜G5）を付ける（既定の出力は不変）
sub violation {
    my ($where, $message) = @_;
    push @violations, ($shared && $check ne "") ? "FAIL: $check: $where: $message" : "FAIL: $where: $message";
}

# ---- G1: TARGETED_DEVICE_FAMILY（iPhone 専用）----
my $pbx = 'ios/Mattermost.xcodeproj/project.pbxproj';
my $pbx_text = $shared ? '' : slurp("$root/$pbx");
if ($shared) {
    # --shared-only: ios/ は読まない
} elsif (!defined $pbx_text) {
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
my $plist_text = $shared ? '' : slurp("$root/$plist");
if ($shared) {
    # --shared-only: ios/ は読まない
} elsif (!defined $plist_text) {
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
$check = "G3";
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
$check = "G5";
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

$check = "G4";
if ($release) {
    check_value('PRIVACY_POLICY_URL', 'url', 1);
    check_value('SUPPORT_URL', 'url', 1);
    check_value('REPORT_A_PROBLEM_EMAIL', 'mail', 1);
    check_value('TERMS_OF_SERVICE_URL', 'url', 0);
    check_value('NOTIFICATION_HELP_URL', 'url', 0);
    check_value('ACCOUNT_DELETION_URL', 'url', 0);
}

# ---- IG1: 通知拡張のバッジ・前面フラグの書き込みの形（K-139）----
# 読む側(A): NotificationService.swift の badge 代入が ApplicationIsForeground == "true" の if の直下の nil 代入だけであること。
# 書く側(B): AppDelegate.swift の DidBecomeActive が true を・WillResignActive が false を関数の直下で書くこと。
# 形が違えば「人手確認が必要」として FAIL にする。--shared-only では ios/ を読まない。合格時は何も出力しない。
sub ig1_lex {
    # 単一パスの字句走査。NC=コメントだけを空白化、MK=コメントと文字列の中身を空白化（引用符は残す）。改行位置と長さは入力と同じ。
    my ($t) = @_;
    my $bs = chr(92);
    my @c = split //, $t;
    my $n = scalar(@c);
    my @nc = @c;
    my @mk = @c;
    my $i = 0;
    my @st = ('code');
    my (@pd, @hn);
    my $bad = '';
    my $blank = sub {
        my ($arr, $k) = @_;
        $arr->[$k] = ' ' if $arr->[$k] ne "\n";
    };
    while ($i < $n) {
        my $s = $st[-1];
        my $ch = $c[$i];
        my $nx = ($i + 1 < $n) ? $c[$i + 1] : '';
        if ($s eq 'code') {
            if ($ch eq '/' && $nx eq '/') {
                push @st, 'line';
                for my $k ($i, $i + 1) { $blank->(\@nc, $k); $blank->(\@mk, $k); }
                $i += 2;
                next;
            }
            if ($ch eq '/' && $nx eq '*') {
                push @st, 'block';
                $pd[$#st] = 1;
                for my $k ($i, $i + 1) { $blank->(\@nc, $k); $blank->(\@mk, $k); }
                $i += 2;
                next;
            }
            if ($ch eq '#') {
                my $h = 0;
                $h++ while ($i + $h < $n && $c[$i + $h] eq '#');
                if ($i + $h < $n && $c[$i + $h] eq '"') {
                    if ($i + $h + 2 < $n && $c[$i + $h + 1] eq '"' && $c[$i + $h + 2] eq '"') { $bad = 'triple'; last; }
                    push @st, 'raw';
                    $hn[$#st] = $h;
                    $i += $h + 1;
                    next;
                }
                $i++;
                next;
            }
            if ($ch eq '"' && $nx eq '"' && $i + 2 < $n && $c[$i + 2] eq '"') { $bad = 'triple'; last; }
            if ($ch eq '"') { push @st, 'str'; }
            $i++;
            next;
        } elsif ($s eq 'line') {
            if ($ch eq "\n") { pop @st; $i++; next; }
            $blank->(\@nc, $i); $blank->(\@mk, $i);
            $i++;
            next;
        } elsif ($s eq 'block') {
            if ($ch eq '/' && $nx eq '*') {
                $pd[$#st]++;
                for my $k ($i, $i + 1) { $blank->(\@nc, $k); $blank->(\@mk, $k); }
                $i += 2;
                next;
            }
            if ($ch eq '*' && $nx eq '/') {
                for my $k ($i, $i + 1) { $blank->(\@nc, $k); $blank->(\@mk, $k); }
                $i += 2;
                pop @st if (--$pd[$#st] == 0);
                next;
            }
            $blank->(\@nc, $i); $blank->(\@mk, $i);
            $i++;
            next;
        } elsif ($s eq 'raw') {
            my $h = $hn[$#st];
            if ($ch eq "\n") { $bad = 'open'; last; }
            my $hashes = 1;
            for my $k (1 .. $h) { $hashes = 0 unless ($i + $k < $n && $c[$i + $k] eq '#'); }
            if ($ch eq '"' && $hashes) { pop @st; $i += $h + 1; next; }
            if ($ch eq $bs && $hashes && $i + $h + 1 < $n && $c[$i + $h + 1] eq '(') {
                push @st, 'interp';
                $pd[$#st] = 1;
                $blank->(\@mk, $_) for ($i .. $i + $h + 1);
                $i += $h + 2;
                next;
            }
            $blank->(\@mk, $i);
            $i++;
            next;
        } elsif ($s eq 'str') {
            if ($ch eq "\n") { $bad = 'open'; last; }
            if ($ch eq $bs && $nx eq '(') {
                push @st, 'interp';
                $pd[$#st] = 1;
                for my $k ($i, $i + 1) { $blank->(\@mk, $k); }
                $i += 2;
                next;
            }
            if ($ch eq $bs) {
                for my $k ($i, $i + 1) { $blank->(\@mk, $k) if $k < $n; }
                $i += 2;
                next;
            }
            if ($ch eq '"') { pop @st; $i++; next; }
            $blank->(\@mk, $i);
            $i++;
            next;
        } else {
            # interp（文字列補間の中。丸括弧の深さで終端を判定し、中の引用符は入れ子の文字列として積む）
            $blank->(\@mk, $i);
            if ($ch eq "\n") { $bad = 'open'; last; }
            if ($ch eq '(') { $pd[$#st]++; }
            elsif ($ch eq ')') { pop @st if (--$pd[$#st] == 0); }
            elsif ($ch eq '"') { push @st, 'str'; }
            $i++;
            next;
        }
    }
    pop @st if (!$bad && $st[-1] eq 'line');
    my $line = '-';
    if ($bad) {
        my $head = ($i > 0) ? join('', @c[0 .. ($i <= $n ? $i - 1 : $n - 1)]) : '';
        $line = 1 + ($head =~ tr/\n//);
    } elsif (scalar(@st) > 1) {
        $bad = 'open';
    }
    my $ncs = join('', @nc);
    my $mks = join('', @mk);
    if (!$bad) {
        my $depth = 0;
        for my $m (split //, $mks) {
            $depth++ if $m eq '{';
            $depth-- if $m eq '}';
            if ($depth < 0) { last; }
        }
        $bad = 'brace' if $depth != 0;
    }
    return ($ncs, $mks, $bad, $line);
}

sub ig1_line {
    my ($s, $pos) = @_;
    my $pre = substr($s, 0, $pos);
    return 1 + ($pre =~ tr/\n//);
}

sub ig1_fail {
    my ($where, $line, $msg) = @_;
    violation($where, "IG1: 行 $line: $msg（人手確認が必要）");
}

$check = "IG1";
unless ($shared) {
    # ---- A（読む側）----
    my $sw = 'ios/NotificationService/NotificationService.swift';
    my $sw_text = slurp("$root/$sw");
    if (!defined $sw_text) {
        ig1_fail($sw, '-', 'file not found (badge assignment cannot be checked)');
    } else {
        my ($nc, $mk, $bad, $badline) = ig1_lex($sw_text);
        if ($bad) {
            my %kind = (triple => '複数行文字列', open => '閉じていない', brace => '波括弧が合わない');
            ig1_fail($sw, $badline, "解析不能: $kind{$bad}");
        } else {
            my @asg;
            while ($mk =~ /\.badge\s*=(?!=)/g) {
                push @asg, [$-[0], $+[0]];
            }
            if (!@asg) {
                ig1_fail($sw, '-', 'badge 代入が 0 本');
            }
            for my $asgn (@asg) {
                my ($pos, $vpos) = @$asgn;
                my $ln = ig1_line($mk, $pos);
                my $rest = substr($mk, $vpos);
                if ($rest !~ /^\s*nil(?![\w])/) {
                    ig1_fail($sw, $ln, '基準形でない: nil 以外の代入');
                    next;
                }
                my ($depth, $open) = (0, -1);
                for (my $k = $pos - 1; $k >= 0; $k--) {
                    my $ch = substr($mk, $k, 1);
                    if ($ch eq '}') { $depth++; }
                    elsif ($ch eq '{') {
                        if ($depth == 0) { $open = $k; last; }
                        $depth--;
                    }
                }
                if ($open < 0) {
                    ig1_fail($sw, $ln, '基準形でない: ブロックの外の nil 代入');
                    next;
                }
                my $lstart = rindex($nc, "\n", $open - 1) + 1;
                my $headtxt = substr($nc, $lstart, $open - $lstart);
                $headtxt =~ s/^\s+//;
                $headtxt =~ s/\s+$//;
                my $cond = '';
                if ($headtxt =~ /^if(?![\w])(.*)$/s) {
                    $cond = $1;
                    $cond =~ s/\s+/ /g;
                    $cond =~ s/^ //;
                    $cond =~ s/ $//;
                    next if $cond =~ /^\(*\s*[\w.]+\.object\(forKey:\s*"ApplicationIsForeground"\)\s*as\?\s*String\s*\)*\s*==\s*"true"\s*\)*$/;
                }
                ig1_fail($sw, $ln, '基準形でない: nil 代入が ApplicationIsForeground == "true" の if の直下にない');
            }
        }
    }

    # ---- B（書く側）----
    my $ad = 'ios/Mattermost/AppDelegate.swift';
    my $ad_text = slurp("$root/$ad");
    if (!defined $ad_text) {
        ig1_fail($ad, '-', 'file not found (foreground flag writes cannot be checked)');
    } else {
        my ($nc, $mk, $bad, $badline) = ig1_lex($ad_text);
        if ($bad) {
            ig1_fail($ad, $badline, 'AppDelegate unparsable');
        } else {
            my %fn;
            for my $name ('applicationDidBecomeActive', 'applicationWillResignActive') {
                my $info = { found => 0, line => '-', writes => [] };
                $fn{$name} = $info;
                next unless $mk =~ /\bfunc\s+\Q$name\E(?![\w])/;
                my $fpos = $-[0];
                my $bstart = index($mk, '{', $+[0]);
                next if $bstart < 0;
                my ($depth, $bend) = (1, -1);
                for (my $k = $bstart + 1; $k < length($mk); $k++) {
                    my $ch = substr($mk, $k, 1);
                    if ($ch eq '{') { $depth++; }
                    elsif ($ch eq '}') {
                        $depth--;
                        if ($depth == 0) { $bend = $k; last; }
                    }
                }
                next if $bend < 0;
                $info->{found} = 1;
                $info->{line} = ig1_line($mk, $fpos);
                my $body_mk = substr($mk, $bstart + 1, $bend - $bstart - 1);
                my $body_nc = substr($nc, $bstart + 1, $bend - $bstart - 1);
                while ($body_mk =~ /setPreference\(\s*"[ ]*"\s*,\s*forKey:\s*"[ ]*"\s*\)/g) {
                    my ($s0, $e0) = ($-[0], $+[0]);
                    my $call = substr($body_nc, $s0, $e0 - $s0);
                    next unless $call =~ /setPreference\(\s*"([^"]*)"\s*,\s*forKey:\s*"([^"]*)"\s*\)/;
                    my ($val, $key) = ($1, $2);
                    next unless $key eq 'ApplicationIsForeground';
                    my $pre = substr($body_mk, 0, $s0);
                    my $d = ($pre =~ tr/{//) - ($pre =~ tr/}//);
                    push @{$info->{writes}}, { val => $val, depth => $d, line => ig1_line($mk, $bstart + 1 + $s0) };
                }
            }
            my $did = $fn{applicationDidBecomeActive};
            my $res = $fn{applicationWillResignActive};
            my @did_true = grep { $_->{val} eq 'true' && $_->{depth} == 0 } @{$did->{writes}};
            my @did_true_any = grep { $_->{val} eq 'true' } @{$did->{writes}};
            my @res_false = grep { $_->{val} eq 'false' && $_->{depth} == 0 } @{$res->{writes}};
            my @res_false_any = grep { $_->{val} eq 'false' } @{$res->{writes}};
            my @did_false = grep { $_->{val} eq 'false' } @{$did->{writes}};
            my @res_true = grep { $_->{val} eq 'true' } @{$res->{writes}};
            my $lead = '書く側が変わった: ';
            if (!$did->{found}) {
                ig1_fail($ad, '-', $lead . 'true の書き込みが無い（applicationDidBecomeActive が無い）');
            } elsif (!@did_true) {
                ig1_fail($ad, $did->{line}, $lead . 'true の書き込みが無い' . (@did_true_any ? '（関数の直下でなく内側のみ）' : '（DidBecomeActive の直下に必要）'));
            }
            if (!$res->{found}) {
                ig1_fail($ad, '-', $lead . 'false の書き込みが無い（applicationWillResignActive が無い）');
            } elsif (!@res_false) {
                ig1_fail($ad, $res->{line}, $lead . 'false の書き込みが無い' . (@res_false_any ? '（関数の直下でなく内側のみ）' : '（WillResignActive の直下に必要）'));
            }
            if ($did->{found} && @did_false) {
                ig1_fail($ad, $did_false[0]->{line}, $lead . 'DidBecomeActive に false がある');
            }
            if ($res->{found} && @res_true) {
                ig1_fail($ad, $res_true[0]->{line}, $lead . 'WillResignActive に true がある');
            }
        }
    }
}

if (@violations) {
    print "$_\n" for @violations;
    print 'RELEASE GUARD FAILED (' . scalar(@violations) . " violation(s), mode: $mode_label)\n";
    exit 1;
}

if ($shared) {
    print $release ? "RELEASE GUARD PASSED (--release, shared-only)\n" : "RELEASE GUARD PASSED (basic, shared-only)\n";
} else {
    print $release ? "RELEASE GUARD PASSED (--release)\n" : "RELEASE GUARD PASSED (basic)\n";
}
exit 0;
PERL_GUARD
exit $?
