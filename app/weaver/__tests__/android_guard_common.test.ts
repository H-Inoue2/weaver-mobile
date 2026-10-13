// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: 共通規約・CLI（UT-001〜018）と署名モード判定 mode（UT-019〜024）
// 対象: .github/scripts/weaver_android_guard.sh ほか（詳細設計 §5.1・§4.5・§5.3.10）。
// 期待結果は単体テスト設計書 K79_単体テスト設計書_R0.md の各行から導いた（実装・既存コードの挙動から写していない）。
// 異常系の期待は「終了コードがちょうど1（使い方の誤りは2）」と「出力に直す場所」。スクリプト不在（rc=127）では通らない。
// 秘密の値は書かない・読まない（パスワードはカナリア文字列だけ）。

export {};

const s = require('./android_test_support.cjs');

jest.setTimeout(180000);
afterAll(() => s.cleanup());

const NEW_SCRIPTS = [s.SCRIPTS.guard, s.SCRIPTS.inject, s.SCRIPTS.aab, s.SCRIPTS.k16];
const CANARY = 'CANARY_PW_9f3a';

describe('共通規約・CLI（詳細設計 §5.1）', () => {
    it('UT-001 5本のスクリプトの存在・bash -n・shebang・モード（実行ビットは検査しない）・ワークフローの bash 呼び出し', () => {
        for (const rel of NEW_SCRIPTS) {
            expect(s.exists(rel)).toBe(true);
            const r = require('child_process').spawnSync(s.BASH, ['-n', s.posix(s.abs(rel))], {encoding: 'utf8'});
            expect(r.status).toBe(0);
            expect(s.read(rel).split('\n')[0]).toBe('#!/usr/bin/env bash');
            const ls = s.git(['ls-files', '-s', rel]).out.toString().trim();
            if (ls) {
                expect(['100644', '100755']).toContain(ls.split(/\s+/)[0]);
            }
        }
        expect(s.exists(s.SCRIPTS.shared)).toBe(true);
        expect(s.exists(s.WORKFLOW)).toBe(true);
        const wf = s.read(s.WORKFLOW);
        const total = (wf.match(/\.github\/scripts\/weaver_android_/g) || []).length;
        const viaBash = (wf.match(/bash\s+(\.\/)?\.github\/scripts\/weaver_android_/g) || []).length;
        expect(total).toBeGreaterThan(0);
        expect(viaBash).toBe(total);
    });

    it('UT-002 新規4スクリプト: CR(0x0D)が0件・python3 と set -x の出現が0件（コメント行を除く）', () => {
        for (const rel of NEW_SCRIPTS) {
            expect(s.exists(rel)).toBe(true);
            const buf = s.readBuf(rel);
            expect(buf.includes(0x0d)).toBe(false);
            const code = buf.toString('utf8').split('\n').filter((l: string) => !(/^\s*#/).test(l)).join('\n');
            expect(code).not.toMatch(/python3/);
            expect(code).not.toMatch(/set\s+-x/);
        }
    });

    it('UT-003 不明なサブコマンド: rc=2・標準エラーに usage・FAIL: 行0件', () => {
        const r = s.guard(['xyz']);
        expect(r.rc).toBe(2);
        expect(r.err).toMatch(/usage/i);
        expect(s.failLines(r)).toHaveLength(0);
    });

    it('UT-004 ag7 に不明なオプション --bogus: rc=2（rc=1 と取り違えない）', () => {
        const root = s.tmp();
        s.write(root, 'build.gradle', s.buildGradle());
        const r = s.guard(['ag7', '--bogus', '1', '--gradle', s.posix(root + '/build.gradle'), '--run-number', '1', '--app-version', '2.45.0']);
        expect(r.rc).toBe(2);
    });

    it('UT-005 ag7 で --app-version が欠落: rc=2（必須オプションの欠落＝使い方の誤り）', () => {
        const root = s.tmp();
        s.write(root, 'build.gradle', s.buildGradle());
        expect(s.guard(['ag7', '--gradle', s.posix(root + '/build.gradle'), '--run-number', '1']).rc).toBe(2);
    });

    it('UT-006 --run-number=5（=区切り）: rc=2（--名前 値 の形のみ）', () => {
        const root = s.tmp();
        s.write(root, 'build.gradle', s.buildGradle({versionCode: 1005}));
        expect(s.guard(['ag7', '--gradle', s.posix(root + '/build.gradle'), '--run-number=5', '--app-version', '2.45.0']).rc).toBe(2);
    });

    it('UT-007 同じオプションの重複は後勝ち（--run-number 5 --run-number 7 で versionCode 1007: rc=0）', () => {
        const root = s.tmp();
        s.write(root, 'build.gradle', s.buildGradle({versionCode: 1007}));
        const r = s.guard(['ag7', '--gradle', s.posix(root + '/build.gradle'), '--run-number', '5', '--run-number', '7', '--app-version', '2.45.0']);
        expect(r.rc).toBe(0);
    });

    it('UT-008 --root が存在しないパス／通常ファイル: mode・ag8 とも rc=2（ROOT がディレクトリでない）', () => {
        const root = s.tmp();
        const file = s.write(root, 'f.txt', 'x');
        for (const bad of [s.posix(root + '/nonexistent'), s.posix(file)]) {
            expect(s.guard(['mode', '--root', bad]).rc).toBe(2);
            expect(s.guard(['ag8', '--phase', 'pre', '--root', bad]).rc).toBe(2);
        }
    });

    it('UT-009 入力ファイルが無い（ag7 --gradle /nonexistent）: rc=1（fail-closed。rc=2 ではない）・FAIL: AG7: と欠けたパス', () => {
        const r = s.guard(['ag7', '--gradle', '/nonexistent/build.gradle', '--run-number', '1', '--app-version', '2.45.0']);
        expect(r.rc).toBe(1);
        expect(r.out).toMatch(/FAIL: AG7:/);
        expect(r.out).toContain('/nonexistent/build.gradle');
    });

    it('UT-010 各AGの正常フィクスチャを CRLF にしても全件 rc=0・出力に CR が0件', () => {
        const toCrlf = (dir: string) => {
            const fs = require('fs');
            const path = require('path');
            const walk = (d: string) => {
                for (const e of fs.readdirSync(d, {withFileTypes: true})) {
                    const p = path.join(d, e.name);
                    if (e.isDirectory()) {
                        walk(p);
                    } else {
                        fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r?\n/g, '\r\n'));
                    }
                }
            };
            walk(dir);
        };
        const root = s.goodTree({gradle: {versionCode: 1001}});
        toCrlf(root);
        const R = s.posix(root);
        const calls: Array<[string, string[]]> = [
            ['AG1', ['ag1', '--kind', 'source', '--manifest', R + '/android/app/src/main/AndroidManifest.xml', '--allowlist', R + '/' + s.ALLOWLIST_REL]],
            ['AG2', ['ag2', '--root', R, '--mode', 'confirm', '--signing', 'unsigned']],
            ['AG4', ['ag4', '--phase', 'pre', '--root', R]],
            ['AG6', ['ag6', '--phase', 'pre', '--root', R]],
            ['AG7', ['ag7', '--gradle', R + '/android/app/build.gradle', '--run-number', '1', '--app-version', '2.45.0']],
            ['AG8', ['ag8', '--phase', 'pre', '--root', R]],
            ['AG9', ['ag9', '--phase', 'pre', '--root', R]],
        ];
        for (const [label, args] of calls) {
            const r = s.guard(args);
            expect([label, r.rc]).toEqual([label, 0]);
            expect(r.out.includes('\r')).toBe(false);
        }
        // baseline（CRLF の基準・ログ・jest.json）
        const d = s.tmp();
        s.write(d, 'base.json', '{"tsc_errors":0,"jest_passed":3,"jest_pending":0}\r\n');
        s.write(d, 'tsc.log', '');
        s.write(d, 'jest.json', '{"success":true,"numFailedTests":0,"numFailedTestSuites":0,"numPassedTests":3,"numPendingTests":0}\r\n');
        const b = s.guard(['baseline', '--tsc-log', s.posix(d + '/tsc.log'), '--tsc-exit', '0', '--jest-json', s.posix(d + '/jest.json'), '--baseline', s.posix(d + '/base.json')]);
        expect(b.rc).toBe(0);
        // inject（CRLF の build.gradle に注入）
        const g = s.write(d, 'build.gradle', s.buildGradle({versionCode: 817, eol: '\r\n'}));
        const i = s.inject(['--gradle', s.posix(g), '--run-number', '1', '--app-version', '2.45.0']);
        expect(i.rc).toBe(0);
        expect(i.out.includes('\r')).toBe(false);
    });

    it('UT-011 違反1件（AG7: versionCode 817・N=1）: FAIL: AG7: <場所>: <説明> の行と末尾 FAILED (1 violation(s))', () => {
        const root = s.tmp();
        s.write(root, 'build.gradle', s.buildGradle({versionCode: 817}));
        const r = s.guard(['ag7', '--gradle', s.posix(root + '/build.gradle'), '--run-number', '1', '--app-version', '2.45.0']);
        expect(r.rc).toBe(1);
        expect(r.out.split('\n').filter((l: string) => (/^FAIL: AG7: .+: .+$/).test(l))).toHaveLength(1);
        expect(r.out).toMatch(/ANDROID GUARD AG7 FAILED \(1 violation\(s\)\)\s*$/);
    });

    it('UT-012 独立した違反2件は止まらずに全件列挙: FAIL 行数＝FAILED の件数', () => {
        const root = s.tmp();
        s.write(root, 'build.gradle', s.buildGradle({versionCodeLines: ['        versionCode 1001', '        versionCode 1001'], versionName: '2.45'}));
        const r = s.guard(['ag7', '--gradle', s.posix(root + '/build.gradle'), '--run-number', '1', '--app-version', '2.45.0']);
        expect(r.rc).toBe(1);
        const n = s.failLines(r).length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(r.out).toContain(`FAILED (${n} violation(s))`);
    });

    it('UT-013 合格は PASSED 行、警告は WARN: AG5: …（rc=0）', () => {
        const root = s.goodTree({appName: 'Mattermost Beta', hashes: `${s.sha256Buf(Buffer.from('upstream-image'))}  ${s.IMG_REL}\n`, files: {[s.IMG_REL]: 'replaced-image'}});
        const r = s.guard(['ag5', '--mode', 'confirm', '--root', s.posix(root), '--hash-list', s.posix(root + '/' + s.HASHES_REL)]);
        expect(r.rc).toBe(0);
        expect(s.warnLines(r, 'AG5').length).toBeGreaterThanOrEqual(1);
        expect(r.out).toMatch(/ANDROID GUARD AG5 PASSED/);
    });

    it('UT-014 パスワード（カナリア）が AG3 pre（正常・誤り）と summary の標準出力・標準エラー・出力ファイルに出ない', () => {
        const stubs = s.makeStubs(['keytool']);
        const root = s.tmp();
        const ks = s.write(root, 'k.jks', 'dummy');
        const env = {
            WEAVER_KEYSTORE_FILE: s.posix(ks), WEAVER_KEYSTORE_PASSWORD: CANARY, WEAVER_KEY_ALIAS: 'weaver-test',
            WEAVER_EXPECTED_CERT_SHA256: s.SHA_OK_PLAIN, STUB_KEYTOOL_OUT: `Certificate fingerprints:\n\t SHA256: ${s.SHA_OK}`,
        };
        const ok = s.guard(['ag3', '--phase', 'pre', '--mode', 'confirm', '--signing', 'signed', '--upload-to-play', 'false', '--keystore-check', 'required'], {env, stubDir: stubs.dir});
        const bad = s.guard(['ag3', '--phase', 'pre', '--mode', 'confirm', '--signing', 'signed', '--upload-to-play', 'false', '--keystore-check', 'required'], {env: {...env, STUB_KEYTOOL_RC: '1'}, stubDir: stubs.dir});
        const facts = s.write(root, 'facts.txt', 'version=2.45.0\nversionCode=1001\nrun=1\n');
        const cert = s.write(root, 'cert.txt', s.certTxt());
        const outFile = s.posix(root + '/summary.txt');
        const sum = s.aab(['summary', '--facts', s.posix(facts), '--cert', s.posix(cert), '--signing', 'signed', '--kind', 'confirm', '--run', '1', '--expect-version', '2.45.0', '--expect-version-code', '1001', '--out', outFile], {env});
        const fileText = require('fs').existsSync(outFile) ? require('fs').readFileSync(outFile, 'utf8') : '';
        for (const r of [ok, bad, sum]) {
            expect(s.all(r)).not.toContain(CANARY);
        }
        expect(fileText).not.toContain(CANARY);
        expect(s.scriptExists(s.SCRIPTS.guard)).toBe(true);
    });

    it('UT-015 検索の陽性対照: パスワードを echo する改造版の出力では検索が1件以上検出する', () => {
        const root = s.tmp();
        const bad = s.write(root, 'leaky.sh', '#!/usr/bin/env bash\necho "pw=$WEAVER_KEYSTORE_PASSWORD"\n');
        const r = require('child_process').spawnSync(s.BASH, [s.posix(bad)], {encoding: 'utf8', env: {...process.env, WEAVER_KEYSTORE_PASSWORD: CANARY}});
        expect((r.stdout + r.stderr).includes(CANARY)).toBe(true);
    });

    it('UT-016 AG3 のスクリプト本文: -storepass は必ず :env の形・-keypass は0件（ps に秘密が出ない）', () => {
        expect(s.exists(s.SCRIPTS.guard)).toBe(true);
        const code = s.read(s.SCRIPTS.guard).split('\n').filter((l: string) => !(/^\s*#/).test(l)).join('\n');
        const uses = code.match(/-storepass\S*/g) || [];
        expect(uses.length).toBeGreaterThan(0);
        for (const u of uses) {
            expect(u).toMatch(/^-storepass:env$/);
        }
        expect(code).not.toMatch(/-keypass/);
    });

    it('UT-017 guard.sh・16k_check.sh は読み取り専用: 実行前後でフィクスチャのハッシュが不変・一時ファイルは TMPDIR に残らない', () => {
        const root = s.goodTree();
        const tmpd = s.tmp('k79-tmpdir-');
        const before = s.hashTree(root);
        const R = s.posix(root);
        const env = {TMPDIR: s.posix(tmpd), TMP: s.posix(tmpd), TEMP: s.posix(tmpd)};
        const rs = [
            s.guard(['ag1', '--kind', 'source', '--manifest', R + '/android/app/src/main/AndroidManifest.xml', '--allowlist', R + '/' + s.ALLOWLIST_REL], {env}),
            s.guard(['ag2', '--root', R, '--mode', 'confirm', '--signing', 'unsigned'], {env}),
            s.guard(['ag4', '--phase', 'pre', '--root', R], {env}),
            s.guard(['ag6', '--phase', 'pre', '--root', R], {env}),
            s.guard(['ag7', '--gradle', R + '/android/app/build.gradle', '--run-number', '1', '--app-version', '2.45.0'], {env}),
            s.k16([R], {env}),
        ];
        expect(rs[0].rc).toBe(0);
        expect(s.hashTree(root)).toBe(before);
        expect(require('fs').readdirSync(tmpd)).toHaveLength(0);
    });

    it('UT-018 Git Bash（PATH を最小化。python3・java なし）でも主要サブコマンドが同じ結果になる', () => {
        const root = s.goodTree();
        const R = s.posix(root);
        const calls: string[][] = [
            ['mode', '--root', R],
            ['ag4', '--phase', 'pre', '--root', R],
            ['ag7', '--gradle', R + '/android/app/build.gradle', '--run-number', '1', '--app-version', '2.45.0'],
            ['ag8', '--phase', 'pre', '--root', R],
        ];
        for (const c of calls) {
            const normal = s.guard(c);
            const minimal = s.guard(c, {env: {PATH: '/usr/bin:/bin'}});
            expect(minimal.rc).toBe(normal.rc);
            expect(minimal.out).toBe(normal.out);
            expect(normal.rc).toBe(0);
        }
    });
});

describe('署名モード判定 mode（詳細設計 §4.5・§5.3.10）', () => {
    const MARK = '.github/android_firebase_real';
    const modeOf = (setup: (root: string) => void) => {
        const root = s.tmp();
        s.write(root, '.github/placeholder', '');
        setup(root);
        return s.guard(['mode', '--root', s.posix(root)]);
    };

    it('UT-019 目印が空の通常ファイル: 標準出力は signed の1語・rc=0・警告なし', () => {
        const r = modeOf((root) => s.write(root, MARK, ''));
        expect(r.rc).toBe(0);
        expect(r.out.trim()).toBe('signed');
        expect(r.out.trim().split('\n')).toHaveLength(1);
    });

    it('UT-020 目印が無い: unsigned の1語・rc=0', () => {
        const r = modeOf(() => undefined);
        expect(r.rc).toBe(0);
        expect(r.out.trim()).toBe('unsigned');
    });

    it('UT-021 目印が中身のあるファイル（1KB）: signed（中身は問わない）', () => {
        const r = modeOf((root) => s.write(root, MARK, 'x'.repeat(1024)));
        expect(r.out.trim()).toBe('signed');
    });

    it('UT-022 目印がディレクトリ: unsigned（通常ファイルでないものは「なし」）', () => {
        const r = modeOf((root) => s.write(root, MARK + '/inner.txt', 'x'));
        expect(r.rc).toBe(0);
        expect(r.out.trim()).toBe('unsigned');
    });

    it('UT-023 近い名前だけ存在（.txt・末尾_・大文字小文字違い）: 3通りとも unsigned', () => {
        for (const name of ['.github/android_firebase_real.txt', '.github/android_firebase_real_', '.github/Android_Firebase_Real']) {
            const r = modeOf((root) => s.write(root, name, ''));
            expect([name, r.out.trim()]).toEqual([name, 'unsigned']);
        }
    });

    it('UT-024 google-services.json に DUMMY がある／無い、どちらでも（目印なしなら）unsigned（mode は JSON を読まない）', () => {
        for (const gs of [s.googleServices(), s.googleServices(s.REAL)]) {
            const r = modeOf((root) => s.write(root, 'android/app/google-services.json', gs));
            expect(r.rc).toBe(0);
            expect(r.out.trim()).toBe('unsigned');
        }
    });
});
