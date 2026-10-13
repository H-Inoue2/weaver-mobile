// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（追加）: 詳細設計 v1.8（D-K79R0-80〜83）
//   UT-381 AG10 の拡張子 .b64・.base64 ／ UT-382・383 NPMCI（署名ありの pre。a〜e と署名なしで出ないこと）
//   UT-384 post の --signing-mode ／ UT-385 I8 の静的検査 ／ UT-386 smoke-trial の必須入力 aab_artifact_name

export {};

const s = require('./android_test_support.cjs');
const w = require('./android_workflow_rules.cjs');
const fs = require('fs');
const yaml = require('js-yaml');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

// ---- UT-381 AG10 ----
function gitRepo(tracked: Record<string, string>) {
    const dir = s.tmp('k79-v18-git-');
    for (const [rel, c] of Object.entries(tracked)) {
        s.write(dir, rel, c);
    }
    return s.gitInitCommit(dir);
}
const BASEFILES = {'README.md': '# r\n', 'android/app/debug.keystore': 'dbg'};
describe('UT-381 AG10 の名前検査の拡張子に .b64・.base64（v1.8）', () => {
    it('追跡された k.b64・k.base64 は rc=1・ファイル名が出る。debug.keystore の例外は変わらない（rc=0）', () => {
        for (const n of ['k.b64', 'k.base64']) {
            const r = s.guard(['ag10', '--root', s.posix(gitRepo({...BASEFILES, [n]: 'x'}))]);
            expect([n, r.rc]).toEqual([n, 1]);
            expect(r.out).toContain(n);
        }
        expect(s.guard(['ag10', '--root', s.posix(gitRepo(BASEFILES))]).rc).toBe(0);
    });

    it('AG10 が違反扱いにする拡張子（jks・p12・pem・p8・keystore・b64・base64）を .gitignore がすべて覆う（予防と検出が食い違わない）', () => {
        for (const e of ['jks', 'p12', 'pem', 'p8', 'keystore', 'b64', 'base64']) {
            expect([e, s.git(['check-ignore', '-q', 'zz-test.' + e]).rc]).toEqual([e, 0]);
        }
    });
});

// ---- UT-382・383 NPMCI ----
const COMPOSITE = '.github/actions/weaver-prepare-js/action.yml';
const CI = 'runs:\n  using: composite\n  steps:\n    - run: npm ci --ignore-scripts\n      shell: bash\n';
const INSTALL = 'runs:\n  using: composite\n  steps:\n    - run: npm install --ignore-scripts\n      shell: bash\n';
function preSigned(composite: string | null, signing: 'signed' | 'unsigned') {
    const root = s.fullTree({real: true});
    const p = root + '/' + COMPOSITE;
    if (composite === null) {
        fs.rmSync(p, {force: true});
    } else {
        s.write(root, COMPOSITE, composite);
    }
    s.gitInitCommit(root);
    return s.guard(['pre', '--mode', 'confirm', '--signing', signing, '--upload-to-play', 'false', '--root', s.posix(root), '--run-number', '1', '--app-version', '2.45.0', '--keystore-check', 'skip'], {
        env: {WEAVER_FIREBASE_PROJECT_ID: s.REAL.projectId, WEAVER_EXPECTED_CERT_SHA256: s.SHA_OK_PLAIN},
    });
}
const npmci = (r: any) => r.out.split('\n').filter((l: string) => l.startsWith('FAIL: NPMCI'));
describe('UT-382 NPMCI（署名ありの pre。v1.8）', () => {
    it('(a) npm ci --ignore-scripts のみ→NPMCI は通る（FAIL: NPMCI 0件）', () => {
        expect(npmci(preSigned(CI, 'signed'))).toHaveLength(0);
    });
    it('(b) npm install --ignore-scripts→FAIL: NPMCI（陽性対照。規則を外したミュータントをこれが検出する）', () => {
        expect(npmci(preSigned(INSTALL, 'signed')).length).toBeGreaterThanOrEqual(1);
    });
    it('(c) composite 無し→FAIL: NPMCI（fail-closed）', () => {
        expect(npmci(preSigned(null, 'signed')).length).toBeGreaterThanOrEqual(1);
    });
    it('(d) npm ci と npm install の両方→FAIL: NPMCI', () => {
        expect(npmci(preSigned(CI + '    - run: npm install\n      shell: bash\n', 'signed')).length).toBeGreaterThanOrEqual(1);
    });
    it('(e) npm ci も npm install も無い→FAIL: NPMCI', () => {
        expect(npmci(preSigned('runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n', 'signed')).length).toBeGreaterThanOrEqual(1);
    });
    it('違反の説明にファイルの中身を出さない（説明文だけ）', () => {
        const r = preSigned(INSTALL.replace('echo', 'SECRETCANARY'), 'signed');
        expect(r.out).not.toContain('SECRETCANARY');
    });
});
describe('UT-383 署名なしの pre には NPMCI が出ない（v1.8）', () => {
    it('composite が npm install でも・無くても、--signing unsigned の出力に NPMCI の語が0件', () => {
        for (const c of [INSTALL, null]) {
            const r = preSigned(c, 'unsigned');
            expect(r.out).not.toMatch(/NPMCI/);
        }
    });
});

// ---- UT-384 post --signing-mode ----
function postMode(args: string[]) {
    const root = s.fullTree({allow: {b: ['B-PENDING']}});
    const d = s.extractDir();
    return s.guard(['post', '--dir', s.posix(d), '--mode', 'confirm', '--signing', 'unsigned', '--root', s.posix(root), '--run-number', '1', '--app-version', '2.45.0', '--cleartext', 'forbid', ...args]);
}
describe('UT-384 guard post の --signing-mode（v1.8。D-K79R0-83）', () => {
    it('--signing unsigned --signing-mode signed＋許可リストの（b）が B-PENDING→違反（rc=1。署名ありのリポジトリ）', () => {
        const r = postMode(['--signing-mode', 'signed']);
        expect(r.rc).toBe(1);
        expect(s.failedLabels(r)).toContain('AG1');
    });
    it('--signing unsigned --signing-mode unsigned→（b）B-PENDING は警告つき合格（rc=0）', () => {
        expect(postMode(['--signing-mode', 'unsigned']).rc).toBe(0);
    });
    it('--signing-mode 省略→--signing と同じ（unsigned なら B-PENDING は通る。後方互換）', () => {
        expect(postMode([]).rc).toBe(0);
    });
    it('値域外（Signed・both・空）→rc=2（FAIL 行0件）', () => {
        for (const v of ['Signed', 'both', '']) {
            const r = postMode(['--signing-mode', v]);
            expect([v, r.rc]).toEqual([v, 2]);
            expect(s.failLines(r)).toHaveLength(0);
        }
    });
});
describe('UT-385 I8 の post の呼び出しに --signing-mode が1件（UT-324・IT-129の拡張）', () => {
    it('I8: --signing unsigned ＋ --signing-mode "$(…mode…)"。ワークフロー全体で --signing-mode は I8 の1件だけ', () => {
        const d = w.loadReal();
        const i8 = w.runOf(w.step(d, 'inspect', 'I8'));
        expect(i8).toContain('--signing unsigned');
        expect((i8.match(/--signing-mode/g) || []).length).toBe(1);
        expect(i8).toMatch(/--signing-mode "\$\(.*mode.*\)"/);
        expect((s.read(s.WORKFLOW).match(/--signing-mode/g) || []).length).toBe(1);
    });
});

// ---- UT-386 smoke-trial ----
describe('UT-386 smoke-trial の必須入力 aab_artifact_name（v1.8）', () => {
    it('入力 aab_artifact_name が必須・名前の完全指定（pattern・merge-multiple なし）・*.aab はちょうど1件の確認・runs-on は ubuntu-24.04', () => {
        const d = yaml.load(s.read(s.SMOKE));
        const on = d.on ?? d[true as any];
        const inp = on.workflow_dispatch.inputs;
        expect(inp.aab_artifact_name.required).toBe(true);
        expect(inp.aab_run_id).toBeDefined();
        const t = s.read(s.SMOKE);
        expect(t).not.toMatch(/\bpattern\s*:|merge-multiple/);
        const dl = Object.values(d.jobs).flatMap((j: any) => j.steps).find((x: any) => /download-artifact/.test(x.uses || ''));
        expect(w.str(dl.with.name)).toContain('inputs.aab_artifact_name');
        expect(t).toMatch(/-name '\*\.aab'[^\n]*wc -l\)" = "1"/);
        for (const j of Object.values(d.jobs) as any[]) {
            expect(j['runs-on']).toBe('ubuntu-24.04');
        }
    });
});
