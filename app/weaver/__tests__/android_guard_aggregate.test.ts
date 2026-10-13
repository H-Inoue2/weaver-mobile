// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: 集約 pre／post・sdk（UT-188〜196）、既定の同値性（UT-323）、段階ゲート（UT-330・331）、
// 違反の件数の数え方（UT-332）、post が AG9・abi を呼ぶこと（UT-340）。詳細設計 §5.2・§5.3.10・§1.4・§5.1
// 段階値 .github/android_stage.txt を読む行（UT-330・331）は、値が無ければ失敗する（S1で作る）。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

jest.setTimeout(300000);
afterAll(() => s.cleanup());

const PID = s.REAL.projectId;
function pre(root: string, o: {mode?: string; signing?: string; upload?: string; run?: string; extra?: string[]; env?: Record<string, string>} = {}) {
    return s.guard(['pre', '--mode', o.mode || 'confirm', '--signing', o.signing || 'unsigned', '--upload-to-play', o.upload || 'false', '--root', s.posix(root), '--run-number', o.run || '1', '--app-version', '2.45.0', ...(o.extra || [])], {env: o.env});
}
function post(dir: string, root: string, o: {mode?: string; signing?: string; extra?: string[]; env?: Record<string, string>} = {}) {
    return s.guard(['post', '--dir', s.posix(dir), '--mode', o.mode || 'confirm', '--signing', o.signing || 'unsigned', '--root', s.posix(root), '--run-number', '1', '--app-version', '2.45.0', '--cleartext', 'forbid', ...(o.extra || [])], {env: o.env});
}

describe('集約 pre（詳細設計 §5.2）', () => {
    it('UT-188 全AGが正常な総合フィクスチャ木: rc=0・AG1〜AG10 の PASSED 行が各1行・末尾 ANDROID GUARD pre PASSED (confirm, unsigned)', () => {
        const r = pre(s.fullTree());
        expect(r.rc).toBe(0);
        for (let n = 1; n <= 10; n++) {
            expect([n, r.out.split('\n').filter((l: string) => l.startsWith(`ANDROID GUARD AG${n} PASSED`)).length]).toEqual([n, 1]);
        }
        expect(r.out.trim().split('\n').pop()).toBe('ANDROID GUARD pre PASSED (confirm, unsigned)');
    });

    it('UT-189 AG1 と AG7 を同時に壊す: rc=1・両方の FAIL 行・末尾 FAILED (n violation(s)) の n は FAIL 行数と一致', () => {
        const root = s.fullTree({manifest: {perms: [...s.A18, ['READ_CONTACTS']]}, gradle: {versionCode: 1500}});
        const r = pre(root);
        expect(r.rc).toBe(1);
        expect(s.failedLabels(r)).toEqual(expect.arrayContaining(['AG1', 'AG7']));
        expect(r.out).toContain(`ANDROID GUARD pre FAILED (${s.failLines(r).length} violation(s))`);
    });

    it('UT-190 --mode submission --signing unsigned（実キー形式・目印あり）: rc=1（AG3: 提出用は署名ありのみ）。他のAGは通過行を出す', () => {
        const r = pre(s.fullTree({real: true}), {mode: 'submission', env: {WEAVER_FIREBASE_PROJECT_ID: PID}});
        expect(r.rc).toBe(1);
        expect(s.failedLabels(r)).toEqual(['AG3']);
        for (const n of [1, 2, 4, 6, 7, 8, 9, 10]) {
            expect(r.out).toContain(`ANDROID GUARD AG${n} PASSED`);
        }
    });

    it('UT-191 --signing が maybe／--mode が final: どちらも rc=2', () => {
        const root = s.fullTree();
        expect(pre(root, {signing: 'maybe'}).rc).toBe(2);
        expect(pre(root, {mode: 'final'}).rc).toBe(2);
    });

    it('UT-196【基】基点コミットのツリー（Git化）× 作成予定の許可リスト・ハッシュ一覧: rc=1・失敗する AG の集合は AG1・AG2・AG4・AG6・AG7・AG9 の6件ちょうど（AG5 は警告のみ・AG3・AG8・AG10 は通過）', () => {
        expect(s.exists(s.ALLOWLIST_REL)).toBe(true);
        expect(s.exists(s.HASHES_REL)).toBe(true);
        const root = s.baseTree(['android/app/build.gradle', 'android/app/src', 'android/app/google-services.json', 'assets/base/config.json', 'app/weaver/constants.ts']);
        s.write(root, s.ALLOWLIST_REL, s.read(s.ALLOWLIST_REL));
        s.write(root, s.HASHES_REL, s.read(s.HASHES_REL));
        s.gitInitCommit(root);
        const r = pre(root);
        expect(r.rc).toBe(1);
        expect(s.failedLabels(r)).toEqual(['AG1', 'AG2', 'AG4', 'AG6', 'AG7', 'AG9']);
        expect(s.warnLines(r, 'AG5').length).toBeGreaterThanOrEqual(1);
        expect(r.out).toContain('ANDROID GUARD AG8 PASSED');
        expect(r.out).toContain('ANDROID GUARD AG10 PASSED');
    });

    it('UT-323 集約が ag6 へ引数を二重に持たない: 引数なしの pre の AG6 結果は ag6 単体（既定）と同じ。--cleartext allow は ag6 へそのまま渡る', () => {
        const up = s.fullTree({nsc: {cleartext: 'true'}, manifest: {app: {cleartext: 'true'}}});
        const viaPre = pre(up);
        const direct = s.guard(['ag6', '--phase', 'pre', '--root', s.posix(up)]);
        expect(direct.rc).toBe(1);
        expect(s.failLines(viaPre, 'AG6')).toEqual(s.failLines(direct, 'AG6'));
        const allow = pre(up, {extra: ['--cleartext', 'allow']});
        expect(s.failedLabels(allow)).not.toContain('AG6');
        const good = s.fullTree();
        expect(s.failedLabels(pre(good, {extra: ['--cleartext', 'allow']}))).toContain('AG6');
        const d = s.extractDir({cleartext: 'true'});
        const a = post(d, good);
        const b = post(d, good, {extra: ['--cleartext', 'allow']});
        expect(s.failedLabels(a)).toContain('AG6');
        expect(s.failedLabels(b)).not.toContain('AG6');
    });
});

describe('集約 post・sdk（詳細設計 §5.2・§5.3.10）', () => {
    const root = () => s.fullTree();

    it('UT-192 総合の取り出しフィクスチャ（manifest.xml・cert.txt・nsc.txt・dex-classes.txt・abis.txt）: rc=0・末尾 ANDROID GUARD post PASSED (confirm, unsigned)', () => {
        const r = post(s.extractDir(), root());
        expect(r.rc).toBe(0);
        expect(r.out.trim().split('\n').pop()).toBe('ANDROID GUARD post PASSED (confirm, unsigned)');
    });

    it('UT-193 --dir の必須ファイルを1つずつ欠く（5つ＋resources.txt）: 全て rc=1・出力に欠けたファイル名', () => {
        const r0 = root();
        for (const name of ['manifest.xml', 'cert.txt', 'nsc.txt', 'dex-classes.txt', 'abis.txt', 'resources.txt']) {
            const d = s.extractDir();
            fs.rmSync(d + '/' + name);
            const r = post(d, r0);
            expect([name, r.rc]).toEqual([name, 1]);
            expect(r.out).toContain(name);
        }
    });

    it('UT-194 targetSdkVersion=35／minSdkVersion=29／ルート package が別: 3通りとも rc=1（sdk検査: 36以上・30・application-id一致）', () => {
        const r0 = root();
        expect(post(s.extractDir({targetSdk: 35}), r0).rc).toBe(1);
        expect(post(s.extractDir({minSdk: 29}), r0).rc).toBe(1);
        expect(post(s.extractDir({pkg: 'com.metarchitect.Other'}), r0).rc).toBe(1);
    });

    it('UT-195 targetSdkVersion=36／37・minSdkVersion=30: rc=0（36以上は可。minSdk は30ちょうど）', () => {
        const r0 = root();
        expect(post(s.extractDir({targetSdk: 36}), r0).rc).toBe(0);
        expect(post(s.extractDir({targetSdk: 37}), r0).rc).toBe(0);
    });

    it('UT-340 post が AG9（post）と abi を呼ぶ: ①resizeableActivity="true" ②abis.txt に x86 ③両方 → rc=1・①は AG9、②は x86 を含む行、③は両方（他のAGの FAIL は0件）', () => {
        const r0 = root();
        const a = post(s.extractDir({resizeable: 'true'}), r0);
        const b = post(s.extractDir({abis: 'arm64-v8a\narmeabi-v7a\nx86_64\nx86\n'}), r0);
        const c = post(s.extractDir({resizeable: 'true', abis: 'arm64-v8a\narmeabi-v7a\nx86_64\nx86\n'}), r0);
        expect([a.rc, b.rc, c.rc]).toEqual([1, 1, 1]);
        expect(s.failedLabels(a)).toEqual(['AG9']);
        expect(s.failLines(b).join('\n')).toContain('x86');
        expect(s.failedLabels(b)).not.toContain('AG9');
        expect(s.failedLabels(c)).toContain('AG9');
        expect(s.failLines(c).join('\n')).toContain('x86');
    });
});

describe('違反の件数の数え方・出力先（詳細設計 §5.1。D-K79R0-21）', () => {
    it('UT-332 ag1 に ①(c)禁止かつ(a)に無い FOREGROUND_SERVICE_MICROPHONE ②(a)に無い READ_CONTACTS ③(a)の CAMERA の欠落: FAIL 行はちょうど3行・FAILED (3 violation(s))・全て標準出力・標準エラーは空。使い方の誤りは rc=2・stderr に usage・stdout に FAIL 0件', () => {
        const root = s.tmp();
        const perms = [['INTERNET'], ['FOREGROUND_SERVICE_MICROPHONE'], ['READ_CONTACTS'], ['WRITE_EXTERNAL_STORAGE', 32], ['BLUETOOTH', 30]];
        const m = s.write(root, 'm.xml', s.manifestXml({perms}));
        const a = s.write(root, 'a.txt', s.allowlistTxt({
            a: ['A android.permission.INTERNET', 'A android.permission.CAMERA', 'A android.permission.WRITE_EXTERNAL_STORAGE maxSdk=32', 'A android.permission.BLUETOOTH maxSdk=30'],
            b: ['B android.permission.WAKE_LOCK'], c: ['C android.permission.FOREGROUND_SERVICE_MICROPHONE'],
        }));
        const r = s.guard(['ag1', '--kind', 'source', '--manifest', s.posix(m), '--allowlist', s.posix(a)]);
        expect(r.rc).toBe(1);
        expect(s.failLines(r)).toHaveLength(3);
        expect(r.out).toContain('ANDROID GUARD AG1 FAILED (3 violation(s))');
        expect(r.err.trim()).toBe('');
        const bad = s.guard(['ag1', '--kind', 'bogus', '--manifest', s.posix(m), '--allowlist', s.posix(a)]);
        expect(bad.rc).toBe(2);
        expect(bad.err).toMatch(/usage/i);
        expect(s.failLines(bad)).toHaveLength(0);
    });
});

// ---- 段階ゲート（詳細設計 §1.4）----
const lines = (rel: string) => (s.exists(rel) ? s.read(rel).split('\n') : []);
const jobsOf = () => (s.exists(s.WORKFLOW) ? Object.keys((yaml.load(s.read(s.WORKFLOW)) || {}).jobs || {}) : []);
const eq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const scriptsAll = () => [s.SCRIPTS.guard, s.SCRIPTS.inject, s.SCRIPTS.aab, s.SCRIPTS.k16].every((r) => s.exists(r));
const scriptsNone = () => [s.SCRIPTS.guard, s.SCRIPTS.inject, s.SCRIPTS.aab, s.SCRIPTS.k16].every((r) => !s.exists(r));
const gitignoreOk = () => ['*.jks', '*.p12', '*.pem', '*.p8', '*service-account*.json', '*service_account*.json', '*-adminsdk-*.json'].every((p) => lines('.gitignore').some((l) => l.trim() === p));
const gitignoreNone = () => !lines('.gitignore').some((l) => l.trim() === '*.p8');
const attrOk = () => ['.github/android_* text eol=lf', '.github/workflows/weaver-android-*.yml text eol=lf', '.github/actions/weaver-prepare-js/action.yml text eol=lf'].every((p) => lines('.gitattributes').some((l) => l.trim() === p));
const equivAbsent = () => {
    const refs = s.git(['for-each-ref', '--format=%(refname)']).out.toString().split('\n').filter(Boolean);
    return refs.every((ref: string) => s.git(['ls-tree', '-r', '--name-only', ref, '--', '.github/workflows/weaver-android-equivalence-trial.yml']).out.toString().trim() === '');
};
const manifestText = () => (s.exists('android/app/src/main/AndroidManifest.xml') ? s.read('android/app/src/main/AndroidManifest.xml') : '');
const nscText = () => (s.exists('android/app/src/main/res/xml/network_security_config.xml') ? s.read('android/app/src/main/res/xml/network_security_config.xml') : '');
const gsText = () => (s.exists('android/app/google-services.json') ? s.read('android/app/google-services.json') : '');
const manifestS3 = () => /resizeableActivity="false"/.test(manifestText()) && /usesCleartextTraffic="false"/.test(manifestText());
const nscS3 = () => /<base-config[^>]*cleartextTrafficPermitted="false"/.test(nscText());
const appNameOk = () => /<string name="app_name">Weaver<\/string>/.test(s.exists('android/app/src/main/res/values/strings.xml') ? s.read('android/app/src/main/res/values/strings.xml') : '');
const weaverMd = () => (s.exists('WEAVER.md') && s.read('WEAVER.md').includes('weaver-android-aab.yml'));
const baselineNoPending = () => s.exists(s.BASELINE_REL) && !s.read(s.BASELINE_REL).includes('PENDING');
const baselineAllPending = () => s.exists(s.BASELINE_REL) && (s.read(s.BASELINE_REL).match(/PENDING/g) || []).length === 3;
const allowPending = () => s.exists(s.ALLOWLIST_REL) && s.read(s.ALLOWLIST_REL).includes('B-PENDING');
const compositeText = () => (s.exists(s.COMPOSITE) ? s.read(s.COMPOSITE) : '');
const lockClean = () => s.git(['status', '--porcelain', 'package-lock.json']).out.toString().trim() === '';
const markExists = () => s.exists('.github/android_firebase_real');
const gsDummy = () => /DUMMY/.test(gsText());

type Fact = [string, () => boolean];
const baseFactsS1: Fact[] = [
    ['ワークフロー骨格が2job（verify・build）', () => eq(jobsOf(), ['verify', 'build'])],
    ['composite weaver-prepare-js が有る', () => s.exists(s.COMPOSITE)],
    ['namespace が com.mattermost.rnbeta', () => /^\s*namespace\s+["']com\.mattermost\.rnbeta["']/m.test(s.exists('android/app/build.gradle') ? s.read('android/app/build.gradle') : '')],
    ['google-services.json がダミー（DUMMY）', gsDummy],
    ['ガード等4本が無い', scriptsNone],
    ['許可リストが無い', () => !s.exists(s.ALLOWLIST_REL)],
];
const factsS2: Fact[] = [
    ['完全版ワークフローが5job', () => eq(jobsOf(), ['verify', 'preflight', 'build', 'inspect', 'sign'])],
    ['ガード等4本が有る', scriptsAll],
    ['--shared-only が実装されている', () => s.read(s.SCRIPTS.shared).includes('--shared-only')],
    ['許可リストが有り（b）が B-PENDING', allowPending],
    ['baseline が3項目とも PENDING', baselineAllPending],
    ['ハッシュ一覧が35件', () => lines(s.HASHES_REL).filter((l: string) => (/^[0-9a-f]{64}\s{2}\S/).test(l)).length === 35],
    ['.gitignore に7行', gitignoreOk],
    ['.gitattributes に3行', attrOk],
    ['smoke-trial が有る', () => s.exists(s.SMOKE)],
    ['同等性確認のワークフローが全ブランチに0件', equivAbsent],
    ['マニフェスト・NSC・app_name は基点のまま', () => !manifestS3() && !nscS3()],
];
const factsS3: Fact[] = [
    ...factsS2.filter(([n]) => !n.includes('PENDING') && !n.includes('基点のまま')),
    ['マニフェストが変更済み（resizeable=false・cleartext=false）', manifestS3],
    ['NSC L3 が false', nscS3],
    ['app_name が Weaver', appNameOk],
    ['WEAVER.md に Android の記述', weaverMd],
    ['baseline に PENDING が0件', baselineNoPending],
    ['許可リストの（b）に B-PENDING が無い', () => s.exists(s.ALLOWLIST_REL) && !allowPending()],
    ['目印が無い', () => !markExists()],
    ['composite が npm install（npm ci でない）', () => compositeText().includes('npm install') && !compositeText().includes('npm ci')],
];
const factsS4: Fact[] = [
    ...factsS3.filter(([n]) => !n.includes('目印が無い') && !n.includes('npm install')),
    ['目印と実キーの google-services.json（DUMMY なし）', () => markExists() && !gsDummy()],
    ['composite が npm ci', () => compositeText().includes('npm ci') && !compositeText().includes('npm install')],
    ['package-lock.json がクリーン', lockClean],
];
const FACTS: Record<string, Fact[]> = {S1: baseFactsS1, S2: factsS2, S3: factsS3, S4: factsS4};
// 次の段階で初めて成立する事実（現在の段階では成立してはならない）
const NEXT: Record<string, Fact[]> = {
    S1: [['ガード等4本が有る', scriptsAll], ['許可リストが有る', () => s.exists(s.ALLOWLIST_REL)], ['.gitignore に *.p8', () => !gitignoreNone()], ['smoke-trial が有る', () => s.exists(s.SMOKE)]],
    S2: [['マニフェストが変更済み', manifestS3], ['NSC L3 が false', nscS3], ['WEAVER.md に Android の記述', weaverMd], ['baseline に PENDING が0件', baselineNoPending]],
    S3: [['目印が有る', markExists], ['composite が npm ci', () => compositeText().includes('npm ci')]],
    S4: [],
};

describe('段階ゲート（詳細設計 §1.4。段階値 .github/android_stage.txt を読む）', () => {
    it('UT-331 段階値の整合: 値 Sn のとき Sn の事実がすべて成立し、次の段階の事実が1つも成立していない（更新忘れ・先走りの両方向）', () => {
        const st = s.stage();
        const bad = FACTS[st].filter(([, f]) => !f()).map(([n]) => n);
        const ahead = NEXT[st].filter(([, f]) => f()).map(([n]) => n);
        expect({stage: st, notHolding: bad, aheadOfStage: ahead}).toEqual({stage: st, notHolding: [], aheadOfStage: []});
    });

    it('UT-330 段階別の pre の失敗集合: S2 は注入前 AG1・AG6・AG7・AG9／注入後 AG1・AG6・AG9、S3 は注入後に失敗0（AG5 は警告のみ）。S1 はガードが無い。S4 は対象外（署名ありは UT-188 が担う）', () => {
        const st = s.stage();
        if (st === 'S1') {
            expect(scriptsNone()).toBe(true);
            return;
        }
        if (st === 'S4') {
            expect(['S4']).toContain(st);
            return;
        }
        expect(scriptsAll()).toBe(true);
        if (st === 'S2') {
            const r1 = pre(s.ROOT);
            expect(r1.rc).toBe(1);
            expect(s.failedLabels(r1)).toEqual(['AG1', 'AG6', 'AG7', 'AG9']);
            expect(s.warnLines(r1, 'AG2').join('\n')).toMatch(/dummy/i);
        }
        const copy = s.copyRepoSubset(['android/app/build.gradle', 'android/app/google-services.json', 'android/app/src', 'assets/base/config.json', 'app/weaver/constants.ts', s.ALLOWLIST_REL, s.HASHES_REL, s.BASELINE_REL]);
        const gradle = path.join(copy, 'android/app/build.gradle');
        expect(s.inject(['--gradle', s.posix(gradle), '--run-number', '1', '--app-version', '2.45.0']).rc).toBe(0);
        s.gitInitCommit(copy);
        const r2 = pre(copy);
        if (st === 'S2') {
            expect(s.failedLabels(r2)).toEqual(['AG1', 'AG6', 'AG9']);
        } else {
            expect(s.failedLabels(r2)).toEqual([]);
            expect(r2.rc).toBe(0);
            expect(r2.out).toContain('ANDROID GUARD pre PASSED (confirm, unsigned)');
        }
    });
});
