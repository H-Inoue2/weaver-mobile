// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: weaver-android-aab.yml の静的検査（構造）
//   UT-250〜276・324・335〜337・344・360・361・370。詳細設計 §4.1〜§4.6
// 規則そのもの（秘密・環境ファイル・実行ファイルの許可）と改造コピーは android_workflow_rules.test.ts。
// ※UT-271 の inspect は設計書の本文が「@v4でよい」だが、UT-345⑦・UT-373 は inspect もSHA固定。詳細設計v1.3で inspect もSHA固定に確定（D-T42解消）。

export {};

const s = require('./android_test_support.cjs');
const w = require('./android_workflow_rules.cjs');

jest.setTimeout(120000);
afterAll(() => s.cleanup());

const doc = () => w.loadReal();
const d0 = doc;
const J = ['verify', 'preflight', 'build', 'inspect', 'sign'];
const st = (job: string, label: string) => w.step(doc(), job, label);
const run = (job: string, label: string) => w.runOf(st(job, label));
const idx = (job: string, label: string) => w.stepIndex(doc(), job, label);
const wfText = () => s.read(s.WORKFLOW);
// download-artifact は uses のステップで run を持てない（GitHub の制約）。ls による個数確認は、取得ステップ自身か直後の2ステップのどこかにあればよい（D-S2-03）
const lsNear = (job: string, label: string) => {
    const d = doc();
    const i = idx(job, label);
    return d.jobs[job].steps.slice(i, i + 3).some((x: any) => /\bls\b/.test(w.runOf(x)));
};
// AAB は各ステップの env: で渡す（job直下の env に runner コンテキストは使えない。D-K79R0-63・D-S2-04）
const AAB_EXPR = '${{ runner.temp }}/in/app-unsigned.aab';
const SHA_BT = 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29';

describe('ワークフローの骨格（UT-250〜254）', () => {
    it('UT-250 構文エラー0件・name=Weaver Android AAB・on は workflow_dispatch の1つだけ', () => {
        const d = doc();
        expect(d.name).toBe('Weaver Android AAB');
        const on = d.on ?? d[true as any];
        expect(Object.keys(on)).toEqual(['workflow_dispatch']);
    });

    it('UT-251 inputs は clear_cache・for_submission・upload_to_play の3つだけ・全て type boolean・default false（YAML の真偽値）', () => {
        const d = doc();
        const inp = (d.on ?? d[true as any]).workflow_dispatch.inputs;
        expect(Object.keys(inp).sort()).toEqual(['clear_cache', 'for_submission', 'upload_to_play']);
        for (const k of Object.keys(inp)) {
            expect(inp[k].type).toBe('boolean');
            expect(inp[k].default).toBe(false);
        }
    });

    it('UT-252 permissions={contents: read}（直下と5job）・write系／id-token／actions: write は0件・concurrency', () => {
        const d = doc();
        expect(d.permissions).toEqual({contents: 'read'});
        for (const j of J) {
            expect([j, d.jobs[j].permissions]).toEqual([j, {contents: 'read'}]);
        }
        expect(wfText()).not.toMatch(/:\s*write\b|id-token/);
        expect(d.concurrency.group).toBe('weaver-android-aab-${{ github.ref }}');
        expect(d.concurrency['cancel-in-progress']).toBe(false);
    });

    it('UT-253 トップレベル env の値（APP_VERSION・VERSION_CODE_BASE・BUNDLETOOL_*・ACTIONLINT_*・NODE_OPTIONS）', () => {
        const e = doc().env;
        expect(e.APP_VERSION).toBe('2.45.0');
        expect(e.VERSION_CODE_BASE).toBe('1000');
        expect(e.BUNDLETOOL_VERSION).toBe('1.18.3');
        expect(e.BUNDLETOOL_SHA256).toBe(SHA_BT);
        expect(e.ACTIONLINT_VERSION).toBe('1.7.12');
        expect(e.ACTIONLINT_SHA256).toMatch(/^[0-9a-f]{64}$/);
        expect(String(e.NODE_OPTIONS)).toContain('--max_old_space_size=8192');
    });

    it('UT-254 5job・needs・runs-on・timeout-minutes・environment・outputs', () => {
        const j = doc().jobs;
        expect(Object.keys(j).sort()).toEqual([...J].sort());
        const needs = (k: string) => [].concat(j[k].needs || []).sort();
        expect(needs('verify')).toEqual([]);
        expect(needs('preflight')).toEqual([]);
        expect(needs('build')).toEqual(['preflight', 'verify']);
        expect(needs('inspect')).toEqual(['build']);
        expect(needs('sign')).toEqual(['build', 'inspect', 'preflight']);
        for (const k of J) {
            expect([k, j[k]['runs-on']]).toEqual([k, 'ubuntu-latest']);
        }
        expect([j.preflight['timeout-minutes'], j.build['timeout-minutes'], j.inspect['timeout-minutes'], j.sign['timeout-minutes']]).toEqual([10, 120, 40, 20]);
        expect(j.preflight.if).toBeUndefined();
        expect(Object.keys(j).filter((k) => j[k].environment !== undefined).sort()).toEqual(['preflight', 'sign']);
        expect(j.build.outputs).toBeUndefined();
        expect(Object.keys(j.inspect.outputs || {})).toEqual(['checked_sha256']);
    });
});

describe('ステップの名前と順序（UT-255〜258）', () => {
    it('UT-255 verify の8ステップ（V1 checkout・V1b fetch・V2 prepare-js・V3 tsc・V4 jest・V5 baseline・V6 actionlint・V7 secrets）。V1 は sparse-checkout なし', () => {
        const steps = doc().jobs.verify.steps;
        expect(steps).toHaveLength(8);
        const body = (i: number) => w.allOfStep(steps[i]);
        expect(steps[0].uses).toMatch(/^actions\/checkout@/);
        expect((steps[0].with || {})['sparse-checkout']).toBeUndefined();
        expect(body(1)).toContain('git fetch');
        expect(steps[2].uses).toBe('./.github/actions/weaver-prepare-js');
        expect(body(3)).toMatch(/tsc --noEmit/);
        expect(body(3)).toMatch(/tsc\.log/);
        expect(body(3)).toMatch(/tsc\.exit/);
        expect(steps[3].shell).toBe('bash {0}');
        expect(body(4)).toMatch(/jest app\/weaver --ci --json --outputFile=.*jest\.json/);
        const v5 = body(5);
        for (const a of ['weaver_android_guard.sh baseline', '--tsc-log', '--tsc-exit', '--jest-json', '--baseline .github/android_baseline.json']) {
            expect(v5).toContain(a);
        }
        expect(steps[6].name).toBe('Workflow lint (actionlint)');
        expect(steps[7].name).toBe('Tracked secrets check');
    });

    it('UT-256 V5 の --allow-pending は mode が unsigned のときだけ付く（signed では付けない）', () => {
        const v5 = w.allOfStep(doc().jobs.verify.steps[5]);
        expect(v5).toMatch(/weaver_android_guard\.sh mode/);
        expect(v5).toMatch(/--allow-pending/);
        expect(v5).toMatch(/unsigned/);
    });

    it('UT-257 4jobのステップ名と順序（P1〜P6・B1〜B14（B7欠番）・I1〜I10（I11は廃止。v1.5）・G1〜G13）。bundleRelease のステップは無い', () => {
        const d = doc();
        for (const k of ['preflight', 'build', 'inspect', 'sign']) {
            expect([k, d.jobs[k].steps.map((x: any) => x.name)]).toEqual([k, w.NAMES[k]]);
        }
        expect(wfText()).not.toContain('bundleRelease');
    });

    it('UT-258 build 内でガード（B9〜B12）＜gradlew（B13）。./gradlew はファイル全体で B13 の1件だけ・bundleRelease は0件。inspect: I7＜I8＜I9＜I10。sign: G5＜G6＜G7＜G8＜G9・G10', () => {
        const d = w.loadReal();
        const b = (l: string) => w.stepIndex(d, 'build', l);
        for (const g of ['B9', 'B10', 'B11', 'B12']) {
            expect(b(g)).toBeLessThan(b('B13'));
        }
        const gradlew = (wfText().match(/\.\/gradlew/g) || []).length;
        expect(gradlew).toBe(1);
        expect(w.runOf(w.step(d, 'build', 'B13'))).toContain('./gradlew');
        const i = (l: string) => w.stepIndex(d, 'inspect', l);
        expect([i('I7') < i('I8'), i('I8') < i('I9'), i('I9') < i('I10')]).toEqual([true, true, true]);
        const g = (l: string) => w.stepIndex(d, 'sign', l);
        expect([g('G5') < g('G6'), g('G6') < g('G7'), g('G7') < g('G8'), g('G8') < g('G9'), g('G8') < g('G10')]).toEqual([true, true, true, true, true]);
        for (const j of ['inspect', 'sign', 'preflight']) {
            expect(JSON.stringify(d.jobs[j])).not.toContain('./gradlew');
        }
    });
});

describe('ステップ細目（UT-259〜270）', () => {
    it('UT-259 B1: sparse-checkout に /* と !/ios（末尾スラッシュなし）・cone-mode false・!/ios/ は0件', () => {
        const wi = st('build', 'B1').with;
        expect(wi['sparse-checkout']).toContain('/*');
        expect(wi['sparse-checkout']).toMatch(/^!\/ios$/m);
        expect(wi['sparse-checkout']).not.toContain('!/ios/');
        expect(wi['sparse-checkout-cone-mode']).toBe(false);
    });

    it('UT-260 B3・B5: Java temurin 17・B5 の if は !inputs.clear_cache・キーに hashFiles(lockfile 3つ)', () => {
        const b3 = st('build', 'B3');
        expect(b3.with.distribution).toBe('temurin');
        expect(String(b3.with['java-version'])).toBe('17');
        const b5 = st('build', 'B5');
        expect(b5.if).toContain('!inputs.clear_cache');
        expect(w.str(b5.with.key)).toContain("hashFiles('android/buildscript-gradle.lockfile', 'android/settings-gradle.lockfile', 'android/gradle/wrapper/gradle-wrapper.properties')");
    });

    it('UT-261 Decide signing mode（P3・B6・I3・G3）: id mode・mode の出力を2値と照合・GITHUB_OUTPUT のキーは signing だけ・GITHUB_ENV/PATH へ書かない。mode が不正値（改行入り・::・空）なら書かず rc≠0', () => {
        for (const [job, l] of [['preflight', 'P3'], ['build', 'B6'], ['inspect', 'I3'], ['sign', 'G3']]) {
            const step = st(job, l);
            expect(step.id).toBe('mode');
            const body = w.runOf(step);
            expect(body).toContain('weaver_android_guard.sh mode');
            expect(body).not.toMatch(/GITHUB_ENV|GITHUB_PATH/);
            expect((body.match(/GITHUB_OUTPUT/g) || []).length).toBeGreaterThanOrEqual(1);
            expect(body).not.toMatch(/needs\./);
            for (const bad of ['signed\nX=1', '::set-output name=a::b', '']) {
                const work = s.tmp('k79-mode-');
                s.write(work, '.github/scripts/weaver_android_guard.sh', `#!/usr/bin/env bash\nprintf '%s' "$FAKE_MODE_OUT"\n`);
                const r = w.runStep(step, {cwd: work, env: {FAKE_MODE_OUT: bad}});
                expect([job, JSON.stringify(bad), r.rc === 0]).toEqual([job, JSON.stringify(bad), false]);
                expect(r.outputFile).not.toMatch(/X=1|::/);
            }
            const work = s.tmp('k79-mode-');
            s.write(work, '.github/scripts/weaver_android_guard.sh', `#!/usr/bin/env bash\nprintf 'unsigned\\n'\n`);
            const ok = w.runStep(step, {cwd: work});
            expect(ok.rc).toBe(0);
            expect(ok.outputFile.trim()).toBe('signing=unsigned');
        }
    });

    it('UT-262 Restore upload keystore（P4・G6）: if が signed・id restore-keystore・復元先は $RUNNER_TEMP/weaver-upload.jks・chmod 600・tr -d で改行空白除去・GITHUB_ENV へは WEAVER_KEYSTORE_PATH だけ・env のキーは ANDROID_KEYSTORE_BASE64 の1つ', () => {
        for (const [job, l] of [['preflight', 'P4'], ['sign', 'G6']]) {
            const step = st(job, l);
            expect(step.if).toContain("steps.mode.outputs.signing == 'signed'");
            expect(step.id).toBe('restore-keystore');
            const body = w.runOf(step);
            expect(body).toContain('$RUNNER_TEMP/weaver-upload.jks');
            expect(body).not.toContain('GITHUB_WORKSPACE');
            expect(body).toMatch(/chmod 600/);
            expect(body).toMatch(/tr -d '\\r\\n '/);
            expect(Object.keys(step.env)).toEqual(['ANDROID_KEYSTORE_BASE64']);
            const envLines = body.split('\n').filter((x: string) => /GITHUB_ENV/.test(x));
            expect(envLines.every((x: string) => /WEAVER_KEYSTORE_PATH=/.test(x))).toBe(true);
            expect(envLines.length).toBeGreaterThanOrEqual(1);
            expect(body).not.toMatch(/PASSWORD/);
        }
    });

    it('UT-263 B8: weaver_android_inject_version.sh --gradle android/app/build.gradle --run-number ${{ github.run_number }} --app-version $APP_VERSION --base $VERSION_CODE_BASE', () => {
        const b = w.runOf(st('build', 'B8'));
        expect(b).toContain('weaver_android_inject_version.sh --gradle android/app/build.gradle');
        expect(b).toContain('--run-number');
        expect(b).toContain('--app-version');
        expect(b).toMatch(/--base "?\$\{?VERSION_CODE_BASE\}?"?/);
    });

    it('UT-264 B9・B10・I8・P5・G10 の呼び出し（引数・env の共通キー・--keystore-check skip は B9・B10 の2件だけ・signed の署名用3変数は P5・G7 のみ・渡さないオプション0件）', () => {
        const d = doc();
        const b9 = w.runOf(st('build', 'B9'));
        for (const a of ['weaver_android_guard.sh pre', '--mode confirm', '--signing "$SIGNING"', '--upload-to-play "$UPLOAD_TO_PLAY"', '--run-number "$RUN_NUMBER"', '--app-version "$APP_VERSION"', '--base "$VERSION_CODE_BASE"', '--cleartext forbid', '--keystore-check skip']) {
            expect([a, b9.includes(a)]).toEqual([a, true]);
        }
        const b10 = st('build', 'B10');
        expect(b10.if).toContain('inputs.for_submission');
        expect(w.runOf(b10)).toContain('--mode submission');
        expect(w.runOf(b10)).toContain('--keystore-check skip');
        const i8 = w.runOf(st('inspect', 'I8'));
        for (const a of ['weaver_android_guard.sh post', '--dir "$RUNNER_TEMP/weaver-aab-pre"', '--mode "$MODE"', '--signing unsigned', '--cleartext forbid']) {
            expect([a, i8.includes(a)]).toEqual([a, true]);
        }
        const p5 = w.runOf(st('preflight', 'P5'));
        for (const a of ['ag3 --phase pre', '--signing signed', '--keystore-check required']) {
            expect([a, p5.includes(a)]).toEqual([a, true]);
        }
        const g10 = w.runOf(st('sign', 'G10'));
        for (const a of ['ag3 --phase post', '--signing signed', '--cert-file "$RUNNER_TEMP/cert.txt"']) {
            expect([a, g10.includes(a)]).toEqual([a, true]);
        }
        const sk = (wfText().match(/--keystore-check skip/g) || []).length;
        expect(sk).toBe(2);
        for (const j of ['preflight', 'inspect', 'sign']) {
            expect(JSON.stringify(d.jobs[j])).not.toContain('--keystore-check skip');
        }
        const signGuardCalls = d.jobs.sign.steps.map(w.runOf).join('\n');
        expect(signGuardCalls).not.toMatch(/weaver_android_guard\.sh (pre|post)\b/);
        const envKeys = (l: string, j = 'build') => Object.keys(st(j, l).env || {});
        for (const [j, l] of [['build', 'B9'], ['build', 'B10'], ['inspect', 'I8']]) {
            for (const k of ['SIGNING', 'MODE', 'UPLOAD_TO_PLAY', 'APP_VERSION', 'VERSION_CODE_BASE', 'RUN_NUMBER', 'WEAVER_FIREBASE_PROJECT_ID', 'WEAVER_EXPECTED_CERT_SHA256']) {
                if (j === 'inspect' && (k === 'UPLOAD_TO_PLAY')) {
                    continue;
                }
                expect([l, k, envKeys(l, j).includes(k)]).toEqual([l, k, true]);
            }
        }
        const callsText = [st('build', 'B9'), st('build', 'B10'), st('inspect', 'I8'), st('preflight', 'P5'), st('sign', 'G10')].map(w.runOf).join('\n');
        for (const k of ['WEAVER_KEYSTORE_FILE', 'WEAVER_KEYSTORE_PASSWORD', 'WEAVER_KEY_ALIAS']) {
            const holders: string[] = [];
            for (const j of Object.keys(d.jobs)) {
                for (const x of d.jobs[j].steps) {
                    if (Object.keys(x.env || {}).includes(k)) {
                        holders.push(x.name);
                    }
                }
            }
            expect([k, holders.sort()]).toEqual([k, ['Check upload key (AG3 pre)', 'Sign AAB (jarsigner)']]);
        }
        for (const o of ['--allowlist', '--hash-list', '--google-services', '--application-id', '--root', '--user-ca', '--expected-sha256', '--firebase-project-id']) {
            expect([o, callsText.includes(o)]).toEqual([o, false]);
        }
        expect(w.runOf(st('preflight', 'P1'))).toBe('');
        for (const j of ['preflight', 'inspect', 'sign']) {
            for (const x of d.jobs[j].steps) {
                expect([j, x.name, /\$\{\{/.test(w.runOf(x))]).toEqual([j, x.name, false]);
            }
        }
    });

    it('UT-265 B11・B12: shared-only ガード（B12 は if: inputs.for_submission・--release 付き）', () => {
        expect(w.runOf(st('build', 'B11'))).toContain('bash .github/scripts/weaver_release_guard.sh --shared-only');
        const b12 = st('build', 'B12');
        expect(b12.if).toContain('inputs.for_submission');
        expect(w.runOf(b12)).toContain('--shared-only --release');
    });

    it('UT-266 B13・G7・G9: bundleUnsigned（if なし・3ABI）・ORG_GRADLE_PROJECT_ はワークフロー全体で0件・G7 は jarsigner（-verify なし）・G9 は jarsigner -verify・x86 単独指定0件', () => {
        const b13 = st('build', 'B13');
        expect(b13.if).toBeUndefined();
        expect(w.runOf(b13)).toContain('./gradlew bundleUnsigned -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64');
        expect(wfText()).not.toContain('ORG_GRADLE_PROJECT_');
        expect(JSON.stringify(b13.env || {})).not.toMatch(/KEYSTORE|KEY_ALIAS|secrets/);
        const g7 = st('sign', 'G7');
        expect(g7.if).toContain("steps.mode.outputs.signing == 'signed'");
        expect(g7.id).toBe('sign-aab');
        expect(w.runOf(g7)).toContain('jarsigner');
        expect(w.runOf(g7)).not.toContain('-verify');
        expect(w.runOf(st('sign', 'G9'))).toContain('jarsigner -verify');
        expect(wfText()).not.toMatch(/reactNativeArchitectures=[^\s"']*\bx86\b(?!_)/);
    });

    it('UT-267 I5: curl --fail --location・$BUNDLETOOL_VERSION・sha256sum -c（$BUNDLETOOL_SHA256）・latest 0件・WEAVER_BUNDLETOOL_JAR を GITHUB_ENV へ。bundletool の取得は inspect だけ', () => {
        const body = w.runOf(st('inspect', 'I5'));
        for (const a of ['curl --fail --location', '$BUNDLETOOL_VERSION', 'sha256sum -c', 'BUNDLETOOL_SHA256', 'WEAVER_BUNDLETOOL_JAR']) {
            expect([a, body.includes(a)]).toEqual([a, true]);
        }
        expect(body).not.toContain('latest');
        const d = doc();
        for (const j of ['build', 'preflight', 'sign']) {
            expect(JSON.stringify(d.jobs[j])).not.toMatch(/bundletool-all|BUNDLETOOL_VERSION/);
        }
    });

    it('UT-268 I8・I9・G11 の呼び出し（extract・16k・facts〔sign が自分の期待値から作る〕・summary）。I11 は廃止（v1.5）', () => {
        const i8 = w.runOf(st('inspect', 'I8'));
        for (const a of ['weaver_android_aab.sh extract', '--out "$RUNNER_TEMP/weaver-aab-pre"', '--aab "$AAB"']) {
            expect([a, i8.includes(a)]).toEqual([a, true]);
        }
        expect(w.runOf(st('inspect', 'I9'))).toContain('weaver_android_16k_check.sh "$RUNNER_TEMP/weaver-aab-pre/universal.apk"');
        expect(d0().jobs.inspect.steps).toHaveLength(10);
        expect(JSON.stringify(d0().jobs.inspect)).not.toMatch(/facts/);
        const g11 = st('sign', 'G11');
        const body = w.runOf(g11);
        expect(body).toContain('weaver_android_aab.sh facts --version "$APP_VERSION" --version-code "$VERSION_CODE" --run "$RUN_NUMBER" --out "$RUNNER_TEMP/facts.txt"');
        for (const k of ['SIGNING', 'MODE', 'APP_VERSION', 'VERSION_CODE_BASE', 'RUN_NUMBER', 'AAB']) {
            expect([k, Object.keys(g11.env).includes(k)]).toEqual([k, true]);
        }
        expect(body).toContain('VERSION_CODE=$((VERSION_CODE_BASE + RUN_NUMBER))');
        expect(body).toContain('weaver_android_aab.sh summary');
        for (const a of ['--facts "$RUNNER_TEMP/facts.txt"', '--run "$RUN_NUMBER"', '--expect-version "$APP_VERSION"', '--expect-version-code "$VERSION_CODE"']) {
            expect([a, body.includes(a)]).toEqual([a, true]);
        }
        expect(body).toContain('GITHUB_STEP_SUMMARY');
    });

    it('UT-269 G12: if が inputs.upload_to_play・本文が exit 1 で終わる・Play へ送るアクション・コマンドは0件', () => {
        const g12 = st('sign', 'G12');
        expect(g12.if).toContain('inputs.upload_to_play');
        expect(w.runOf(g12).trim().split('\n').pop()).toMatch(/exit 1$/);
        expect(wfText()).not.toMatch(/upload-google-play|r0adkll|fastlane supply|androidpublisher/);
    });

    it('UT-270 artifact 2種類（B14・G13。facts artifact は廃止＝v1.5）: 名前に run_attempt・retention-days 1/14・facts artifact が0件・path・overwrite 0件・path は ${{ runner.temp }} 形', () => {
        const b14 = st('build', 'B14');
        expect(b14.if).toBe('success()');
        expect(b14.with.name).toBe('weaver-android-unchecked-${{ github.run_number }}-a${{ github.run_attempt }}');
        expect(b14.with['retention-days']).toBe(1);
        expect(b14.with['if-no-files-found']).toBe('error');
        expect(String(b14.with.path).split('\n').map((x: string) => x.trim()).filter(Boolean)).toHaveLength(2);
        const ups = Object.keys(doc().jobs).flatMap((j) => doc().jobs[j].steps.filter((x: any) => /upload-artifact/.test(x.uses || '')).map((x: any) => `${j}/${x.name}`));
        expect(ups.filter((x: string) => !x.startsWith('verify/')).sort()).toEqual(['build/Hash and upload unchecked AAB', 'sign/Upload final artifact']);
        expect(wfText()).not.toMatch(/weaver-android-facts|facts-in/);
        const g13 = st('sign', 'G13');
        expect(g13.if).toBe('success()');
        expect(String(g13.with.name)).toMatch(/^weaver-android-aab-\$\{\{ github\.run_number \}\}-a\$\{\{ github\.run_attempt \}\}-/);
        expect(g13.with['retention-days']).toBe(14);
        expect(wfText()).not.toContain('overwrite');
        for (const x of [b14, g13]) {
            expect(String(x.with.path)).toMatch(/\$\{\{ runner\.temp \}\}\//);
            expect(String(x.with.path)).not.toMatch(/\*\.jks|\*\.keystore|google-services\.json|weaver-aab|\*\.json/);
        }
    });
});

describe('uses・秘密・iOS・参照整合（UT-271〜276）', () => {
    it('UT-271 uses の集合と固定（preflight・inspect・sign は4種類だけでSHA40固定。cache・setup-node・./.github/actions は不在）', () => {
        const d = doc();
        const all = new Set<string>();
        for (const j of J) {
            for (const x of d.jobs[j].steps) {
                if (typeof x.uses === 'string') {
                    all.add(x.uses.split('@')[0]);
                    if (['preflight', 'inspect', 'sign'].includes(j)) {
                        expect([j, x.uses, w.SHA40.test(x.uses.split('@')[1] || '')]).toEqual([j, x.uses, true]);
                    }
                }
            }
        }
        for (const a of all) {
            expect([a, [...w.ALLOWED_USES, './.github/actions/weaver-prepare-js'].includes(a)]).toEqual([a, true]);
        }
        expect(w.checks.R9(d)).toEqual([]);
    });

    it('UT-272 秘密の扱い: secrets. の参照名は3つ・参照ステップは P4・P5・G6・G7 の4つ（出現6件）・vars は2つ・run に secrets 0件・set -x・echo で秘密を出す行0件', () => {
        const d = doc();
        const refs = w.secretRefs(d);
        expect(refs).toHaveLength(6);
        expect([...new Set(refs.map((r: any) => r.text))].sort()).toEqual(w.SECRET_NAMES.map((n: string) => 'secrets.' + n).sort());
        expect([...new Set(refs.map((r: any) => `${r.job}/${r.step}`))].sort()).toEqual(['preflight/Check upload key (AG3 pre)', 'preflight/Restore upload keystore', 'sign/Restore upload keystore', 'sign/Sign AAB (jarsigner)']);
        const t = wfText();
        expect([...new Set((t.match(/vars\.[A-Z0-9_]+/g) || []))].sort()).toEqual(['vars.ANDROID_SIGNING_CERT_SHA256', 'vars.FIREBASE_PROJECT_ID']);
        const runs = J.flatMap((j) => d.jobs[j].steps.map(w.runOf)).join('\n');
        expect(runs).not.toMatch(/secrets\./);
        expect(runs).not.toMatch(/set -x|(echo|printf)[^\n]*(PASSWORD|KEYSTORE_BASE64)/);
    });

    it('UT-273 iOS 依存の文字列（ios/・configure_manual_signing・weaver-ios）は0件', () => {
        const t = wfText().replace(/!\/ios\b/g, '');
        expect(t).not.toMatch(/ios\/|configure_manual_signing|weaver-ios/);
    });

    it('UT-274 参照整合: needs の参照先・checked_sha256 の参照元・needs.build 参照0件・steps.mode の参照元が同じjob内', () => {
        const d = doc();
        for (const [k, need] of Object.entries({build: ['verify', 'preflight'], inspect: ['build'], sign: ['preflight', 'build', 'inspect']})) {
            for (const n of need as string[]) {
                expect([k, n, Object.keys(d.jobs).includes(n)]).toEqual([k, n, true]);
            }
        }
        const i10 = st('inspect', 'I10');
        expect(i10.id).toBe('checked');
        expect(d.jobs.inspect.outputs.checked_sha256).toContain('steps.checked.outputs.sha256');
        const t = JSON.stringify(d.jobs.inspect) + JSON.stringify(d.jobs.sign);
        expect(t).not.toMatch(/needs\.build\./);
        for (const j of J) {
            const job = d.jobs[j];
            const uses = JSON.stringify(job).includes('steps.mode.outputs.signing');
            if (uses) {
                expect([j, job.steps.some((x: any) => x.id === 'mode')]).toEqual([j, true]);
            }
        }
        const text = wfText();
        expect((text.match(/\$\{\{/g) || []).length).toBe((text.match(/\}\}/g) || []).length);
    });

    it('UT-275 kind の決定式: 署名なし→unsigned-verification-only／署名あり×for_submission→submission／署名あり→confirm の3値だけ。kind は sign 自身の mode から', () => {
        const g11 = w.runOf(st('sign', 'G11'));
        expect(g11).toContain('unsigned-verification-only');
        expect(g11).toContain('KIND=');
        const t = wfText();
        const kinds = new Set((t.match(/unsigned-verification-only|submission|confirm/g) || []));
        expect([...kinds].sort()).toEqual(['confirm', 'submission', 'unsigned-verification-only']);
        expect(g11).not.toMatch(/needs\./);
    });

    it('UT-276 環境ファイルへ書く箇所の全数（§4.1.1の表と一致・GITHUB_PATH は全jobで0件）', () => {
        expect(w.checks.R10(doc())).toEqual([]);
        expect(wfText()).not.toMatch(/>>\s*"?\$GITHUB_PATH/);
        const d = doc();
        const tools = w.runOf(st('build', 'B4'));
        for (const k of ['WEAVER_KEYTOOL', 'WEAVER_AAPT2', 'WEAVER_ZIPALIGN', 'WEAVER_DEXDUMP', 'WEAVER_OBJDUMP']) {
            expect([k, tools.includes('GITHUB_ENV') || tools.includes(k)]).toEqual([k, true]);
        }
        expect(w.runOf(st('inspect', 'I10'))).toMatch(/sha256=/);
        expect(d).toBeTruthy();
    });
});

describe('呼び出し・取得の細目（UT-324・335〜337・344）', () => {
    it('UT-324 guard の pre・post の呼び出しはちょうど3か所（B9・B10・I8）・全て --cleartext forbid・allow/deny/--user-ca/ag6 直呼び0件・直接呼ぶ個別ガードは P5・G10 の ag3 だけ', () => {
        const d = doc();
        const calls: string[] = [];
        for (const j of J) {
            for (const x of d.jobs[j].steps) {
                for (const m of w.runOf(x).matchAll(/weaver_android_guard\.sh\s+(pre|post)\b[^\n]*/g)) {
                    calls.push(`${j}/${x.name}`);
                    expect(m[0]).toContain('--cleartext forbid');
                }
            }
        }
        expect(calls.sort()).toEqual(['build/Android guard (always)', 'build/Android guard (submission build)', 'inspect/Pre-sign checks'].sort());
        const t = wfText();
        expect(t).not.toMatch(/--cleartext (allow|deny)|--user-ca|guard\.sh\s+ag6/);
        const direct: string[] = [];
        for (const j of J) {
            for (const x of d.jobs[j].steps) {
                for (const m of w.runOf(x).matchAll(/weaver_android_guard\.sh\s+(ag\d+)\b/g)) {
                    direct.push(`${j}/${x.name}:${m[1]}`);
                }
            }
        }
        expect(direct.filter((x) => !x.startsWith('verify/')).sort()).toEqual(['preflight/Check upload key (AG3 pre):ag3', 'sign/Check certificate:ag3'].sort());
        expect(w.stepIndex(d, 'build', 'B9')).toBeLessThan(w.stepIndex(d, 'build', 'B13'));
        expect(w.stepIndex(d, 'build', 'B10')).toBeLessThan(w.stepIndex(d, 'build', 'B13'));
        expect(w.stepIndex(d, 'inspect', 'I7')).toBeLessThan(w.stepIndex(d, 'inspect', 'I8'));
        expect(w.stepIndex(d, 'inspect', 'I8')).toBeLessThan(w.stepIndex(d, 'inspect', 'I10'));
    });

    it('UT-335 V1b Fetch reference commits: V1 の後・V4（jest）の前・40桁2件の fetch・fail-closed（continue-on-error・|| true・set +e 0件）。fetch が rc=1 ならステップも失敗', () => {
        const steps = doc().jobs.verify.steps;
        const v1b = steps[1];
        expect(v1b.name).toMatch(/Fetch reference commits/);
        const body = w.runOf(v1b);
        expect(body).toContain('git fetch --no-tags --depth=1 origin 01fbf86bb8ed42e66ecf1e0f33485ebd4b9c37af 0c0d6c48ecd1432a80ecdbe69aafa394af49d03c');
        expect(body).not.toMatch(/\|\|\s*true|set \+e/);
        expect(v1b['continue-on-error']).toBeUndefined();
        const stub = s.makeStubs(['git']);
        const r = w.runStep(v1b, {stubDir: stub.dir, env: {STUB_GIT_RC: '1'}});
        expect(r.rc).not.toBe(0);
        expect(w.runStep(v1b, {stubDir: s.makeStubs(['git']).dir}).rc).toBe(0);
    });

    it('UT-336 V6 actionlint: curl --fail --location・版固定・sha256sum -c・対象は aab.yml と smoke-trial.yml の2ファイルだけ・|| true 0件', () => {
        const body = w.runOf(doc().jobs.verify.steps[6]);
        for (const a of ['curl --fail --location', 'ACTIONLINT_VERSION', 'sha256sum -c', '.github/workflows/weaver-android-aab.yml', '.github/workflows/weaver-android-smoke-trial.yml']) {
            expect([a, body.includes(a)]).toEqual([a, true]);
        }
        expect(body).not.toMatch(/latest|\|\|\s*true|weaver-ios|workflows\/\*/);
    });

    it('UT-337 V7: bash .github/scripts/weaver_android_guard.sh ag10 --root . を実行。build 側に ag10 の直接呼び出しは0件', () => {
        expect(w.runOf(doc().jobs.verify.steps[7])).toContain('bash .github/scripts/weaver_android_guard.sh ag10 --root .');
        expect(JSON.stringify(doc().jobs.build)).not.toMatch(/guard\.sh ag10/);
    });

    it('UT-344 G7・G9 の細目: jarsigner の引数1つだけ（-keystore "$WEAVER_KEYSTORE_FILE" -storepass:env WEAVER_KEYSTORE_PASSWORD -sigalg SHA256withRSA -digestalg SHA-256 "$AAB" "$WEAVER_KEY_ALIAS"）・env のキー4つ（AAB＋署名用3変数）・-keypass／-tsa／-storepass <値> は0件・AAB は各ステップの env', () => {
        const d = doc();
        const g7 = st('sign', 'G7');
        const body = w.runOf(g7);
        expect(body).toContain('"$JAVA_HOME/bin/jarsigner" -keystore "$WEAVER_KEYSTORE_FILE" -storepass:env WEAVER_KEYSTORE_PASSWORD -sigalg SHA256withRSA -digestalg SHA-256 "$AAB" "$WEAVER_KEY_ALIAS"');
        // v1.5: -keystore を含む行は G7 の1つだけ（ワークフロー全体でも1つ）。-verify は G9 の1行だけ
        const keystoreLines = wfText().split('\n').filter((l: string) => /(^|\s)-keystore\s/.test(l));
        expect(keystoreLines).toHaveLength(1);
        expect(body.split('\n').filter((l: string) => /(^|\s)-keystore\s/.test(l))).toHaveLength(1);
        const verifyLines = wfText().split('\n').filter((l: string) => /jarsigner[^\n]*\s-verify\b/.test(l) && !/^\s*(echo|printf|#)/.test(l));
        expect(verifyLines).toHaveLength(1);
        expect(w.runOf(st('sign', 'G9')).split('\n').filter((l: string) => /\s-verify\b/.test(l) && !/^\s*(echo|printf|#)/.test(l))).toHaveLength(1);
        expect(w.runOf(st('sign', 'G9'))).not.toMatch(/-keystore|-storepass|-sigalg/);
        // §4.3.4: G7 が読む環境変数は AAB・WEAVER_KEYSTORE_FILE・WEAVER_KEYSTORE_PASSWORD・WEAVER_KEY_ALIAS の4つ（AAB は各ステップの env。D-63）。署名用の3変数は G7 と P5 だけ
        expect(Object.keys(g7.env).sort()).toEqual(['AAB', 'WEAVER_KEYSTORE_FILE', 'WEAVER_KEYSTORE_PASSWORD', 'WEAVER_KEY_ALIAS']);
        expect(g7.env.WEAVER_KEYSTORE_FILE).toBe('${{ env.WEAVER_KEYSTORE_PATH }}');
        expect(body).not.toMatch(/-keypass|-tsa|-storepass\s+[^:]/);
        expect(body).not.toContain('weaver_android_guard');
        const g9 = st('sign', 'G9');
        expect(g9.if).toContain("steps.mode.outputs.signing == 'signed'");
        expect(g9.if).not.toContain('always()');
        for (const x of d.jobs.sign.steps.filter((y: any) => /\$\{?AAB\b/.test(w.runOf(y)))) {
            expect([x.name, (x.env || {}).AAB]).toEqual([x.name, AAB_EXPR]);
        }
        expect(d.jobs.sign.env).toBeUndefined();
        expect(Object.keys(st('build', 'B13').env || {}).filter((k) => /KEYSTORE|ALIAS/.test(k))).toEqual([]);
    });
});

describe('権限・Environment・artifact 名の静的検査（UT-360・361・370）', () => {
    it('UT-360 5jobとトップに contents: read・preflight/inspect/sign の checkout は persist-credentials: false・I6・G4 に run-id/github-token/repository なし・path と名前に run_attempt・pattern/merge-multiple/overwrite 0件・retention 1/144', () => {
        const d = doc();
        for (const j of ['preflight', 'inspect', 'sign']) {
            const co = d.jobs[j].steps.find((x: any) => /actions\/checkout/.test(x.uses || ''));
            expect([j, co.with['persist-credentials']]).toEqual([j, false]);
        }
        for (const [j, l] of [['inspect', 'I6'], ['sign', 'G4']]) {
            for (const x of d.jobs[j].steps.filter((y: any) => /download-artifact/.test(y.uses || ''))) {
                for (const k of ['run-id', 'github-token', 'repository', 'pattern', 'merge-multiple']) {
                    expect([l, k, (x.with || {})[k]]).toEqual([l, k, undefined]);
                }
                expect(w.str(x.with.name)).toContain('github.run_attempt');
            }
        }
        expect(wfText()).not.toContain('overwrite');
        expect(lsNear('sign', 'G4')).toBe(true);
        expect(lsNear('inspect', 'I6')).toBe(true);
        expect(st('build', 'B14').with['retention-days']).toBe(1);
        expect(st('sign', 'G13').with['retention-days']).toBe(14);
    });

    it('UT-361 Environment の式（preflight と sign で同一）・preflight に if なし・P1 の sparse-checkout は /.github と /app/weaver/constants.ts だけ・P1〜P3 無条件・P4〜P6 は signed のときだけ・P5 は --keystore-check required', () => {
        const d = doc();
        const expr = "${{ github.ref == 'refs/heads/main' && 'android-upload-key' || 'android-unsigned' }}";
        expect(d.jobs.preflight.environment).toBe(expr);
        expect(d.jobs.sign.environment).toBe(expr);
        for (const j of ['verify', 'build', 'inspect']) {
            expect(d.jobs[j].environment).toBeUndefined();
        }
        expect(d.jobs.preflight.if).toBeUndefined();
        const p1 = st('preflight', 'P1');
        expect(String(p1.with['sparse-checkout']).split('\n').map((x: string) => x.trim()).filter(Boolean).sort()).toEqual(['/.github', '/app/weaver/constants.ts']);
        expect(p1.with['persist-credentials']).toBe(false);
        for (const l of ['P1', 'P2', 'P3']) {
            expect([l, st('preflight', l).if]).toEqual([l, undefined]);
        }
        for (const l of ['P4', 'P5']) {
            expect(st('preflight', l).if).toContain("steps.mode.outputs.signing == 'signed'");
        }
        expect(st('preflight', 'P6').if).toMatch(/always\(\)/);
        expect(st('preflight', 'P6').if).toContain('signed');
        expect(w.runOf(st('preflight', 'P5'))).toContain('--keystore-check required');
    });

    it('UT-370 artifact 名の run_attempt: 2種類（B14・G13）に含む・inspect と sign は自分の run_attempt の名前で取得・同じ run の再実行で -a1→-a2 と変わる（名前の組立は run_number と run_attempt の2要素）', () => {
        const d = doc();
        for (const x of [st('build', 'B14'), st('sign', 'G13')]) {
            expect(w.str(x.with.name)).toContain('github.run_attempt');
        }
        const dl = [...d.jobs.inspect.steps, ...d.jobs.sign.steps].filter((x: any) => /download-artifact/.test(x.uses || ''));
        expect(dl).toHaveLength(2); // inspect の I6 と sign の G4 の1つずつ（G4 は AAB と aab.sha256 の1 artifact だけ。facts は取得しない）
        for (const x of dl) {
            expect(w.str(x.with.name)).toMatch(/\$\{\{ github\.run_number \}\}-a\$\{\{ github\.run_attempt \}\}/);
            expect(w.str(x.with.name)).not.toContain('needs.');
        }
        expect(wfText()).not.toContain('overwrite');
    });
});
