// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループQ（危険領域: ガード処理）: .github/scripts/weaver_release_guard.sh（詳細設計 §3.13 G1〜G5）
// 使い方: weaver_release_guard.sh [--release] [ROOT]。終了コード 0＝合格／1＝違反あり／2＝使い方の誤り。違反は全件を列挙。
// フィクスチャ（正常な基準 N から1点だけ変える）を一時ディレクトリに作り、bash を子プロセスで起動して確かめる。
// bash は環境変数 WEAVER_TEST_BASH（既定 bash）。Git Bash から jest を起動すること（PowerShell・cmd の bash は WSL の可能性）。
// 異常系の期待は「終了コードがちょうど1」と「出力に直す場所」。スクリプト不在（127）では通らない。

export {};

const support = require('./weaver_test_support.cjs');

type Opts = Record<string, unknown>;
const tdf: (raw: string) => string = support.tdfLine;
const SIX_OK = ['1', '1', '1', '1', '1', '1'];

function guard(opts: Opts = {}, release = true) {
    const root: string = support.makeFixture(opts);
    try {
        return support.runGuard(release ? ['--release', root] : [root]);
    } finally {
        support.removeFixture(root);
    }
}

const expectOk = (r: {status: number; out: string}) => expect({status: r.status, out: r.out}).toEqual({status: 0, out: r.out});
const expectFail = (r: {status: number; out: string}, ...mentions: string[]) => {
    expect({status: r.status, out: r.out}).toEqual({status: 1, out: r.out});
    for (const m of mentions) {
        expect(r.out).toContain(m);
    }
};
const withPbx = (...lines: string[]) => ({pbxLines: lines});
const sixWith = (index: number, line: string) => SIX_OK.map((v, i) => (i === index ? line : tdf(v)));

describe('ガード: 正常系（基準データ N）', () => {
    it('UT-151 N を --release: 終了コード0', () => {
        expectOk(guard());
    });
    it('UT-152 N を引数なし: 終了コード0', () => {
        expectOk(guard({}, false));
    });
    it('UT-153 N を cwd にして ROOT 省略: 終了コード0（ROOT 既定は .）', () => {
        const root: string = support.makeFixture();
        try {
            expectOk(support.runGuard([], {cwd: root}));
        } finally {
            support.removeFixture(root);
        }
    });
    it('UT-154 N の全ファイルを CRLF にして --release: 終了コード0（Windows の作業ツリーは CRLF）', () => {
        expectOk(guard({crlf: true}));
    });
    it('UT-250 合格時のログ: --release は "RELEASE GUARD PASSED (--release)"、引数なしは "RELEASE GUARD PASSED (basic)"', () => {
        const a = guard();
        expectOk(a);
        expect(a.out).toContain('RELEASE GUARD PASSED (--release)');
        const b = guard({}, false);
        expectOk(b);
        expect(b.out).toContain('RELEASE GUARD PASSED (basic)');
        expect(b.out).not.toContain('(--release)');
    });
    it('UT-260 G6 は入れない（製造着手時点）: Info.plist の URL スキームに mmauth が無くても --release は 0', () => {
        const root: string = support.makeFixture();
        try {
            const fs = require('fs');
            const plist: string = fs.readFileSync(`${root}/ios/Mattermost/Info.plist`, 'utf8');
            expect(plist).not.toContain('<string>mmauth</string>');
            expectOk(support.runGuard(['--release', root]));
        } finally {
            support.removeFixture(root);
        }
    });
});

describe('ガード G1: TARGETED_DEVICE_FAMILY（全件が 1。件数6以上）', () => {
    it('UT-155 6件が "1"（引用符つき）: 0', () => {
        expectOk(guard({pbx: ['"1"', '"1"', '"1"', '"1"', '"1"', '"1"']}));
    });
    it('UT-156 1件だけ "1,2": 1。出力に project.pbxproj と TARGETED_DEVICE_FAMILY', () => {
        expectFail(guard(withPbx(...sixWith(2, tdf('"1,2"')))), 'project.pbxproj', 'TARGETED_DEVICE_FAMILY');
    });
    it('UT-157 1件だけ 1,2（引用符なし）: 1', () => {
        expectFail(guard(withPbx(...sixWith(0, tdf('1,2')))));
    });
    it('UT-158 1件だけ ( 1, 2 ): 1', () => {
        expectFail(guard(withPbx(...sixWith(3, tdf('( 1, 2 )')))));
    });
    it('UT-159 1件だけ複数行配列（括弧・改行・1,・2,）: 1', () => {
        const multi = ['\t\t\t\tTARGETED_DEVICE_FAMILY = (', '\t\t\t\t\t1,', '\t\t\t\t\t2,', '\t\t\t\t);'].join('\n');
        expectFail(guard(withPbx(...sixWith(5, multi))));
    });
    it('UT-160 1件だけ 2（iPad のみ）: 1', () => {
        expectFail(guard(withPbx(...sixWith(1, tdf('2')))));
    });
    it('UT-161 6件すべて "1,2"（現状の pbxproj を模す）: 1', () => {
        expectFail(guard({pbx: Array(6).fill('"1,2"')}));
    });
    it('UT-162 件数5（全て 1）: 1（件数が6未満）', () => {
        expectFail(guard({pbx: Array(5).fill('1')}), 'TARGETED_DEVICE_FAMILY');
    });
    it('UT-163 件数7（全て 1）: 0（6以上は可）', () => {
        expectOk(guard({pbx: Array(7).fill('1')}));
    });
    it('UT-164 件数0（ファイルはあるが該当行なし）: 1', () => {
        expectFail(guard({pbx: []}));
    });
    it('UT-165 TARGETED_DEVICE_FAMILY = 1 ; （空白ゆらぎ）: 0', () => {
        expectOk(guard({pbx: ['1 ', '1 ', '1 ', '1 ', '1 ', '1 ']}));
    });
    it('UT-166 CRLF 版で1件だけ "1,2": 1', () => {
        expectFail(guard({...withPbx(...sixWith(2, tdf('"1,2"'))), crlf: true}));
    });
    it('UT-167 project.pbxproj が存在しない: 1（検査対象が無いのに成功しない）', () => {
        expectFail(guard({omit: ['pbxproj']}), 'project.pbxproj');
    });
    it('UT-251 条件付きキー TARGETED_DEVICE_FAMILY[sdk=…] = "1,2" が1件混じる（計7件）: 1', () => {
        const cond = '\t\t\t\t"TARGETED_DEVICE_FAMILY[sdk=iphoneos*]" = "1,2";';
        expectFail(guard(withPbx(...SIX_OK.map((v) => tdf(v)), cond)), 'TARGETED_DEVICE_FAMILY');
    });
    it('UT-252 6件すべてが1要素の配列 ( 1, ): 0（1要素配列は 1 として扱う）', () => {
        const one = (): string => ['\t\t\t\tTARGETED_DEVICE_FAMILY = (', '\t\t\t\t\t1,', '\t\t\t\t);'].join('\n');
        expectOk(guard(withPbx(one(), one(), one(), one(), one(), one())));
    });
    it('UT-253 条件付きキーの値が 1（計7件）: 0', () => {
        const cond = '\t\t\t\t"TARGETED_DEVICE_FAMILY[sdk=iphoneos*]" = 1;';
        expectOk(guard(withPbx(...SIX_OK.map((v) => tdf(v)), cond)));
    });
});

describe('ガード G2: 許可文言（ios/Mattermost/Info.plist の NS*UsageDescription）', () => {
    it('UT-168 NSMicrophoneUsageDescription に $(PRODUCT_NAME): 1。出力にそのキー名', () => {
        expectFail(guard({plist: {NSMicrophoneUsageDescription: 'Share in $(PRODUCT_NAME).'}}), 'NSMicrophoneUsageDescription');
    });
    it('UT-169 値に Mattermost: 1', () => {
        expectFail(guard({plist: {NSCameraUsageDescription: 'Use camera in Mattermost.'}}), 'NSCameraUsageDescription');
    });
    it.each(['MATTERMOST', 'mattermost'])('UT-170 値に %s（大文字小文字不問）: 1', (word) => {
        expectFail(guard({plist: {NSFaceIDUsageDescription: `Access ${word} on your device.`}}));
    });
    it('UT-171 NS*UsageDescription 以外（CFBundleName=$(PRODUCT_NAME)）は対象外: 0', () => {
        const root: string = support.makeFixture();
        try {
            const plist: string = require('fs').readFileSync(`${root}/ios/Mattermost/Info.plist`, 'utf8');
            expect(plist).toContain('<key>CFBundleName</key>\n\t<string>$(PRODUCT_NAME)</string>');
            expectOk(support.runGuard(['--release', root]));
        } finally {
            support.removeFixture(root);
        }
    });
    it('UT-172 CFBundleURLSchemes の mattermost・URLName の com.mattermost は対象外: 0', () => {
        const root: string = support.makeFixture();
        try {
            const plist: string = require('fs').readFileSync(`${root}/ios/Mattermost/Info.plist`, 'utf8');
            expect(plist).toContain('<string>mattermost</string>');
            expect(plist).toContain('<string>com.mattermost</string>');
            expectOk(support.runGuard(['--release', root]));
        } finally {
            support.removeFixture(root);
        }
    });
    it('UT-173 値が複数行にまたがり2行目に $(PRODUCT_NAME): 1', () => {
        expectFail(guard({plist: {NSMicrophoneUsageDescription: 'Line one of the text.\n\t  and again in $(PRODUCT_NAME) here.'}}), 'NSMicrophoneUsageDescription');
    });
    it('UT-174 CRLF の plist で $(PRODUCT_NAME): 1', () => {
        expectFail(guard({plist: {NSMicrophoneUsageDescription: 'Share in $(PRODUCT_NAME).'}, crlf: true}));
    });
    it('UT-175 ios/Mattermost/Info.plist が存在しない: 1', () => {
        expectFail(guard({omit: ['plist']}), 'Info.plist');
    });
    it('UT-254 検査対象は ios/Mattermost/Info.plist のみ: 共有拡張の Info.plist に $(PRODUCT_NAME) があっても 0', () => {
        const other: string = support.plistText({NSMicrophoneUsageDescription: 'Share in $(PRODUCT_NAME).'});
        expectOk(guard({files: {'ios/MattermostShare/Info.plist': other}}));
    });
});

describe('ガード G3: プレースホルダ残り（--release のみ。app/weaver 配下。__tests__ と *.test.ts(x) を除く）', () => {
    const marked = (m: string, rel = 'app/weaver/messages.ts') => ({files: {[rel]: `export const X = '${m}';\n`}});

    it.each([['⟦'], ['⟧'], ['要確定'], ['TODO_WEAVER']])('UT-176〜179 messages.ts に %s: 1。出力に messages.ts', (m) => {
        expectFail(guard({messages: `export const WEAVER_MESSAGES = {x: '${m}'};\n`}), 'messages.ts');
    });
    it.each([['確定】'], ['【操作名は実機で確認してから確定】']])('UT-182・UT-255 %s（運用設計 §7.1 の記法）: 1', (m) => {
        expectFail(guard({messages: `export const WEAVER_MESSAGES = {x: '${m}'};\n`}), 'messages.ts');
    });
    it('UT-180 マーカーあり・--release なし: 0（G3 は --release のみ）', () => {
        expectOk(guard({messages: 'export const X = \'⟦ x ⟧\';\n'}, false));
    });
    it('UT-181 マーカーが app/other/x.ts（app/weaver の外）: 0', () => {
        expectOk(guard(marked('⟦ x ⟧', 'app/other/x.ts')));
    });
    it('UT-183 マーカーが app/weaver/__tests__/x.ts の中: 0（走査から除く）', () => {
        expectOk(guard(marked('⟦ x ⟧', 'app/weaver/__tests__/x.ts')));
    });
    it.each([['app/weaver/foo.test.ts'], ['app/weaver/sub/foo.test.tsx']])('UT-256 マーカーが %s（*.test.ts(x)）: 0（走査から除く）', (rel) => {
        expectOk(guard(marked('⟦ x ⟧', rel)));
    });
});

describe('ガード G4: URL・メール（--release のみ）', () => {
    const c = (consts: Record<string, string>) => ({consts});

    it('UT-184 PRIVACY_POLICY_URL が空: 1。出力に constants.ts と定数名', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: ''})), 'constants.ts', 'PRIVACY_POLICY_URL');
    });
    it('UT-185 PRIVACY_POLICY_URL が http://: 1', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: 'http://weaver.example/p'})), 'PRIVACY_POLICY_URL');
    });
    it('UT-186 PRIVACY_POLICY_URL が Mattermost 社: 1', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: 'https://about.mattermost.com/x'})), 'PRIVACY_POLICY_URL');
    });
    it('UT-187 PRIVACY_POLICY_URL が https://MATTERMOST.COM/x（大文字小文字不問）: 1', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: 'https://MATTERMOST.COM/x'})));
    });
    it('UT-188 PRIVACY_POLICY_URL の先頭に空白: 1', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: ' https://weaver.example/p'})));
    });
    it('UT-189 PRIVACY_POLICY_URL の末尾に空白: 1（§3.1.3・§3.0 の「前後・途中に空白を含まない」）', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: 'https://weaver.example/p '})), 'PRIVACY_POLICY_URL');
    });
    it('UT-257 PRIVACY_POLICY_URL の途中に空白: 1', () => {
        expectFail(guard(c({PRIVACY_POLICY_URL: 'https://weaver.example/p q'})), 'PRIVACY_POLICY_URL');
    });
    it('UT-190 SUPPORT_URL が空: 1。出力に SUPPORT_URL', () => {
        expectFail(guard(c({SUPPORT_URL: ''})), 'SUPPORT_URL');
    });
    it('UT-191 SUPPORT_URL が https://x.mattermost.org/: 1', () => {
        expectFail(guard(c({SUPPORT_URL: 'https://x.mattermost.org/'})), 'SUPPORT_URL');
    });
    it('UT-192 REPORT_A_PROBLEM_EMAIL が空: 1。出力に REPORT_A_PROBLEM_EMAIL', () => {
        expectFail(guard(c({REPORT_A_PROBLEM_EMAIL: ''})), 'REPORT_A_PROBLEM_EMAIL');
    });
    it('UT-193 REPORT_A_PROBLEM_EMAIL が support.weaver.example（@なし）: 1', () => {
        expectFail(guard(c({REPORT_A_PROBLEM_EMAIL: 'support.weaver.example'})), 'REPORT_A_PROBLEM_EMAIL');
    });
    it('UT-194 REPORT_A_PROBLEM_EMAIL が a@mattermost.com: 1', () => {
        expectFail(guard(c({REPORT_A_PROBLEM_EMAIL: 'a@mattermost.com'})), 'REPORT_A_PROBLEM_EMAIL');
    });
    it('UT-195 REPORT_A_PROBLEM_EMAIL が support@weaver.example: 0', () => {
        expectOk(guard(c({REPORT_A_PROBLEM_EMAIL: 'support@weaver.example'})));
    });
    it('UT-258 REPORT_A_PROBLEM_EMAIL に空白（a b@weaver.example）: 1', () => {
        expectFail(guard(c({REPORT_A_PROBLEM_EMAIL: 'a b@weaver.example'})), 'REPORT_A_PROBLEM_EMAIL');
    });

    describe.each(['TERMS_OF_SERVICE_URL', 'NOTIFICATION_HELP_URL', 'ACCOUNT_DELETION_URL'])('%s（空でもよいが、値があれば同条件）', (name) => {
        it('UT-196/200/203 空: 0', () => {
            expectOk(guard(c({[name]: ''})));
        });
        it('UT-197/204 https://a.example/t: 0', () => {
            expectOk(guard(c({[name]: 'https://a.example/t'})));
        });
        it('UT-198/202/205 http://a.example/t: 1', () => {
            expectFail(guard(c({[name]: 'http://a.example/t'})), name);
        });
        it('UT-199/206 https://mattermost.com/t: 1', () => {
            expectFail(guard(c({[name]: 'https://mattermost.com/t'})), name);
        });
    });

    it('UT-201 NOTIFICATION_HELP_URL に C-10 の元のURL（troubleshoot-notifications）が戻ったら 1', () => {
        expectFail(guard(c({NOTIFICATION_HELP_URL: 'https://mattermost.com/pl/troubleshoot-notifications'})), 'NOTIFICATION_HELP_URL');
    });
    it('UT-207 PRIVACY・SUPPORT・EMAIL がすべて空のまま --release なし: 0（G4 は --release のみ）', () => {
        expectOk(guard(c({PRIVACY_POLICY_URL: '', SUPPORT_URL: '', REPORT_A_PROBLEM_EMAIL: ''}), false));
    });
});

describe('ガード G5: constants.ts の書式（常時）', () => {
    it('UT-208 SUPPORT_URL をダブルクォートで定義（--release なし）: 1。出力に SUPPORT_URL', () => {
        expectFail(guard({constRaw: {SUPPORT_URL: 'export const SUPPORT_URL = "https://weaver.example/support";'}}, false), 'SUPPORT_URL');
    });
    it('UT-209 7定数のうち1つが欠落（--release なし）: 1。出力に欠落した定数名', () => {
        expectFail(guard({constRaw: {NOTIFICATION_HELP_URL: null}}, false), 'NOTIFICATION_HELP_URL');
    });
    it('UT-210 export default { … } の形式: 1', () => {
        expectFail(guard({constantsFile: 'export default {APP_NAME: \'Weaver\'};\n'}, false));
    });
    it('UT-211 値が次行に折り返し（= の後で改行）: 1', () => {
        expectFail(guard({constRaw: {SUPPORT_URL: 'export const SUPPORT_URL =\n    \'https://weaver.example/support\';'}}, false), 'SUPPORT_URL');
    });
    it('UT-212 constants.ts が存在しない: 1', () => {
        expectFail(guard({omit: ['constants']}, false), 'constants.ts');
    });
    it('UT-213 SUPPORT_URL = "http://mattermost.com"（書式崩れと不正値が同時。--release なし）: 1（書式の崩れで他検査をすり抜けさせない）', () => {
        expectFail(guard({constRaw: {SUPPORT_URL: 'export const SUPPORT_URL = "http://mattermost.com";'}}, false), 'SUPPORT_URL');
    });
});

describe('ガード 共通: 全件列挙・使い方の誤り', () => {
    it('UT-214 G1・G2・G4 の違反を同時に --release: 1。全件の直す場所を出す（最初で止めない）', () => {
        const r = guard({
            ...withPbx(...sixWith(2, tdf('"1,2"'))),
            plist: {NSMicrophoneUsageDescription: 'Share in $(PRODUCT_NAME).'},
            consts: {PRIVACY_POLICY_URL: '', SUPPORT_URL: 'http://weaver.example/support'},
        });
        expectFail(r, 'TARGETED_DEVICE_FAMILY', 'NSMicrophoneUsageDescription', 'PRIVACY_POLICY_URL', 'SUPPORT_URL');
    });
    it('UT-215 不明なオプション --foo: 終了コード2（誤指定を黙って無視して成功しない）', () => {
        const root: string = support.makeFixture();
        try {
            const r = support.runGuard(['--foo', root]);
            expect({status: r.status, out: r.out}).toEqual({status: 2, out: r.out});
        } finally {
            support.removeFixture(root);
        }
    });
    it('UT-259 ROOT が存在しないパス: 終了コード2', () => {
        const r = support.runGuard(['--release', '/nonexistent/weaver-guard-root-xyz']);
        expect({status: r.status, out: r.out}).toEqual({status: 2, out: r.out});
    });
});

describe('ガード 移植性（macOS ランナー・Git Bash。静的検査）', () => {
    const script = (): string => require('fs').readFileSync(support.guardAbs(), 'utf8');
    const body = (): string => script().split('\n').filter((l: string) => !(/^\s*#/).test(l)).join('\n');

    it('UT-216 スクリプトに CR（0x0D）が0個。.gitattributes にこのスクリプトを eol=lf とする行がある', () => {
        const bytes: Buffer = require('fs').readFileSync(support.guardAbs());
        expect(bytes.includes(0x0D)).toBe(false);
        const lines: string[] = support.read('.gitattributes').split('\n').map((l: string) => l.trim());
        expect(lines).toContain('.github/scripts/*.sh text eol=lf');
        expect(lines).toContain('*.bat text eol=crlf');
    });

    it('UT-217 bash 3.2・BSD 非互換の構文が0件', () => {
        const forbidden: Array<[string, RegExp]> = [
            ['declare -A', /declare\s+-A\b/],
            ['mapfile', /\bmapfile\b/],
            ['readarray', /\breadarray\b/],
            ['${var^^}', /\$\{[A-Za-z_][A-Za-z_0-9]*\^\^?\}/],
            ['${var,,}', /\$\{[A-Za-z_][A-Za-z_0-9]*,,?\}/],
            ['&>>', /&>>/],
            ['|&', /\|&/],
            ['coproc', /\bcoproc\b/],
            ['[[ -v', /\[\[\s+-v\b/],
            ['grep -P', /grep\s+(?:-[A-Za-z]*\s+)*-[A-Za-z]*P/],
            ['sed -i（引数なし）', /\bsed\s+-i(?=\s)(?!\s+(?:''|""))/],
            ['readlink -f', /readlink\s+-f\b/],
            ['date -d', /\bdate\s+(?:-[A-Za-z]+\s+)*-d\b/],
            ['stat -c', /\bstat\s+-c\b/],
            ['xargs -r', /\bxargs\s+(?:-[A-Za-z]+\s+)*-r\b/],
        ];
        const b = body();
        const found = forbidden.filter(([, re]) => re.test(b)).map(([name]) => name);
        expect(found).toEqual([]);
    });

    it('UT-218 bash・perl 以外の外部コマンド（git・python・node・ruby・jq・plutil・PlistBuddy・xmllint）の呼び出しが0件', () => {
        const re = /(^|\||&&|;|\$\(|`)\s*(git|python3?|node|ruby|jq|plutil|PlistBuddy|\/usr\/libexec\/PlistBuddy|xmllint)\b/m;
        expect(re.test(body())).toBe(false);
        expect(body()).toMatch(/\bperl\b/);
    });

    it('UT-219 bash -n（構文検査）が終了コード0', () => {
        const {spawnSync} = require('child_process');
        const r = spawnSync(support.BASH, ['-n', support.posix(support.guardAbs())], {encoding: 'utf8'});
        expect({status: r.status, err: r.stderr}).toEqual({status: 0, err: r.stderr});
    });
});

// 提出前チェック（UT-33・ST-17）: 実リポジトリを --release で検査する。device.body の穴埋め⟦ ⟧が確定するまでは失敗するのが正しいので、
// 常時のテストにはしない。提出用ビルドの前に WEAVER_PRE_SUBMIT=1 で実行する（確定後は終了コード0になること）。
// eslint-disable-next-line no-process-env
const preSubmit = process.env.WEAVER_PRE_SUBMIT ? it : it.skip;
describe('提出前チェック（手順。WEAVER_PRE_SUBMIT=1 のときだけ実行）', () => {
    preSubmit('UT-33 実リポジトリを --release で検査: 終了コード0（穴埋めが消え、URL・メールが確定値）', () => {
        const r = support.runGuard(['--release', support.ROOT]);
        expect({status: r.status, out: r.out}).toEqual({status: 0, out: r.out});
    });
});
