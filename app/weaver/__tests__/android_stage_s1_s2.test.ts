// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①・追加）: 詳細設計 v1.4 §1.4 の段階別ワークフロー（D-K79R0-74）
//   S1: build は needs を持たない／verify は失敗しても tsc.log・tsc.exit・jest.json を if: always() の artifact に残す
//   S2: build.needs が [verify, preflight]／S1のインライン測定手順が残っていない（aab.sh tools・extract に置換済み）
// 段階値 .github/android_stage.txt を読む。S2側は段階値が S1 の間は実行しない（skip。合格に数えない旨を注記）。

export {};

const s = require('./android_test_support.cjs');
const w = require('./android_workflow_rules.cjs');

jest.setTimeout(60000);
afterAll(() => s.cleanup());

const stageNow = (): string => s.stage();
const notS1 = (() => {
    try {
        return stageNow() !== 'S1';
    } catch (e) {
        return true; // 段階値が読めない場合は S2 側も実行して失敗させる（読めない段階を成功にしない）
    }
})();
const itS2 = notS1 ? it : it.skip;

describe('S1 の骨格（段階値 S1）', () => {
    it('UT-374 S1: build は needs を持たない（verify のjestがS2まで必ず失敗するため）。S1ではjobは verify・build の2つだけ', () => {
        if (stageNow() !== 'S1') {
            return; // S2以降は下の S2 側が担う
        }
        const d = w.loadReal();
        expect(Object.keys(d.jobs).sort()).toEqual(['build', 'verify']);
        expect(d.jobs.build.needs).toBeUndefined();
    });

    it('UT-375 S1: verify は失敗しても tsc.log・tsc.exit・jest.json を if: always() の artifact に残す（名前 weaver-android-baseline-measure-<run>-a<attempt>・保持1日・3ファイル）', () => {
        if (stageNow() !== 'S1') {
            return;
        }
        const d = w.loadReal();
        const up = d.jobs.verify.steps.filter((x: any) => /actions\/upload-artifact/.test(x.uses || ''));
        expect(up).toHaveLength(1);
        const u = up[0];
        expect(u.if).toMatch(/always\(\)/);
        expect(u.with.name).toBe('weaver-android-baseline-measure-${{ github.run_number }}-a${{ github.run_attempt }}');
        expect(u.with['retention-days']).toBe(1);
        const paths = String(u.with.path).split('\n').map((x: string) => x.trim()).filter(Boolean);
        for (const f of ['tsc.log', 'tsc.exit', 'jest.json']) {
            expect([f, paths.some((p: string) => p.endsWith('/' + f) || p.endsWith('\\' + f))]).toEqual([f, true]);
        }
        expect(paths.every((p: string) => /runner\.temp/.test(p))).toBe(true);
        expect(JSON.stringify(u)).not.toMatch(/secrets|\.jks|\.keystore|google-services/);
    });

    it('UT-376 S1: verify の tsc・jest の出力先が artifact の path と一致する（$RUNNER_TEMP の tsc.log・tsc.exit・jest.json）', () => {
        if (stageNow() !== 'S1') {
            return;
        }
        const d = w.loadReal();
        const body = d.jobs.verify.steps.map((x: any) => w.runOf(x)).join('\n');
        for (const f of ['tsc.log', 'tsc.exit', 'jest.json']) {
            expect([f, body.includes(f)]).toEqual([f, true]);
        }
    });
});

describe('S2 の完全版（段階値が S2 以降のときだけ実行。S1の間は skip＝合格に数えない）', () => {
    itS2('UT-377 S2: build.needs が [verify, preflight]（verify が落ちれば build は動かない）', () => {
        const d = w.loadReal();
        expect([].concat(d.jobs.build.needs || []).sort()).toEqual(['preflight', 'verify']);
    });

    itS2('UT-378 S2: S1 のインライン測定手順が残っていない（"S1 inline"・測定 artifact・build の dump manifest・sdkmanager の直書き）', () => {
        const d = w.loadReal();
        const t = JSON.stringify(d.jobs.build);
        expect(t).not.toMatch(/S1 inline|weaver-android-measure-|weaver-measure/);
        for (const x of d.jobs.build.steps) {
            const run = w.runOf(x);
            expect([x.name, /dump manifest/.test(run)]).toEqual([x.name, false]);
            expect([x.name, /sdkmanager/.test(run) && !/weaver_android_aab\.sh tools/.test(w.runOf(w.step(d, 'build', 'B4')))]).toEqual([x.name, false]);
        }
        expect(w.runOf(w.step(d, 'build', 'B4'))).toContain('weaver_android_aab.sh tools');
        expect(w.runOf(w.step(d, 'inspect', 'I8'))).toContain('weaver_android_aab.sh extract');
    });

    itS2('UT-379 S2: 5job（verify・preflight・build・inspect・sign）で、測定用の baseline-measure artifact は verify の if: always() の1件だけ残るか、または V5 の baseline 比較に置き換わっている', () => {
        const d = w.loadReal();
        expect(Object.keys(d.jobs).sort()).toEqual(['build', 'inspect', 'preflight', 'sign', 'verify']);
        const v5 = d.jobs.verify.steps.map((x: any) => w.runOf(x)).join('\n');
        expect(v5).toContain('weaver_android_guard.sh baseline');
    });
});
