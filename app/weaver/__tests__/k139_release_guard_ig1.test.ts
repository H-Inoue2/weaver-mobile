// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-139/R1 ガード IG1（iOS 通知拡張のバッジ・前面フラグの書き込みの形）の結合テスト。
// 設計: K139_R1_詳細設計書 v0.2 §4.3〜4.6・§5、K139_結合総合テスト設計 v0.5（IT-nn）。
// 流儀は release_guard.test.ts と同じ（基準データ N' から1点だけ変えたフィクスチャ＋bash 子プロセス）。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターンに当たる）。

export {};

const {execFileSync, spawnSync} = require('child_process');
const support = require('./weaver_test_support.cjs');
const android = require('./android_test_support.cjs');

const SWIFT_REL = 'ios/NotificationService/NotificationService.swift';
const APPD_REL = 'ios/Mattermost/AppDelegate.swift';
const COND: string = support.SWIFT_COND;
const BLOCK: string = support.SWIFT_BADGE_BLOCK;
const TRUE_LINE: string = support.APPD_TRUE;
const FALSE_LINE: string = support.APPD_FALSE;
const OBJ = 'Gekidou.Preferences.default.object(forKey: "ApplicationIsForeground") as? String';

type R = {status: number; out: string};

function run(opts: Record<string, unknown> = {}, args: string[] = ['--release']): R {
    const root: string = support.makeFixture(opts);
    try {
        return support.runGuard([...args, root]);
    } finally {
        support.removeFixture(root);
    }
}

// 文字列置換（置換が起きなければテスト側の誤りとして落とす）
function sub(text: string, from: string, to: string): string {
    if (!text.includes(from)) {
        throw new Error(`テストの前提が崩れた: 置換元が見つからない: ${from}`);
    }
    return text.replace(from, to);
}
const sw = (f: (t: string) => string): string => f(support.swiftText());
const ad = (f: (t: string) => string): string => f(support.appDelegateText());
const swBlock = (to: string): string => sw((t) => sub(t, BLOCK, to));

const failLines = (r: R): string[] => r.out.split('\n').filter((l) => l.startsWith('FAIL:'));
const lastLine = (r: R): string => r.out.trim().split('\n').pop() || '';
const SUMMARY = (n: number, mode = 'release') => `RELEASE GUARD FAILED (${n} violation(s), mode: ${mode})`;
const BAD_FORM = /基準形でない.*（人手確認が必要）/;

function expectViolations(r: R, n: number, mode = 'release') {
    expect({status: r.status, last: lastLine(r), fails: failLines(r).length}).toEqual({status: 1, last: SUMMARY(n, mode), fails: n});
}
function expectOk(r: R) {
    expect({status: r.status, out: r.out}).toEqual({status: 0, out: r.out});
}
const lineOf = (text: string, needle: string): number => text.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('IG1: 正常系（番人）', () => {
    it('IT-01 N\' を --release: 終了0・PASSED・IG1 の語が出ない', () => {
        const r = run();
        expectOk(r);
        expect(r.out).toContain('RELEASE GUARD PASSED (--release)');
        expect(r.out).not.toContain('IG1');
    });
    it('IT-02 N\' を引数なし: 終了0・PASSED (basic)・IG1 無し', () => {
        const r = run({}, []);
        expectOk(r);
        expect(r.out).toContain('RELEASE GUARD PASSED (basic)');
        expect(r.out).not.toContain('IG1');
    });
    it('IT-03 N\' の全ファイルを CRLF にして --release: 終了0', () => {
        expectOk(run({crlf: true}));
    });
    it('IT-04 実リポジトリ（修正後の同一コミット）に --release: 終了0（G1〜G5・IG1 合格）', () => {
        const r = support.runGuard(['--release', support.ROOT]);
        expect({status: r.status, out: r.out.trim()}).toEqual({status: 0, out: 'RELEASE GUARD PASSED (--release)'});
    });
    it('IT-06 --shared-only で swift・AppDelegate が無くても PASS（IG1 は走らない）', () => {
        const r = run({omit: ['swift', 'appdelegate']}, ['--release', '--shared-only']);
        expectOk(r);
        expect(r.out).toContain('shared-only');
    });
    it('IT-07 --shared-only で swift・AppDelegate が違反の形でも終了0（ios/ を読まない）', () => {
        const r = run({swift: swBlock('      notification.badge = nil\n'), appdelegate: ad((t) => sub(t, `        ${TRUE_LINE}\n`, ''))}, ['--release', '--shared-only']);
        expectOk(r);
    });
    it('IT-08 nil 代入が Running 判定の外（直前）の基準形 if: 終了0', () => {
        const moved = sw((t) => {
            const removed = sub(t, BLOCK, '');
            const anchor = '    if (Gekidou.Preferences.default.object(forKey: "ApplicationIsRunning")';
            return sub(removed, anchor, `    if ${COND} {\n      notification.badge = nil\n    }\n${anchor}`);
        });
        expectOk(run({swift: moved}));
    });
    it('IT-09 badge 代入が2本とも基準形: 終了0', () => {
        expectOk(run({swift: swBlock(BLOCK + BLOCK)}));
    });
    it('IT-10 コメント・文字列リテラルの中の badge = nil は数えない: 終了0', () => {
        const t = sw((x) => sub(x, '    os_log(', '    // notification.badge = nil\n    let m = "notification.badge = nil"\n    os_log('));
        expectOk(run({swift: t}));
    });
    it.each([
        ['空白なし', '        notification.badge=nil\n'],
        ['末尾 ;', '        notification.badge = nil;\n'],
    ])('IT-11 表記ゆれ（%s）: 終了0', (_n, body) => {
        expectOk(run({swift: swBlock(`      if ${COND} {\n${body}      }\n`)}));
    });
    it('IT-11 表記ゆれ（1行形）: 終了0', () => {
        expectOk(run({swift: swBlock(`      if ${COND} { notification.badge = nil }\n`)}));
    });
    it('IT-12 文字列内の "{" だけが不釣り合い: 終了0（文字列内の波括弧を数えない）', () => {
        expectOk(run({swift: sw((t) => sub(t, '    os_log(', '    let brace = "{"\n    os_log('))}));
    });
    it('IT-13 DidEnterBackground・WillTerminate の false 書き込みを削除: 終了0（検査しない）', () => {
        const t = ad((x) => {
            const a = sub(x, `        super.applicationDidEnterBackground(application)\n        ${FALSE_LINE}\n`, '        super.applicationDidEnterBackground(application)\n');
            return sub(a, `        super.applicationWillTerminate(application)\n        ${FALSE_LINE}\n`, '        super.applicationWillTerminate(application)\n');
        });
        expectOk(run({appdelegate: t}));
    });
    it('IT-51 DidBecomeActive の直下 true の前に別処理・if があっても終了0（到達性は解析しない）', () => {
        const t = ad((x) => sub(x, `        ${TRUE_LINE}\n`, `        if false {\n            doOther()\n        }\n        doOtherThing()\n        ${TRUE_LINE}\n`));
        expectOk(run({appdelegate: t}));
    });
    it.each([
        ['(a) 同じ行に "https://…" を含むブロック', '    if x { let u = "https://example.com/a" }\n'],
        ['(b) 文字列 "/*"（閉じ */ は無い）', '    let s = "/*"\n'],
    ])('IT-58 字句の1回走査 %s: 終了0', (_n, line) => {
        expectOk(run({swift: sw((t) => sub(t, '    os_log(', `${line}    os_log(`))}));
    });
    it.each([
        ['(a) 空白ゆれ', 'GekidouWrapper.default.setPreference( "true" ,forKey:"ApplicationIsForeground")'],
        ['(b) 空白なし', 'GekidouWrapper.default.setPreference("true",forKey:"ApplicationIsForeground")'],
        ['(c) 引数ごとに改行', 'GekidouWrapper.default.setPreference(\n            "true",\n            forKey: "ApplicationIsForeground"\n        )'],
    ])('IT-59 B の空白ゆれ %s: 終了0', (_n, call) => {
        expectOk(run({appdelegate: ad((t) => sub(t, TRUE_LINE, call))}));
    });
    it.each([
        ['(a) 補間の入れ子', String.raw`    let s = "a \(f("b \("c}")) {"))"` + '\n'],
        ['(d) 補間の入れ子（f(1) の後に g("}") が続く。深さを数えず最初の ) で閉じる実装では波括弧が合わず FAIL）', String.raw`    let s2 = "a \(f(1) + g("}")) {"` + '\n'],
        ['(b) 生文字列 #', '    let r = #"x "y" } {"#\n'],
        ['(c) 生文字列 ##', '    let r2 = ##"p "# } q"##\n'],
    ])('IT-62 字句走査の入れ子・生文字列 %s: 終了0', (_n, line) => {
        expectOk(run({swift: sw((t) => sub(t, '    os_log(', `${line}    os_log(`))}));
    });
});

describe('IG1: 異常系 A（読む側）', () => {
    it('IT-22 修正前の実 swift（093e1c1bdc）: 1件・行126・基準形でない（Red の主証拠）', () => {
        const pre = execFileSync('git', ['show', `093e1c1bdc:${SWIFT_REL}`], {cwd: support.ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
        const r = run({swift: pre});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toMatch(/^FAIL: ios\/NotificationService\/NotificationService\.swift: IG1: 行 126: 基準形でない.*（人手確認が必要）$/);
    });
    it('IT-23 nil が条件の外（無条件）: 1件・パスと IG1', () => {
        const r = run({swift: swBlock('      notification.badge = nil\n')});
        expectViolations(r, 1);
        expect(r.out).toContain(SWIFT_REL);
        expect(r.out).toContain('IG1');
    });
    it('IT-24 条件が != "true"（逆向き）: 1件', () => {
        expectViolations(run({swift: swBlock(BLOCK.replace('== "true"', '!= "true"'))}), 1);
    });
    it('IT-25 Foreground の語が無く Running のみ（修正前の形）: 1件', () => {
        expectViolations(run({swift: swBlock(BLOCK.replace('ApplicationIsForeground', 'ApplicationIsRunning'))}), 1);
    });
    it('IT-26 ApplicationIsForeground が行コメントの中だけ: 1件', () => {
        expectViolations(run({swift: swBlock(`      // ${COND}\n      notification.badge = nil\n`)}), 1);
    });
    it('IT-27 条件が == "false": 1件', () => {
        expectViolations(run({swift: swBlock(BLOCK.replace('== "true"', '== "false"'))}), 1);
    });
    it('IT-28 badge 代入が0本（コメントのみ）: 1件・「badge 代入が 0 本」', () => {
        const r = run({swift: swBlock('      // notification.badge = nil\n')});
        expectViolations(r, 1);
        expect(r.out).toContain('badge 代入が 0 本');
    });
    it('IT-29 代入2本（基準形1＋条件の外1）: 1件・行番号は条件の外の代入の行', () => {
        const t = swBlock(BLOCK + '      notification.badge = nil\n');
        const r = run({swift: t});
        expectViolations(r, 1);
        const second = t.split('\n').map((l, i) => (l.includes('notification.badge = nil') ? i + 1 : 0)).filter(Boolean)[1];
        expect(failLines(r)[0]).toContain(`IG1: 行 ${second}:`);
    });
    it('IT-30 基準形の条件の中で badge = 0: 1件', () => {
        expectViolations(run({swift: swBlock(BLOCK.replace('badge = nil', 'badge = 0'))}), 1);
    });
    it('IT-31 swift が無い: 1件・file not found / cannot be checked・行 -', () => {
        const r = run({omit: ['swift']});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toContain(`${SWIFT_REL}: IG1: 行 -: file not found (badge assignment cannot be checked)`);
    });
    it('IT-32 基準形 if の内側の別の if に nil: 1件', () => {
        expectViolations(run({swift: swBlock(`      if ${COND} {\n        if other {\n          notification.badge = nil\n        }\n      }\n`)}), 1);
    });
    it('IT-33 != の if / else の中の nil（論理的に正しい別形）: 1件・基準形でない・人手確認', () => {
        const r = run({swift: swBlock(`      if (${OBJ} != "true") {\n        log()\n      } else {\n        notification.badge = nil\n      }\n`)});
        expectViolations(r, 1);
        expect(r.out).toContain('基準形でない');
        expect(r.out).toContain('人手確認');
    });
    it('IT-34 } else if 基準形条件 の内側: 1件', () => {
        expectViolations(run({swift: swBlock(`      if (other) {\n        x()\n      } else if ${COND} {\n        notification.badge = nil\n      }\n`)}), 1);
    });
    it.each([
        ['&&', `(${OBJ} == "true") && flag`],
        ['||', `(${OBJ} == "true") || flag`],
        ['!', `!(${OBJ} == "true")`],
        ['三項', `(${OBJ} == "true") ? true : false`],
    ])('IT-35 条件が %s を含む: 1件', (_n, cond) => {
        expectViolations(run({swift: swBlock(`      if ${cond} {\n        notification.badge = nil\n      }\n`)}), 1);
    });
    it('IT-36 変数経由の条件: 1件', () => {
        expectViolations(run({swift: swBlock(`      let fg = ${OBJ}\n      if fg == "true" {\n        notification.badge = nil\n      }\n`)}), 1);
    });
    it('IT-37 文字列外の } を1つ余分に: 解析不能の1件', () => {
        const r = run({swift: support.swiftText() + '}\n'});
        expectViolations(r, 1);
        expect(r.out).toContain('解析不能');
    });
    it('IT-38 複数行文字列 """…""": 解析不能の1件', () => {
        const r = run({swift: sw((t) => sub(t, '    os_log(', '    let m = """\n    abc\n    """\n    os_log('))});
        expectViolations(r, 1);
        expect(r.out).toContain('解析不能');
    });
    it('IT-39 条件が { と別の行（複数行の条件）: 1件', () => {
        expectViolations(run({swift: swBlock(`      if (${OBJ}\n          == "true")\n      {\n        notification.badge = nil\n      }\n`)}), 1);
    });
    it('IT-54 複数行コメント・文字列の後の条件外 nil: 行番号は元ファイルの行', () => {
        const t = '/* c1\n c2\n c3\n c4\n c5 */\nlet s = "str"\n' + sw((x) => sub(x, BLOCK, '      notification.badge = nil\n'));
        const r = run({swift: t});
        expectViolations(r, 1);
        const n = lineOf(t, 'notification.badge = nil');
        expect(n).toBeGreaterThan(6);
        expect(failLines(r)[0]).toContain(`IG1: 行 ${n}:`);
    });
    it('IT-46 出力形式: FAIL: ios/…swift: IG1: 行 n: 基準形でない…（人手確認が必要）、最終行は mode: release', () => {
        const r = run({swift: swBlock('      notification.badge = nil\n')});
        const hits = r.out.split('\n').filter((l) => /^FAIL: ios\/NotificationService\/NotificationService\.swift: IG1: 行 [0-9]+: 基準形でない.*（人手確認が必要）$/.test(l));
        expect(hits).toHaveLength(1);
        expect(lastLine(r)).toBe('RELEASE GUARD FAILED (1 violation(s), mode: release)');
        expect(lastLine(r)).not.toContain('mode: --release');
    });
    it.each([
        ['(a) 閉じない文字列', '    let s = "abc\n'],
        ['(b) 閉じない補間', '    let s = "a \\(f(1"\n'],
    ])('IT-63 扱えない構文は解析不能 FAIL %s', (_n, line) => {
        const r = run({swift: sw((t) => sub(t, '    os_log(', `${line}    os_log(`))});
        expectViolations(r, 1);
        expect(r.out).toContain('解析不能');
    });
});

describe('IG1: 異常系 B（書く側）', () => {
    const declLine = (fn: string) => lineOf(support.appDelegateText(), `func ${fn}(`);
    it('IT-40 DidBecomeActive の true を削除: 1件・宣言行・書く側が変わった', () => {
        const r = run({appdelegate: ad((t) => sub(t, `        ${TRUE_LINE}\n`, ''))});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toContain(`${APPD_REL}: IG1: 行 ${declLine('applicationDidBecomeActive')}: 書く側が変わった`);
        expect(failLines(r)[0]).toContain('人手確認が必要');
    });
    it('IT-41 WillResignActive のキーを改名: 1件・宣言行', () => {
        const t = ad((x) => sub(x, `        super.applicationWillResignActive(application)\n        ${FALSE_LINE}\n`, `        super.applicationWillResignActive(application)\n        ${FALSE_LINE.replace('ApplicationIsForeground', 'ApplicationIsActive')}\n`));
        const r = run({appdelegate: t});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toContain(`IG1: 行 ${declLine('applicationWillResignActive')}:`);
    });
    it('IT-42 true／false を入れ替え: 4件（①②③④の順）', () => {
        const t = ad((x) => {
            const a = sub(x, `        super.applicationDidBecomeActive(application)\n        ${TRUE_LINE}\n`, `        super.applicationDidBecomeActive(application)\n        ${FALSE_LINE}\n`);
            return sub(a, `        super.applicationWillResignActive(application)\n        ${FALSE_LINE}\n`, `        super.applicationWillResignActive(application)\n        ${TRUE_LINE}\n`);
        });
        const r = run({appdelegate: t});
        expectViolations(r, 4);
        const f = failLines(r);
        expect(f[0]).toContain('true の書き込みが無い');
        expect(f[1]).toContain('false の書き込みが無い');
        expect(f[2]).toContain('DidBecomeActive に false がある');
        expect(f[3]).toContain('WillResignActive に true がある');
    });
    it('IT-43 2関数を AppDelegate から消す: 2件（行 -）', () => {
        const t = ad((x) => {
            const a = x.indexOf('    override func applicationDidBecomeActive');
            const b = x.indexOf('    override func applicationDidEnterBackground');
            return x.slice(0, a) + x.slice(b);
        });
        const r = run({appdelegate: t});
        expectViolations(r, 2);
        for (const l of failLines(r)) {
            expect(l).toContain('IG1: 行 -:');
        }
    });
    it('IT-44 AppDelegate が無い: 1件・file not found / cannot be checked・行 -', () => {
        const r = run({omit: ['appdelegate']});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toContain(`${APPD_REL}: IG1: 行 -: file not found (foreground flag writes cannot be checked)`);
    });
    it('IT-45 書き込みがコメントの中だけ: 2件（①②）', () => {
        const t = ad((x) => sub(sub(x, `        ${TRUE_LINE}\n`, `        // ${TRUE_LINE}\n`), `        super.applicationWillResignActive(application)\n        ${FALSE_LINE}\n`, `        super.applicationWillResignActive(application)\n        // ${FALSE_LINE}\n`));
        expectViolations(run({appdelegate: t}), 2);
    });
    it('IT-50 true が if false { } の内側のみ: 1件（宣言行）', () => {
        const r = run({appdelegate: ad((t) => sub(t, `        ${TRUE_LINE}\n`, `        if false {\n            ${TRUE_LINE}\n        }\n`))});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toContain(`IG1: 行 ${declLine('applicationDidBecomeActive')}:`);
    });
    it.each([
        ['(a) DidBecomeActive に false を追加（③のみ）', (t: string) => sub(t, `        ${TRUE_LINE}\n`, `        ${TRUE_LINE}\n        ${FALSE_LINE}\n`)],
        ['(b) WillResignActive に true を追加（④のみ）', (t: string) => sub(t, `        super.applicationWillResignActive(application)\n        ${FALSE_LINE}\n`, `        super.applicationWillResignActive(application)\n        ${FALSE_LINE}\n        ${TRUE_LINE}\n`)],
    ])('IT-52 逆の値の書き込み単独 %s: 1件', (_n, f) => {
        expectViolations(run({appdelegate: ad(f)}), 1);
    });
    it('IT-53 DidBecomeActive だけを消す: 1件（①のみ・行 -）', () => {
        const t = ad((x) => {
            const a = x.indexOf('    override func applicationDidBecomeActive');
            const b = x.indexOf('    override func applicationWillResignActive');
            return x.slice(0, a) + x.slice(b);
        });
        const r = run({appdelegate: t});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toContain('IG1: 行 -:');
    });
    it.each([
        ['(a) 余分な }', (t: string) => t + '}\n'],
        ['(b) 複数行文字列', (t: string) => sub(t, '        endDatabaseLockProtection()\n    }\n\n    override func applicationWillResignActive', '        endDatabaseLockProtection()\n        let m = """\n        abc\n        """\n    }\n\n    override func applicationWillResignActive')],
        ['(c) DidBecomeActive の } 欠落', (t: string) => sub(t, '        endDatabaseLockProtection()\n    }\n\n    override func applicationWillResignActive', '        endDatabaseLockProtection()\n\n    override func applicationWillResignActive')],
    ])('IT-57 AppDelegate が解析不能 %s: 1件のみ', (_n, f) => {
        const r = run({appdelegate: ad(f)});
        expectViolations(r, 1);
        expect(failLines(r)[0]).toMatch(/^FAIL: ios\/Mattermost\/AppDelegate\.swift: IG1: 行 [^:]+: AppDelegate unparsable（人手確認が必要）$/);
    });
});

describe('IG1: 複雑（組合せ・順序・モード）', () => {
    it('IT-47 G1 違反＋A 違反＋B 違反を同時に: 3件（G1→A→B①の順）', () => {
        const tdf = support.tdfLine;
        const pbx = ['1', '1', '1', '1', '1', '1'].map((v: string, i: number) => (i === 2 ? tdf('"1,2"') : tdf(v)));
        const r = run({pbxLines: pbx, swift: swBlock('      notification.badge = nil\n'), appdelegate: ad((t) => sub(t, `        ${TRUE_LINE}\n`, ''))});
        expectViolations(r, 3);
        const f = failLines(r);
        expect(f[0]).toContain('TARGETED_DEVICE_FAMILY');
        expect(f[1]).toContain(SWIFT_REL);
        expect(f[2]).toContain(APPD_REL);
    });
    it('IT-48 IT-23 の形を CRLF で: 1件', () => {
        expectViolations(run({crlf: true, swift: swBlock('      notification.badge = nil\n')}), 1);
    });
    it('IT-49 IT-23 の形を引数なし／--release の両方: どちらも1件、mode だけ違う', () => {
        const opts = {swift: swBlock('      notification.badge = nil\n')};
        expectViolations(run(opts, []), 1, 'basic');
        expectViolations(run(opts, ['--release']), 1, 'release');
    });
    it('IT-55 A 解析不能（"""）＋B① 同時: 2件（A→B）', () => {
        const r = run({swift: sw((t) => sub(t, '    os_log(', '    let m = """\n    abc\n    """\n    os_log(')), appdelegate: ad((t) => sub(t, `        ${TRUE_LINE}\n`, ''))});
        expectViolations(r, 2);
        expect(failLines(r)[0]).toContain(SWIFT_REL);
        expect(failLines(r)[0]).toContain('解析不能');
        expect(failLines(r)[1]).toContain(APPD_REL);
    });
    it('IT-56 badge 代入3本（基準形・外・外）: 2件・行番号の昇順', () => {
        const t = swBlock(BLOCK + '      notification.badge = nil\n      notification.badge = nil\n');
        const r = run({swift: t});
        expectViolations(r, 2);
        const nums = failLines(r).map((l) => Number(/IG1: 行 (\d+):/.exec(l)![1]));
        expect(nums[0]).toBeLessThan(nums[1]);
    });
    it('IT-60 B 解析不能＋A 逸脱: 2件（A→B。B が解析不能でも A は実行）', () => {
        const r = run({swift: swBlock('      notification.badge = nil\n'), appdelegate: support.appDelegateText() + '}\n'});
        expectViolations(r, 2);
        expect(failLines(r)[0]).toContain(SWIFT_REL);
        expect(failLines(r)[1]).toContain('AppDelegate unparsable');
    });
    it('IT-61 A・B とも解析不能: 2件', () => {
        const r = run({swift: sw((t) => sub(t, '    os_log(', '    let m = """\n    abc\n    """\n    os_log(')), appdelegate: support.appDelegateText() + '}\n'});
        expectViolations(r, 2);
        expect(failLines(r)[0]).toContain('解析不能');
        expect(failLines(r)[1]).toContain('AppDelegate unparsable');
    });
});

describe('K-139 実リポジトリの静的確認（IT-14〜20）', () => {
    const git = (args: string[]) => spawnSync('git', args, {cwd: support.ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

    it('IT-14 NotificationService.swift の差分（093e1c1bdc 比）は badge の条件追加とコメントだけ', () => {
        const d = git(['diff', '093e1c1bdc', '--', SWIFT_REL]).stdout as string;
        expect(d).not.toBe('');
        const lines = d.replace(/\r/g, '').split('\n');
        const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'));
        const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'));
        expect(removed.every((l) => l.includes('notification.badge = nil'))).toBe(true);
        const addedText = added.join('\n');
        expect(addedText).toContain('Modified for Weaver');
        expect(addedText).toContain('ApplicationIsForeground');
        expect(addedText).toContain('notification.badge = nil');
        for (const w of ['postNotificationReceipt', 'verifySignatureFromNotification', 'sendMessageIntent', 'fetchAndStoreDataForPushNotification']) {
            expect([w, [...removed, ...added].some((l) => l.includes(w))]).toEqual([w, false]);
        }
    });
    it('IT-15 WEAVER.md に swift の行が1行・swift に Modified for Weaver がある', () => {
        const rows = support.read('WEAVER.md').split('\n').filter((l: string) => /^\|/.test(l) && l.includes('ios/NotificationService/NotificationService.swift'));
        expect(rows).toHaveLength(1);
        expect(support.read(SWIFT_REL)).toContain('Modified for Weaver');
    });
    it('IT-16 iOS ワークフロー: APP_VERSION 2.45.1・版の書き込みは env.APP_VERSION のまま・ガード説明コメントが IG1 を含み旧表現が無い', () => {
        const y: string = support.read('.github/workflows/weaver-ios-testflight.yml');
        expect(/^\s*APP_VERSION:\s*"2\.45\.1"/m.test(y)).toBe(true);
        const plist = y.split('\n').filter((l) => l.includes('PlistBuddy') && l.includes('CFBundleShortVersionString'));
        expect(plist).toHaveLength(2);
        expect(plist.every((l) => l.includes('${{ env.APP_VERSION }}'))).toBe(true);
        expect(y).toContain('IG1');
        expect(y).not.toContain('G1・G2・G5 のみ');
        expect(y).not.toContain('G1〜G5 すべて');
    });
    it('IT-17 変更ファイルは許可の8件に限る・差分0を守るファイルは差分0', () => {
        const names = new Set<string>([
            ...(git(['diff', '--name-only', '093e1c1bdc']).stdout as string).split('\n'),
            ...(git(['ls-files', '--others', '--exclude-standard']).stdout as string).split('\n'),
        ].filter((n) => n && !n.startsWith('.claude/')));
        const allowed = new Set([
            SWIFT_REL,
            '.github/scripts/weaver_release_guard.sh',
            'app/weaver/__tests__/weaver_test_support.cjs',
            'app/weaver/__tests__/k139_release_guard_ig1.test.ts',
            'app/weaver/__tests__/android_source_changes.test.ts',
            'app/weaver/__tests__/android_data_files.test.ts',
            'WEAVER.md',
            '.github/workflows/weaver-ios-testflight.yml',
        ]);
        expect([...names].filter((n) => !allowed.has(n))).toEqual([]);
        for (const z of ['app/weaver/__tests__/release_guard.test.ts', 'app/weaver/__tests__/android_shared_only.test.ts', APPD_REL, '.github/workflows/weaver-android-aab.yml', 'package.json']) {
            expect([z, names.has(z)]).toEqual([z, false]);
        }
    });
    it('IT-19 k139Ios の2件（swift・iOS ワークフロー）が基点 01fbf86bb8 との差分に実在する（例外の過大残存防止）', () => {
        const r = android.git(['diff', '--name-only', android.BASE_SHA]);
        expect(r.rc).toBe(0);
        const names = r.out.toString().split('\n').filter(Boolean);
        for (const f of [SWIFT_REL, '.github/workflows/weaver-ios-testflight.yml']) {
            expect([f, names.includes(f)]).toEqual([f, true]);
        }
    });
});
