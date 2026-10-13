// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: composite weaver-prepare-js（UT-277〜282）・smoke-trial（UT-283〜286）。詳細設計 §4.4・§4.7

export {};

const s = require('./android_test_support.cjs');
const w = require('./android_workflow_rules.cjs');
const yaml = require('js-yaml');

jest.setTimeout(120000);
afterAll(() => s.cleanup());

const comp = () => yaml.load(s.read(s.COMPOSITE));
const compSteps = () => comp().runs.steps as any[];
const SMOKE = () => yaml.load(s.read(s.SMOKE));

describe('composite weaver-prepare-js（詳細設計 §4.4）', () => {
    it('UT-277 runs.using は composite・inputs なし・run を持つ全ステップに shell: bash', () => {
        const c = comp();
        expect(c.runs.using).toBe('composite');
        expect(c.inputs).toBeUndefined();
        for (const x of c.runs.steps) {
            if (x.run !== undefined) {
                expect([x.name, x.shell]).toEqual([x.name, 'bash']);
            }
        }
    });

    it('UT-278 ステップの内容と順序: ①setup-node@v4（node-version-file .nvmrc・cache npm）②npm install --ignore-scripts③フォント複製（2か所）④patch-package⑤generate-assets⑥generate-compass-glyph-map⑦sounds の複製⑧jetify', () => {
        const steps = compSteps();
        const all = steps.map((x) => `${x.uses || ''}\n${x.run || ''}\n${JSON.stringify(x.with || {})}`);
        const at = (re: RegExp) => all.findIndex((t) => re.test(t));
        const order = [
            at(/actions\/setup-node@v4/),
            at(/npm (install|ci) --ignore-scripts/),
            at(/compass-icons\.ttf/),
            at(/npx patch-package/),
            at(/node scripts\/generate-assets\.js/),
            at(/node scripts\/generate-compass-glyph-map\.mjs/),
            at(/assets\/sounds/),
        ];
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(steps[order[0]].with['node-version-file']).toBe('.nvmrc');
        expect(steps[order[0]].with.cache).toBe('npm');
        const fonts = all[order[2]];
        expect(fonts).toContain('assets/fonts/');
        expect(fonts).toContain('android/app/src/main/assets/fonts/');
        expect(all[order[6]]).toContain('android/app/src/main/res/raw/');
        const jet = at(/jetify/);
        if (jet >= 0) {
            expect(jet).toBeGreaterThan(order[6]);
        }
    });

    it('UT-279 @sentry/cli・sentry の取得コマンドは composite・ワークフロー全文に0件', () => {
        const t = s.read(s.COMPOSITE) + s.read(s.WORKFLOW);
        expect(t).not.toMatch(/@sentry\/cli|sentry-cli|install\.js/);
    });

    it('UT-280 verify・build のワークフローに npm install・npm ci・patch-package は0件（二重定義なし）・両 job が ./.github/actions/weaver-prepare-js を1回ずつ使う', () => {
        const d = w.loadReal();
        for (const j of ['verify', 'build']) {
            const t = JSON.stringify(d.jobs[j]);
            expect(t).not.toMatch(/npm install|npm ci|patch-package/);
            const n = d.jobs[j].steps.filter((x: any) => x.uses === './.github/actions/weaver-prepare-js').length;
            expect([j, n]).toEqual([j, 1]);
        }
    });

    it('UT-281【既】参照先の存在: .nvmrc・scripts/generate-assets.js・scripts/generate-compass-glyph-map.mjs・compass-icons の元・assets/sounds/', () => {
        for (const rel of ['.nvmrc', 'scripts/generate-assets.js', 'scripts/generate-compass-glyph-map.mjs', 'node_modules/@mattermost/compass-icons', 'assets/sounds']) {
            expect([rel, s.exists(rel)]).toEqual([rel, true]);
        }
    });

    it('UT-282 S4 の開始条件（段階ゲート）: 段階値 S1〜S3 は npm install --ignore-scripts（npm ci 0件）、S4 は npm ci --ignore-scripts（npm install 0件）・package-lock.json がクリーン。値ファイルが無い・S1〜S4 以外は失敗', () => {
        const st = s.stage();
        const t = s.read(s.COMPOSITE);
        if (st === 'S4') {
            expect(t).toMatch(/npm ci --ignore-scripts/);
            expect(t).not.toMatch(/npm install/);
            expect(s.git(['status', '--porcelain', 'package-lock.json']).out.toString().trim()).toBe('');
        } else {
            expect(t).toMatch(/npm install --ignore-scripts/);
            expect(t).not.toMatch(/npm ci/);
        }
    });
});

describe('weaver-android-smoke-trial.yml（詳細設計 §4.7）', () => {
    it('UT-283 on は workflow_dispatch のみ・入力 aab_run_id・permissions は contents: read と actions: read だけ・download-artifact@v4 が run-id と github-token を指定', () => {
        const d = SMOKE();
        const on = d.on ?? d[true as any];
        expect(Object.keys(on)).toEqual(['workflow_dispatch']);
        expect(Object.keys(on.workflow_dispatch.inputs)).toContain('aab_run_id');
        expect(d.permissions).toEqual({contents: 'read', actions: 'read'});
        const dl = Object.values(d.jobs).flatMap((j: any) => j.steps).find((x: any) => /actions\/download-artifact@v4/.test(x.uses || ''));
        expect(dl.with['run-id']).toBeDefined();
        expect(dl.with['github-token']).toBeDefined();
    });

    it('UT-284 am start -W -n com.metarchitect.Weaver/com.mattermost.rnbeta.MainActivity が1件・待機20秒・pidof com.metarchitect.Weaver・logcat -d の FATAL EXCEPTION が0行であることの判定', () => {
        const t = s.read(s.SMOKE);
        expect((t.match(/am start -W -n com\.metarchitect\.Weaver\/com\.mattermost\.rnbeta\.MainActivity/g) || []).length).toBe(1);
        expect(t).toMatch(/sleep 20/);
        expect(t).toContain('pidof com.metarchitect.Weaver');
        expect(t).toMatch(/logcat -d/);
        expect(t).toContain('FATAL EXCEPTION');
    });

    it('UT-285 secrets. 0件・使い捨て鍵（keytool -genkeypair を実行内で呼ぶ）・本体 weaver-android-aab.yml に emulator・avdmanager・adb の語0件', () => {
        const t = s.read(s.SMOKE);
        expect(t).not.toMatch(/secrets\./);
        expect(t).toMatch(/keytool -genkeypair/);
        expect(s.read(s.WORKFLOW)).not.toMatch(/\b(emulator|avdmanager|adb)\b/);
    });

    it('UT-286 smoke-trial の bundletool の版と sha256 が本体の BUNDLETOOL_VERSION・BUNDLETOOL_SHA256 と同一', () => {
        const main = w.loadReal().env;
        const t = s.read(s.SMOKE);
        expect(t).toContain(String(main.BUNDLETOOL_VERSION));
        expect(t).toContain(String(main.BUNDLETOOL_SHA256));
    });
});
