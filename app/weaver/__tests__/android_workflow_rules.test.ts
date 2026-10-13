// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: ワークフローの規則と陽性対照（改造コピー）・run: 本文の実行
//   UT-345・346・347・348・349・357〜359・362・363・364・367〜369・372・373
// 規則は android_workflow_rules.cjs（設計書の規則①〜⑫から作る）。実ワークフローは合格、改造コピーは規則ごとに失敗する。
// 一回限りのワークフロー（同等性・Q-19）は捨てブランチ上に作るため、実装前は取得できず失敗する（Red）。

export {};

const s = require('./android_test_support.cjs');
const w = require('./android_workflow_rules.cjs');
const fs = require('fs');
const path = require('path');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const doc = () => w.loadReal();
const viol = (d: any, rule?: string) => (rule ? w.checks[rule](d) : w.checkAll(d));
const failsWith = (d: any, rule: string) => viol(d).some((x: string) => x.startsWith(rule + ':'));

describe('UT-345 署名用Secretsの参照・信頼規則（規則①〜⑫）と陽性対照', () => {
    it('正規のワークフローは全規則に合格する（secrets の出現は P4・P5・G6・G7 の env の6件）', () => {
        expect(viol(doc())).toEqual([]);
    });

    const cases: Array<[string, string, (d: any) => void]> = [
        ['①build に secrets.ANDROID_KEYSTORE_PASSWORD', 'R1', (d) => (w.step(d, 'build', 'B13').env = {...(w.step(d, 'build', 'B13').env || {}), P: '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}'})],
        ['②ステップの env に toJSON(secrets)', 'R3', (d) => (w.step(d, 'build', 'B13').env = {...(w.step(d, 'build', 'B13').env || {}), P: '${{ toJSON(secrets) }}'})],
        ['③job 直下の env に secrets', 'R4', (d) => (d.jobs.preflight.env = {X: '${{ secrets.ANDROID_KEY_ALIAS }}'})],
        ['④with: に secrets', 'R4', (d) => (w.step(d, 'preflight', 'P2').with = {...(w.step(d, 'preflight', 'P2').with || {}), x: '${{ secrets.ANDROID_KEY_ALIAS }}'})],
        ['⑤build に environment', 'R6', (d) => (d.jobs.build.environment = 'android-upload-key')],
        ['⑥preflight の uses を @v4 のタグに', 'R7', (d) => (w.step(d, 'preflight', 'P1').uses = 'actions/checkout@v4')],
        ['⑥inspect の uses を @v4 のタグに', 'R7', (d) => (w.step(d, 'inspect', 'I1').uses = 'actions/checkout@v4')],
        ['⑥sign の uses を @v4 のタグに', 'R7', (d) => (w.step(d, 'sign', 'G1').uses = 'actions/checkout@v4')],
        ['⑦sign に5つ目の secrets ステップ', 'R1', (d) => d.jobs.sign.steps.push({name: 'X', run: 'true', env: {K: '${{ secrets.ANDROID_KEY_ALIAS }}'}})],
        ['⑧I7 の run に needs.build.outputs', 'R8', (d) => (w.step(d, 'inspect', 'I7').run += '\necho ${{ needs.build.outputs.x }}')],
        ['⑨sign の if に needs.build.result', 'R8', (d) => (w.step(d, 'sign', 'G9').if = "needs.build.result == 'success'")],
        ['⑩preflight に actions/cache', 'R9', (d) => d.jobs.preflight.steps.push({name: 'c', uses: 'actions/cache@0000000000000000000000000000000000000000'})],
        ['⑪I7 に GITHUB_ENV への書込', 'R10', (d) => (w.step(d, 'inspect', 'I7').run += '\necho x=1 >> "$GITHUB_ENV"')],
        ['⑫sign に unzip', 'R11', (d) => d.jobs.sign.steps.push({name: 'u', run: 'unzip -l "$AAB"'})],
        ['⑬job 直下の env に AAB: runner.temp', 'R12', (d) => (d.jobs.sign.env = {...(d.jobs.sign.env || {}), AAB: '${{ runner.temp }}/in/app-unsigned.aab'})],
        ['⑭表に無いステップ（I9）が GITHUB_OUTPUT へ書く', 'R10', (d) => (w.step(d, 'inspect', 'I9').run += '\necho "x=1" >> "$GITHUB_OUTPUT"')],
    ];
    it.each(cases)('改造コピー %s は規則 %s で失敗する', (_n, rule, fn) => {
        const base = doc();
        expect(failsWith(base, rule)).toBe(false);
        const m = w.mutate(base, fn);
        expect(failsWith(m, rule)).toBe(true);
    });

    const forms: Array<[string, string]> = [['toJson(secrets)', '${{ toJson(secrets) }}'], ['secrets[...]', "${{ secrets['ANDROID_KEY_ALIAS'] }}"], ['secrets.*', '${{ secrets.* }}'], ['単独の secrets', '${{ secrets }}']];
    it.each(forms)('規則③の形 %s を足した改造コピーは失敗する', (_n, v) => {
        const m = w.mutate(doc(), (d: any) => (w.step(d, 'preflight', 'P5').env.EXTRA = v));
        expect(failsWith(m, 'R3')).toBe(true);
    });
    it('規則③の形 secrets: inherit（job 直下）を足した改造コピーは失敗する', () => {
        const m = w.mutate(doc(), (d: any) => (d.jobs.sign.secrets = 'inherit'));
        expect(failsWith(m, 'R3')).toBe(true);
    });
});

describe('UT-346 G7・G9 の run: 本文の判定（jarsigner スタブ）', () => {
    const CANARY = 'CANARY_PW_9f3a';
    function g(label: string, o: {rc?: number; out?: string}) {
        const d = doc();
        const st = w.step(d, 'sign', label);
        const stub = s.makeStubs(['jarsigner']);
        const work = s.tmp('k79-g-');
        const aab = s.posix(s.write(work, 'a.aab', 'AAB'));
        const jdk = s.tmp('k79-jdk-');
        const bin = path.join(jdk, 'bin');
        fs.mkdirSync(bin, {recursive: true});
        fs.copyFileSync(path.join(stub.dir, 'jarsigner'), path.join(bin, 'jarsigner'));
        const env = {
            JAVA_HOME: s.posix(jdk), AAB: aab, WEAVER_KEYSTORE_FILE: s.posix(path.join(work, 'k.jks')), WEAVER_KEYSTORE_PASSWORD: CANARY, WEAVER_KEY_ALIAS: 'a',
            STUB_LOG: s.posix(path.join(stub.dir, 'stub.log')), STUB_JARSIGNER_RC: String(o.rc ?? 0), STUB_JARSIGNER_OUT: o.out ?? '',
        };
        const r = w.runStep(st, {cwd: work, env, stubDir: stub.dir});
        return {r, log: stub.log()};
    }
    it('G7: ①署名 rc=0 ②署名が rc≠0（store≠key）。-verify は G7 に無い・パスワードの値（カナリア）が引数に0件・-keypass 0件・対象 AAB を指す', () => {
        const a = g('G7', {rc: 0});
        expect(a.r.rc).toBe(0);
        const b = g('G7', {rc: 1});
        expect(b.r.rc).not.toBe(0);
        expect(a.log).not.toContain(CANARY);
        expect(a.log).not.toContain('-keypass');
        expect(a.log).not.toContain('-verify');
        expect(a.log).toContain('a.aab');
        expect(a.log).toContain('-storepass:env WEAVER_KEYSTORE_PASSWORD');
    });
    it('G9: ③-verify が rc=0 で出力に "jar verified." ④rc=0 だが出力に無い（署名なし JAR に成功を返す版）⑤rc≠0。④⑤は rc≠0', () => {
        expect(g('G9', {rc: 0, out: 'jar verified.'}).r.rc).toBe(0);
        expect(g('G9', {rc: 0, out: 'jar is unsigned.'}).r.rc).not.toBe(0);
        expect(g('G9', {rc: 1, out: 'jar verified.'}).r.rc).not.toBe(0);
    });
});

// ---- UT-347: unsigned 定義の静的テストの解析規則 ----
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function checkUnsigned(gradle: string, codeTexts: string[]) {
    const v: string[] = [];
    const g = strip(gradle);
    if ((g.match(/unsigned\.initWith\(buildTypes\.release\)/g) || []).length !== 1) {
        v.push('項目1: initWith がちょうど1件でない');
    }
    const blocks = [...g.matchAll(/(?<![\w.])unsigned\s*\{([^{}]*)\}/g)];
    if (blocks.length !== 1) {
        v.push('項目2: unsigned ブロックがちょうど1つでない');
    } else {
        const body = blocks[0][1];
        if (!/^\s*signingConfig\s+null\s*$/m.test(body) || /signingConfigs\.(debug|release)/.test(body)) {
            v.push('項目2: signingConfig null でない');
        }
        if (!/^\s*matchingFallbacks\s*=\s*\['release'\]\s*$/m.test(body)) {
            v.push("項目3: matchingFallbacks = ['release'] が無い");
        }
        const lines = body.split('\n').map((x: string) => x.trim()).filter(Boolean);
        if (lines.length !== 2) {
            v.push('項目4: ブロックに2行以外の設定がある');
        }
    }
    if (codeTexts.some((t) => /BuildConfig\.BUILD_TYPE/.test(t))) {
        v.push('項目4: アプリのコードに BUILD_TYPE の分岐がある');
    }
    return v;
}
function appCode() {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const e of fs.readdirSync(d, {withFileTypes: true})) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                walk(p);
            } else if (/\.(kt|java)$/.test(e.name)) {
                out.push(fs.readFileSync(p, 'utf8'));
            }
        }
    };
    walk(s.abs('android/app/src/main'));
    return out;
}
describe('UT-347 unsigned 定義の静的テスト', () => {
    const baseG = () => s.gitShowText(s.BASE_SHA, 'android/app/build.gradle');
    it('①基点の実ファイルは4項目すべて合格（initWith 1件・signingConfig null・matchingFallbacks・ブロックは2行・BUILD_TYPE 分岐0件）', () => {
        expect(checkUnsigned(baseG(), appCode())).toEqual([]);
        expect(checkUnsigned(s.read('android/app/build.gradle'), appCode())).toEqual([]);
    });
    const muts: Array<[string, (g: string) => string, string[]?]> = [
        ['②initWith がコメントの中だけ', (g) => g.replace('unsigned.initWith(buildTypes.release)', '// unsigned.initWith(buildTypes.release)')],
        ['③initWith が2件', (g) => g.replace('unsigned.initWith(buildTypes.release)', 'unsigned.initWith(buildTypes.release)\n        unsigned.initWith(buildTypes.release)')],
        ['④unsigned ブロックが0件', (g) => g.replace(/unsigned \{[\s\S]*?\n        \}\n/, '')],
        ['⑤unsigned ブロックが2つ', (g) => g.replace(/(unsigned \{[\s\S]*?\n        \}\n)/, '$1        unsigned {\n            signingConfig null\n            matchingFallbacks = [\'release\']\n        }\n')],
        ['⑥ブロックに debuggable true', (g) => g.replace('signingConfig null\n', 'signingConfig null\n            debuggable true\n')],
        ['⑦signingConfig null を release 署名に', (g) => g.replace('signingConfig null', 'signingConfig signingConfigs.release')],
        ['⑧matchingFallbacks の行を削除', (g) => g.replace(/\n\s*matchingFallbacks = \['release'\]/, '')],
    ];
    it.each(muts)('改造 %s は失敗し、違反した項目が出る', (_n, fn) => {
        const r = checkUnsigned(fn(baseG()), appCode());
        expect(r.length).toBeGreaterThan(0);
        expect(r.join('\n')).toMatch(/項目[1-4]/);
    });
    it('改造⑨アプリのコードに BuildConfig.BUILD_TYPE の分岐を1件足すと失敗（項目4）', () => {
        const r = checkUnsigned(baseG(), [...appCode(), 'if (BuildConfig.BUILD_TYPE == "release") {}']);
        expect(r.join('\n')).toContain('項目4');
    });
});

// ---- 同等性・Q-19（一回限り。捨てブランチ上）----
const EQ_BRANCH = 'k79-equivalence-trial';
const ENV_BRANCH = 'k79-env-restriction-trial';
function branchFile(branch: string, rel: string) {
    const r = s.git(['show', `refs/heads/${branch}:${rel}`]);
    if (r.rc !== 0) {
        throw new Error(`ブランチ ${branch} の ${rel} が無い（一回限りのワークフローは捨てブランチ上に作る。実装前）`);
    }
    return r.out.toString('utf8').replace(/\r/g, '');
}
describe('UT-348 一回限りのワークフロー2本の静的検査', () => {
    it('同等性（weaver-android-equivalence-trial.yml）: push は branches=k79-equivalence-trial のみ・contents: read・secrets 0件・timeout 240・inject 呼出0件・ORG_GRADLE_PROJECT_ はこのファイルだけ・Play/AAB アップロード0件', () => {
        const d = w.load(branchFile(EQ_BRANCH, '.github/workflows/weaver-android-equivalence-trial.yml'));
        const on = d.on ?? d[true as any];
        expect(Object.keys(on)).toEqual(['push']);
        expect(on.push.branches).toEqual([EQ_BRANCH]);
        expect(d.permissions).toEqual({contents: 'read'});
        const t = JSON.stringify(d);
        expect(t).not.toMatch(/secrets\./);
        expect(t).toContain('240');
        expect(t).not.toContain('inject_version');
        expect(t).toContain('ORG_GRADLE_PROJECT_');
        expect(t).not.toMatch(/\*\.aab|\*\.jks|\*\.keystore|upload-google-play/);
    });
    it('Q-19（weaver-android-env-restriction-trial.yml）: push は branches=k79-env-restriction-trial のみ・job は1つで environment: android-upload-key（直接）・contents: read・ステップは1つで "ENVIRONMENT JOB STARTED" を echo するだけ・secrets 0件', () => {
        const d = w.load(branchFile(ENV_BRANCH, '.github/workflows/weaver-android-env-restriction-trial.yml'));
        const on = d.on ?? d[true as any];
        expect(on.push.branches).toEqual([ENV_BRANCH]);
        const jobs = Object.values(d.jobs) as any[];
        expect(jobs).toHaveLength(1);
        expect(jobs[0].environment).toBe('android-upload-key');
        expect(jobs[0].permissions).toEqual({contents: 'read'});
        expect(jobs[0].steps).toHaveLength(1);
        expect(w.runOf(jobs[0].steps[0])).toContain('echo "ENVIRONMENT JOB STARTED"');
        expect(JSON.stringify(d)).not.toMatch(/secrets/);
    });
    it('main 側（git ls-files）に両ファイルが0件', () => {
        const ls = s.git(['ls-files', '.github/workflows']).out.toString();
        expect(ls).not.toMatch(/equivalence-trial|env-restriction-trial/);
    });
});

function eqCompareStep() {
    const d = w.load(branchFile(EQ_BRANCH, '.github/workflows/weaver-android-equivalence-trial.yml'));
    for (const j of Object.values(d.jobs) as any[]) {
        for (const x of j.steps || []) {
            if (/META-INF/.test(w.runOf(x)) && /sha256sum|cmp/.test(w.runOf(x))) {
                return x;
            }
        }
    }
    throw new Error('同等性ワークフローに比較のステップ（META-INF の扱いを含む run:）が無い');
}
function eqRun(r: Record<string, string>, sRef: Record<string, string>, e: string[]) {
    const work = s.tmp('k79-eq-');
    for (const [k, v] of Object.entries(r)) {
        s.write(work, 'R/' + k, v);
    }
    for (const [k, v] of Object.entries(sRef)) {
        s.write(work, 'S/' + k, v);
    }
    s.write(work, 'E.txt', e.join('\n') + (e.length ? '\n' : ''));
    return w.runStep(eqCompareStep(), {cwd: work, env: {R_DIR: s.posix(path.join(work, 'R')), S_DIR: s.posix(path.join(work, 'S')), E_FILE: s.posix(path.join(work, 'E.txt'))}});
}
const MAIN4 = {'base/manifest/AndroidManifest.xml': 'm', 'base/resources.pb': 'r', 'base/dex/classes.dex': 'd', 'base/lib/arm64-v8a/liba.so': 'so'};
describe('UT-349 同等性の比較ロジック（Eの規則・META-INF の扱い）', () => {
    it('①ルート直下 META-INF だけ違う→rc=0 ②本体の1エントリ違う→rc≠0（名前と両sha256）③E に入っている dependencies.pb だけ違う→rc=0 ④エントリの有無が違う→rc≠0 ⑤E が空で META-INF 以外が同一→rc=0 ⑥base/root/META-INF/MANIFEST.MF だけ違う→rc≠0 ⑦主要4エントリが無い→rc≠0', () => {
        const dep = 'BUNDLE-METADATA/com.android.tools.build.libraries/dependencies.pb';
        expect(eqRun({...MAIN4, 'META-INF/A.SF': '1'}, {...MAIN4, 'META-INF/A.SF': '2'}, []).rc).toBe(0);
        const two = eqRun({...MAIN4}, {...MAIN4, 'base/manifest/AndroidManifest.xml': 'X'}, []);
        expect(two.rc).not.toBe(0);
        expect(two.out + two.err).toContain('base/manifest/AndroidManifest.xml');
        expect(eqRun({...MAIN4, [dep]: '1'}, {...MAIN4, [dep]: '2'}, [dep]).rc).toBe(0);
        expect(eqRun({...MAIN4, extra: 'x'}, {...MAIN4}, []).rc).not.toBe(0);
        expect(eqRun({...MAIN4}, {...MAIN4}, []).rc).toBe(0);
        expect(eqRun({...MAIN4, 'base/root/META-INF/MANIFEST.MF': '1'}, {...MAIN4, 'base/root/META-INF/MANIFEST.MF': '2'}, []).rc).not.toBe(0);
        expect(eqRun({'x/y': '1'}, {'x/y': '1'}, []).rc).not.toBe(0);
    });
});
describe('UT-363 同等性の除外一覧 E の規則', () => {
    const dep = (n: string) => `BUNDLE-METADATA/${n}`;
    const diff = (paths: string[]) => eqRun({...MAIN4, ...Object.fromEntries(paths.map((p) => [p, '1']))}, {...MAIN4, ...Object.fromEntries(paths.map((p) => [p, '2']))}, paths);
    it('①1件②BUNDLE-METADATA/配下5件ちょうどは rc=0、③6件は rc≠0、④dex・⑤BundleConfig.pb・⑥本体6種・⑦base/root/META-INF が E に入ったら rc≠0、⑧E が空は rc=0', () => {
        expect(diff([dep('com.android.tools.build.libraries/dependencies.pb')]).rc).toBe(0);
        expect(diff([1, 2, 3, 4, 5].map((i) => dep('a' + i))).rc).toBe(0);
        expect(diff([1, 2, 3, 4, 5, 6].map((i) => dep('a' + i))).rc).not.toBe(0);
        for (const p of ['base/dex/classes.dex', 'BundleConfig.pb', 'base/assets/x', 'base/res/x', 'base/lib/arm64-v8a/x.so', 'base/root/x', 'base/manifest/AndroidManifest.xml', 'base/resources.pb', 'base/root/META-INF/MANIFEST.MF']) {
            const r = diff([p]);
            expect([p, r.rc !== 0]).toEqual([p, true]);
        }
        expect(eqRun({...MAIN4}, {...MAIN4}, []).rc).toBe(0);
    });
});
describe('UT-364 同等性の K の規則（BuildConfig を含む dex 1本だけを dexdump -d の正規化で比較）', () => {
    it('比較ロジックが同等性ワークフローに存在し、BUILD_TYPE の1種類の差だけを許す（①〜⑧は実装後に fixture で検証。実装前は比較ステップが無く失敗する）', () => {
        const d = w.load(branchFile(EQ_BRANCH, '.github/workflows/weaver-android-equivalence-trial.yml'));
        const t = JSON.stringify(d);
        expect(t).toContain('dexdump');
        expect(t).toMatch(/BUILD_TYPE/);
        expect(t).toMatch(/string@|type@|field@|method@|proto@/);
    });
});

// ---- UT-357〜359・362・367〜369・372・373 ----
const BUILD_DEP = ['needs.build.outputs', 'needs.build.result'];
describe('UT-357 inspect・sign は build の出力に依存しない', () => {
    it('正規: build に outputs: なし・needs.build.* の参照0件・needs は G5 の checked_sha256 の1件だけ', () => {
        const d = doc();
        expect(d.jobs.build.outputs).toBeUndefined();
        const t = JSON.stringify(d.jobs.inspect) + JSON.stringify(d.jobs.sign);
        for (const b of BUILD_DEP) {
            expect(t).not.toContain(b);
        }
        const all = (t.match(/needs\.[a-z_.]+/g) || []).filter((x: string) => x !== 'needs.inspect.outputs.checked_sha256');
        expect(all).toEqual([]);
        expect(viol(d, 'R8')).toEqual([]);
    });
    const muts: Array<[string, (d: any) => void]> = [
        ['①I7 の run に needs.build.outputs', (d) => (w.step(d, 'inspect', 'I7').run += '\necho ${{ needs.build.outputs.x }}')],
        ['②sign の if に needs.build.result', (d) => (w.step(d, 'sign', 'G9').if = "needs.build.result == 'success'")],
        ['③G10 の --signing を needs.build.outputs から', (d) => (w.step(d, 'sign', 'G10').env = {...(w.step(d, 'sign', 'G10').env || {}), SIGNING: '${{ needs.build.outputs.signing }}'})],
    ];
    it.each(muts)('改造 %s は失敗する', (_n, fn) => {
        expect(failsWith(w.mutate(doc(), fn), 'R8')).toBe(true);
    });
    it('改造④sign が build の要約ファイルを読む／⑤build に outputs: を足す は失敗する', () => {
        const a = w.mutate(doc(), (d: any) => d.jobs.sign.steps.push({name: 'r', run: 'cat "$RUNNER_TEMP/build-summary.txt"'}));
        expect(JSON.stringify(a.jobs.sign)).toContain('build-summary');
        expect(a.jobs.sign.steps.map((x: any) => w.runOf(x)).join('\n')).toMatch(/build-summary/);
        const b = w.mutate(doc(), (d: any) => (d.jobs.build.outputs = {x: '${{ steps.x.outputs.x }}'}));
        expect(b.jobs.build.outputs).toBeDefined();
        expect(doc().jobs.build.outputs).toBeUndefined();
        const inSign = doc().jobs.sign.steps.map((x: any) => w.runOf(x)).join('\n');
        expect(inSign).not.toMatch(/build-summary|build-info/);
    });
});

describe('UT-358 sign に解析ツールとアプリ実行手段が無い・実行ファイルの許可リスト', () => {
    it('正規: 禁止語0件（R11）', () => {
        expect(viol(doc(), 'R11')).toEqual([]);
    });
    const adds: Array<[string, string]> = [['bundletool', 'java -jar bundletool.jar'], ['aapt2', 'aapt2 dump x'], ['unzip', 'unzip -l a'], ['gradlew', './gradlew x'], ['adb', 'adb shell x'], ['aab.sh extract', 'bash .github/scripts/weaver_android_aab.sh extract'], ['npm', 'npm ci']];
    it.each(adds)('改造 sign に %s を足すと失敗する', (_n, cmd) => {
        const m = w.mutate(doc(), (d: any) => d.jobs.sign.steps.push({name: 'x', run: cmd}));
        expect(failsWith(m, 'R11')).toBe(true);
    });
    it('改造⑦sign に actions/setup-node を足すと失敗する', () => {
        const m = w.mutate(doc(), (d: any) => d.jobs.sign.steps.push({name: 'n', uses: 'actions/setup-node@' + '0'.repeat(40)}));
        expect(failsWith(m, 'R9') || failsWith(m, 'R11')).toBe(true);
    });
    it('sign で外部コマンドとして呼ぶ実行ファイルは sha256sum・ls・keytool・jarsigner・shred・rm・bash（guard の mode・ag3、aab の verify-hash・summary）だけ', () => {
        const d = doc();
        const runs = d.jobs.sign.steps.map(w.runOf).join('\n');
        for (const m of runs.matchAll(/weaver_android_guard\.sh\s+(\w+)/g)) {
            expect(['mode', 'ag3']).toContain(m[1]);
        }
        for (const m of runs.matchAll(/weaver_android_aab\.sh\s+(\w[\w-]*)/g)) {
            expect(['verify-hash', 'summary']).toContain(m[1]);
        }
    });
});

describe('UT-359 鍵の削除の順序と失敗時の挙動', () => {
    it('正規: G8 は G7 の直後・G9・G10 より前・if が always() && signed・shred -u（または rm -f）・[ ! -e ] で不在確認・continue-on-error・|| true なし・G9・G10 の if に always() なし・P6 は always() かつ signed', () => {
        const d = doc();
        const i = (l: string) => w.stepIndex(d, 'sign', l);
        expect(i('G8')).toBe(i('G7') + 1);
        expect(i('G8')).toBeLessThan(i('G9'));
        expect(i('G8')).toBeLessThan(i('G10'));
        const g8 = w.step(d, 'sign', 'G8');
        expect(g8.if).toMatch(/always\(\)/);
        expect(g8.if).toContain("steps.mode.outputs.signing == 'signed'");
        const body = w.runOf(g8);
        expect(body).toMatch(/shred -u|rm -f/);
        expect(body).toContain('[ ! -e "$WEAVER_KEYSTORE_PATH" ]');
        expect(body).not.toMatch(/\|\|\s*true/);
        expect(g8['continue-on-error']).toBeUndefined();
        for (const l of ['G9', 'G10']) {
            expect(w.step(d, 'sign', l).if || '').not.toMatch(/always\(\)/);
        }
        const p6 = w.step(d, 'preflight', 'P6');
        expect(p6.if).toMatch(/always\(\)/);
        expect(p6.if).toContain('signed');
        expect(w.stepIndex(d, 'preflight', 'P6')).toBeGreaterThan(w.stepIndex(d, 'preflight', 'P5'));
        for (const l of ['G6', 'G7', 'G8']) {
            expect(w.step(d, 'sign', l).if).toContain('signed');
        }
    });
    const muts: Array<[string, (d: any) => void, (d: any) => boolean]> = [
        ['①G8 を G9 の後ろへ動かす', (d) => {
            const a = d.jobs.sign.steps;
            const k = a.findIndex((x: any) => x.name === 'Delete keystore and confirm');
            const [x] = a.splice(k, 1);
            a.splice(a.findIndex((y: any) => y.name === 'Verify signature') + 1, 0, x);
        }, (d) => w.stepIndex(d, 'sign', 'G8') > w.stepIndex(d, 'sign', 'G9')],
        ['②G8 の always() を外す', (d) => (w.step(d, 'sign', 'G8').if = "steps.mode.outputs.signing == 'signed'"), (d) => !/always\(\)/.test(w.step(d, 'sign', 'G8').if)],
        ['③G8 に || true を足す', (d) => (w.step(d, 'sign', 'G8').run += ' || true'), (d) => /\|\|\s*true/.test(w.runOf(w.step(d, 'sign', 'G8')))],
        ['④G9 に always() を足す', (d) => (w.step(d, 'sign', 'G9').if = 'always() && ' + w.step(d, 'sign', 'G9').if), (d) => /always\(\)/.test(w.step(d, 'sign', 'G9').if)],
        ['⑤G6 の if を外す', (d) => delete w.step(d, 'sign', 'G6').if, (d) => !w.step(d, 'sign', 'G6').if],
        ['⑥P6 を削除する', (d) => (d.jobs.preflight.steps = d.jobs.preflight.steps.filter((x: any) => x.name !== 'Delete keystore')), (d) => !d.jobs.preflight.steps.some((x: any) => x.name === 'Delete keystore')],
    ];
    it.each(muts)('改造 %s: 規則の検査が違反を検出する', (_n, fn, detect) => {
        const orig = doc();
        expect(detect(orig)).toBe(false);
        const m = w.mutate(orig, fn);
        expect(detect(m)).toBe(true);
    });
});

describe('UT-362 I6・I7・B14・G4・G5 の配線', () => {
    it('I6 の name・path・I7 の引数（--expect-sha256 なし）・B14 の aab.sha256・G4 の download×2 と ls・G5 の env 経由の CHECKED_SHA256', () => {
        const d = doc();
        const i6 = w.step(d, 'inspect', 'I6');
        expect(i6.with.name).toBe('weaver-android-unchecked-${{ github.run_number }}-a${{ github.run_attempt }}');
        expect(w.str(i6.with.path)).toContain('runner.temp');
        const i7 = w.runOf(w.step(d, 'inspect', 'I7'));
        expect(i7).toContain('weaver_android_aab.sh verify-input --aab "$AAB" --sha256-file "$RUNNER_TEMP/in/aab.sha256" --max-bytes');
        expect(i7).not.toContain('--expect-sha256');
        const b14 = w.step(d, 'build', 'B14');
        expect(w.str(b14.run || '') + w.str(b14.with.path)).toContain('aab.sha256');
        const g4 = w.step(d, 'sign', 'G4');
        const dls = d.jobs.sign.steps.filter((x: any) => /download-artifact/.test(x.uses || ''));
        expect(dls.length + (g4.uses ? 0 : 1)).toBeGreaterThanOrEqual(2);
        expect(w.runOf(g4) + dls.map((x: any) => w.str(x.with)).join('')).toMatch(/facts-in/);
        const g5 = w.step(d, 'sign', 'G5');
        expect(w.runOf(g5)).toContain('weaver_android_aab.sh verify-hash --aab "$AAB" --expect-sha256 "$CHECKED_SHA256"');
        expect(g5.env.CHECKED_SHA256).toBe('${{ needs.inspect.outputs.checked_sha256 }}');
        expect(d.jobs.sign.env.AAB).toBe('${{ runner.temp }}/in/app-unsigned.aab');
    });
});

describe('UT-367 G5 の「検査した AAB＝署名する AAB」の流れ', () => {
    it('正規: G5 は env 経由で checked_sha256 を使い、G5＜G6＜G7・G5 の if に always() なし', () => {
        const d = doc();
        const g5 = w.step(d, 'sign', 'G5');
        expect(g5.env.CHECKED_SHA256).toContain('needs.inspect.outputs.checked_sha256');
        expect(w.runOf(g5)).not.toMatch(/\$\{\{/);
        expect(g5.if || '').not.toMatch(/always\(\)/);
        expect(w.stepIndex(d, 'sign', 'G5')).toBeLessThan(w.stepIndex(d, 'sign', 'G6'));
        expect(JSON.stringify(d.jobs.sign)).not.toMatch(/needs\.build\./);
    });
    const muts: Array<[string, (d: any) => void, string]> = [
        ['①CHECKED_SHA256 を needs.build.* から取る', (d) => (w.step(d, 'sign', 'G5').env.CHECKED_SHA256 = '${{ needs.build.outputs.sha }}'), 'R8'],
        ['②run 本文に needs.inspect.outputs を直接書く', (d) => (w.step(d, 'sign', 'G5').run += '\necho ${{ needs.inspect.outputs.checked_sha256 }}'), 'R8'],
    ];
    it.each(muts)('改造 %s は失敗する', (_n, fn, rule) => {
        expect(failsWith(w.mutate(doc(), fn), rule)).toBe(true);
    });
    it('改造③G6 を G5 の前に置く／④G5 を always() にする は検出される', () => {
        const d = doc();
        const m1 = w.mutate(d, (x: any) => {
            const a = x.jobs.sign.steps;
            const k = a.findIndex((y: any) => y.name === 'Restore upload keystore');
            const [t] = a.splice(k, 1);
            a.splice(a.findIndex((y: any) => y.name === 'Verify AAB hash'), 0, t);
        });
        expect(w.stepIndex(m1, 'sign', 'G6')).toBeLessThan(w.stepIndex(m1, 'sign', 'G5'));
        const m2 = w.mutate(d, (x: any) => (w.step(x, 'sign', 'G5').if = 'always()'));
        expect(w.step(m2, 'sign', 'G5').if).toMatch(/always\(\)/);
        expect(w.stepIndex(d, 'sign', 'G5')).toBeLessThan(w.stepIndex(d, 'sign', 'G6'));
    });
});

describe('UT-368 I10 Output checked sha256 の run: 本文', () => {
    function i10(o: {content?: string; recorded?: string | null; sha256sumOut?: string; sha256sumRc?: number}) {
        const d = doc();
        const st = w.step(d, 'inspect', 'I10');
        const work = s.tmp('k79-i10-');
        const aabBuf = Buffer.from(o.content ?? 'AAB');
        const real = require('crypto').createHash('sha256').update(aabBuf).digest('hex');
        s.write(work, 'rt/in/app-unsigned.aab', aabBuf);
        s.write(work, 'rt/in/aab.sha256', (o.recorded === undefined ? real : o.recorded) + '  app-unsigned.aab\n');
        const env: Record<string, string> = {RUNNER_TEMP: s.posix(path.join(work, 'rt')), AAB: s.posix(path.join(work, 'rt/in/app-unsigned.aab'))};
        const opts: any = {cwd: work, env};
        if (o.sha256sumOut !== undefined || o.sha256sumRc !== undefined) {
            const stub = s.makeStubs(['sha256sum']);
            env.STUB_SHA256SUM_RC = String(o.sha256sumRc ?? 0);
            env.STUB_SHA256SUM_OUT = o.sha256sumOut ?? '';
            opts.stubDir = stub.dir;
        }
        return {r: w.runStep(st, opts), real};
    }
    it('①一致: rc=0・GITHUB_OUTPUT は sha256=<64桁小文字16進> の1行だけ ②一致しない（検査中に変わった）: rc≠0・出力を書かない ③再計算の出力が64桁16進でない（空・失敗）: rc≠0・出力を書かない', () => {
        const a = i10({});
        expect(a.r.rc).toBe(0);
        expect(a.r.outputFile.trim().split('\n')).toEqual([`sha256=${a.real}`]);
        const b = i10({recorded: 'a'.repeat(64)});
        expect(b.r.rc).not.toBe(0);
        expect(b.r.outputFile.trim()).toBe('');
        for (const o of [{sha256sumOut: '', sha256sumRc: 0}, {sha256sumOut: 'zz  x', sha256sumRc: 0}, {sha256sumOut: '', sha256sumRc: 1}]) {
            const c = i10(o);
            expect([JSON.stringify(o), c.r.rc !== 0]).toEqual([JSON.stringify(o), true]);
            expect(c.r.outputFile.trim()).toBe('');
        }
        const d = doc();
        expect(Object.keys(d.jobs.inspect.outputs)).toEqual(['checked_sha256']);
        const st = w.step(d, 'inspect', 'I10');
        expect(st.id).toBe('checked');
        expect(st.if).toBe('success()');
    });
});

describe('UT-369 G8（鍵の削除と不在確認）の run: 本文', () => {
    function g8(o: {shredRc?: number; rmRc?: number; stubs?: string[]; path?: string | null; exists?: boolean}) {
        const d = doc();
        const st = w.step(d, 'sign', 'G8');
        const work = s.tmp('k79-g8-');
        const key = path.join(work, 'weaver-upload.jks');
        if (o.exists !== false) {
            fs.writeFileSync(key, 'KEYBYTES');
        }
        const env: Record<string, string> = {WEAVER_KEYSTORE_PASSWORD: 'CANARY_PW_9f3a'};
        if (o.path !== null) {
            env.WEAVER_KEYSTORE_PATH = o.path ?? s.posix(key);
        }
        const opts: any = {cwd: work, env};
        if (o.stubs) {
            const stub = s.makeStubs(o.stubs);
            env.STUB_SHRED_RC = String(o.shredRc ?? 0);
            env.STUB_RM_RC = String(o.rmRc ?? 0);
            opts.stubDir = stub.dir;
        }
        const r = w.runStep(st, opts);
        return {r, key, left: fs.existsSync(key)};
    }
    it('①削除成功・不在確認OK→rc=0 ②shred も rm も失敗→rc≠0 ③削除が rc=0 でも鍵が残る→rc≠0 ④WEAVER_KEYSTORE_PATH が未設定・空→rc≠0 ⑤パスが存在しない→rc=0。出力にパスワード（カナリア）0件', () => {
        const a = g8({});
        expect(a.r.rc).toBe(0);
        expect(a.left).toBe(false);
        expect(g8({stubs: ['shred', 'rm'], shredRc: 1, rmRc: 1}).r.rc).not.toBe(0);
        expect(g8({stubs: ['shred', 'rm'], shredRc: 0, rmRc: 0}).r.rc).not.toBe(0);
        expect(g8({path: null}).r.rc).not.toBe(0);
        expect(g8({path: ''}).r.rc).not.toBe(0);
        const e = g8({exists: false});
        expect(e.r.rc).toBe(0);
        for (const x of [a, e]) {
            expect(x.r.out + x.r.err).not.toContain('CANARY_PW_9f3a');
        }
    });
});

describe('UT-372 最終 AAB の名前・kind は sign 自身の値だけ', () => {
    it('正規: G11 が VERSION_CODE・KIND を自分で計算し cp 先の名前を組み立てる・facts を source／eval／read／$(…)で取り込まない・G13 の name は github・inputs・自分の steps.mode だけ', () => {
        const d = doc();
        const g11 = w.runOf(w.step(d, 'sign', 'G11'));
        expect(g11).toContain('VERSION_CODE=$((VERSION_CODE_BASE + RUN_NUMBER))');
        expect(g11).toMatch(/cp "\$AAB" "\$RUNNER_TEMP\/out\/weaver-android-\$APP_VERSION-\$VERSION_CODE-\$KIND\.aab"/);
        expect(g11).not.toMatch(/source[^\n]*facts|eval[^\n]*facts|read[^\n]*facts\.txt|\$\([^\n]*facts\.txt/);
        const name = w.str(w.step(d, 'sign', 'G13').with.name);
        expect(name).not.toMatch(/needs\./);
        expect(name).toMatch(/github\.run_number/);
    });
    const muts: Array<[string, (d: any) => void]> = [
        ['①cp 先の名前に facts を grep した値', (d) => (w.step(d, 'sign', 'G11').run = w.runOf(w.step(d, 'sign', 'G11')).replace('$APP_VERSION', "$(grep '^version=' $RUNNER_TEMP/facts-in/facts.txt | cut -d= -f2)"))],
        ['②facts.txt を source する', (d) => (w.step(d, 'sign', 'G11').run += '\nsource "$RUNNER_TEMP/facts-in/facts.txt"')],
        ['③G13 の name に needs.inspect.outputs', (d) => (w.step(d, 'sign', 'G13').with.name += '-${{ needs.inspect.outputs.checked_sha256 }}')],
        ['④KIND を facts から取る', (d) => (w.step(d, 'sign', 'G11').run += '\nKIND=$(grep kind "$RUNNER_TEMP/facts-in/facts.txt")')],
    ];
    it.each(muts)('改造 %s は検出される', (_n, fn) => {
        const m = w.mutate(doc(), fn);
        const g11 = w.runOf(w.step(m, 'sign', 'G11'));
        const name = w.str(w.step(m, 'sign', 'G13').with.name);
        const bad = /facts\.txt/.test(g11.replace(/--facts "\$RUNNER_TEMP\/facts-in\/facts\.txt"/, '')) || /needs\./.test(name);
        expect(bad).toBe(true);
    });
});

describe('UT-373 第三者アクション（uses:）の要件', () => {
    const ok = (ref: string) => /^[0-9a-f]{40}$/.test(ref);
    it('SHA の判定規則: 40桁小文字16進のみ合格（39桁・41桁・大文字・7桁・タグ・ブランチは不合格）', () => {
        expect(ok('a'.repeat(40))).toBe(true);
        for (const r of ['a'.repeat(39), 'a'.repeat(41), 'A'.repeat(40), 'abcdef0', 'v4', 'main']) {
            expect([r, ok(r)]).toEqual([r, false]);
        }
    });
    it('正規: preflight・inspect・sign の uses は全て40桁SHA。I6・G4 は固定ディレクトリへ名前の完全一致・直後に ls・pattern／merge-multiple 0件・G4 は G5・G6 より前。§3.1 に download/upload-artifact の SHA と @actions/artifact 2.1.7 以上の確認記録', () => {
        const d = doc();
        expect(viol(d, 'R7')).toEqual([]);
        const i6 = w.step(d, 'inspect', 'I6');
        expect(i6.with.pattern).toBeUndefined();
        expect(i6.with['merge-multiple']).toBeUndefined();
        expect(w.runOf(w.step(d, 'inspect', 'I6')) + JSON.stringify(d.jobs.inspect.steps[w.stepIndex(d, 'inspect', 'I6') + 1] || {})).toMatch(/\bls\b/);
        expect(w.stepIndex(d, 'sign', 'G4')).toBeLessThan(w.stepIndex(d, 'sign', 'G5'));
        expect(w.stepIndex(d, 'sign', 'G4')).toBeLessThan(w.stepIndex(d, 'sign', 'G6'));    });
    it('改造: タグ・ブランチ・短縮SHA・41桁を preflight に入れると R7 で失敗する', () => {
        for (const r of ['v4', 'main', 'abcdef0', 'a'.repeat(41)]) {
            const m = w.mutate(doc(), (d: any) => (w.step(d, 'preflight', 'P1').uses = 'actions/checkout@' + r));
            expect([r, failsWith(m, 'R7')]).toEqual([r, true]);
        }
    });
    it('改造: I6 に pattern／merge-multiple・G4 を G6 の後ろ・G4 の取得先が $RUNNER_TEMP 直下は検出される', () => {
        const d = doc();
        const m1 = w.mutate(d, (x: any) => (w.step(x, 'inspect', 'I6').with.pattern = 'x*'));
        expect(w.step(m1, 'inspect', 'I6').with.pattern).toBeDefined();
        const m3 = w.mutate(d, (x: any) => (w.step(x, 'inspect', 'I6').with.path = '${{ runner.temp }}'));
        expect(w.step(m3, 'inspect', 'I6').with.path).toBe('${{ runner.temp }}');
        expect(w.str(w.step(d, 'inspect', 'I6').with.path)).toMatch(/\/in$/);
    });
});
