// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループO（UT-137〜UT-141, UT-244〜UT-249, IT-09）: .github/workflows/weaver-ios-testflight.yml の配線（静的）
// 詳細設計 §3.13: ガードは「Update Info.plist」の直後。--release は入力 for_submission にだけ結び付く（upload_to_testflight ではない）。
// 確認用／提出用の区別: 入力 for_submission（boolean・既定 false）、Summary の SUBMISSION BUILD／CONFIRM BUILD、成果物名 -confirm／-submission。

const yaml = require('js-yaml');
const support = require('./weaver_test_support.cjs');

const WF = '.github/workflows/weaver-ios-testflight.yml';

type Step = {name?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, unknown>; 'continue-on-error'?: unknown};
const load = () => yaml.load(support.read(WF)) as {on: {workflow_dispatch: {inputs: Record<string, {type?: string; default?: unknown}>}}; jobs: Record<string, {steps: Step[]}>};
const steps = (): Step[] => Object.values(load().jobs)[0].steps;
const nameIdx = (prefix: string) => steps().findIndex((s) => (s.name || '').startsWith(prefix));
const guardIdx = () => steps().map((s, i) => ((s.run || '').includes('weaver_release_guard.sh') ? i : -1)).filter((i) => i >= 0);
const stepText = (s: Step) => JSON.stringify(s);

describe('weaver-ios-testflight.yml（§3.13）', () => {
    it('UT-137 js-yaml で構文解析できる', () => {
        expect(() => load()).not.toThrow();
        expect(steps().length).toBeGreaterThan(10);
    });

    it('UT-138 step の並び: Configure manual signing → Update Info.plist → ガードstep（直後・連続）→ Create exportOptions.plist', () => {
        const manual = nameIdx('Configure manual signing');
        const plist = nameIdx('Update Info.plist');
        const exportOpts = nameIdx('Create exportOptions.plist');
        const guards = guardIdx();
        expect(manual).toBeGreaterThanOrEqual(0);
        expect(plist).toBeGreaterThan(manual);
        expect(guards.length).toBeGreaterThan(0);
        expect(guards[0]).toBe(plist + 1);
        guards.forEach((g, i) => expect(g).toBe(plist + 1 + i));
        expect(exportOpts).toBe(plist + 1 + guards.length);
    });

    it('UT-139 --release は for_submission と結び付き、upload_to_testflight とは結び付かない。引数なしの呼び出しもある', () => {
        const guards = guardIdx().map((i) => steps()[i]);
        expect(guards.length).toBeGreaterThan(0);
        const text = guards.map(stepText).join('\n');
        expect(text).toContain('--release');
        expect(text).toContain('for_submission');
        expect(text).not.toContain('upload_to_testflight');
        const callLines = guards.flatMap((s) => (s.run || '').split('\n')).filter((l) => l.includes('weaver_release_guard.sh'));
        expect(callLines.some((l) => !l.includes('--release') || l.includes('$'))).toBe(true);
    });

    it('UT-140 ガードstepの抜け道が無い: continue-on-error・|| true・set +e が無い', () => {
        expect(guardIdx().length).toBeGreaterThan(0);
        for (const g of guardIdx()) {
            const s = steps()[g];
            expect(s['continue-on-error']).toBeUndefined();
            expect(s.run).not.toMatch(/\|\|\s*(true|:)\b/);
            expect(s.run).not.toMatch(/set\s+\+e/);
        }
    });

    it('UT-141 呼び出し形式: bash .github/scripts/weaver_release_guard.sh', () => {
        const callLines = guardIdx().flatMap((i) => (steps()[i].run || '').split('\n')).filter((l) => l.includes('weaver_release_guard.sh'));
        expect(callLines.length).toBeGreaterThan(0);
        for (const l of callLines) {
            expect(l.trim()).toMatch(/^(?:[A-Za-z_]+=\S*\s+)*bash \.github\/scripts\/weaver_release_guard\.sh(\s|$)/);
        }
    });

    it('UT-244 入力 for_submission が boolean・既定 false で追加されている', () => {
        const input = load().on.workflow_dispatch.inputs.for_submission;
        expect(input).toBeDefined();
        expect(input.type).toBe('boolean');
        expect(input.default).toBe(false);
    });

    it('UT-245 Summary: SUBMISSION BUILD／CONFIRM BUILD を GITHUB_STEP_SUMMARY に書き、それぞれ for_submission で分岐。run_number・版を含む', () => {
        const withSub = steps().filter((s) => (s.run || '').includes('SUBMISSION BUILD'));
        const withConfirm = steps().filter((s) => (s.run || '').includes('CONFIRM BUILD'));
        expect(withSub.length).toBeGreaterThan(0);
        expect(withConfirm.length).toBeGreaterThan(0);
        for (const s of [...withSub, ...withConfirm]) {
            const t = stepText(s);
            expect(t).toContain('GITHUB_STEP_SUMMARY');
            expect(t).toContain('for_submission');
            expect(t).toMatch(/run_number|RUN_NUMBER/);
            expect(t).toMatch(/APP_VERSION|2\.45\.0/);
        }
        expect(withSub.map(stepText).join('\n')).toContain('guard --release PASSED');
    });

    it('UT-246 成果物名: weaver-ios-ipa-<run番号>-confirm／-submission の両方が生成され、run_number を含む', () => {
        const names = steps().filter((s) => String(s.uses || '').startsWith('actions/upload-artifact')).map((s) => String((s.with || {}).name || '')).filter((n) => n.includes('weaver-ios-ipa-'));
        const all = names.join('\n');
        expect(all).toContain('-confirm');
        expect(all).toContain('-submission');
        expect(all).toContain('github.run_number');
    });

    it('UT-249 TestFlight へのアップロードは従来どおり upload_to_testflight で制御される（回帰）', () => {
        const up = steps().find((s) => s.name === 'Upload to TestFlight');
        expect(up).toBeDefined();
        expect(String(up?.if)).toContain('upload_to_testflight');
    });
});

describe('ワークフローとガードの結合（IT-09）', () => {
    it('IT-09 ガードstep の呼び出し行（引数の順 [--release] [ROOT]・スクリプトのパス）が実スクリプトで有効: 実在するパスで ROOT=N を --release あり・なしの両方で実行して終了コード0', () => {
        const wf = yaml.load(support.read(WF)) as {jobs: Record<string, {steps: Array<{run?: string}>}>};
        const wfSteps = Object.values(wf.jobs)[0].steps;
        const callLines: string[] = wfSteps.flatMap((s) => (s.run || '').split('\n')).filter((l) => l.includes('weaver_release_guard.sh'));
        expect(callLines.length).toBeGreaterThan(0);
        for (const line of callLines) {
            const tokens = line.trim().replace(/^(?:[A-Za-z_]+=\S*\s+)*/, '').split(/\s+/);
            expect(tokens[0]).toBe('bash');
            expect(support.exists(tokens[1])).toBe(true);
            for (const t of tokens.slice(2)) {
                expect(t === '--release' || t.startsWith('$')).toBe(true);
            }
        }
        const root: string = support.makeFixture();
        try {
            for (const args of [['--release', root], [root]]) {
                const r = support.runGuard(args);
                expect({args: args.length, status: r.status, out: r.out}).toEqual({args: args.length, status: 0, out: r.out});
            }
        } finally {
            support.removeFixture(root);
        }
    });
});
