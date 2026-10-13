// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: baseline（型検査・jest の基準値比較）（UT-172〜187）。詳細設計 §5.3.9・§5.8.2
// tsc のエラー件数は「error TS を含む行」の数。jest は passed が基準以上・pending が基準以下（合計では判定しない）。

export {};

const s = require('./android_test_support.cjs');

jest.setTimeout(180000);
afterAll(() => s.cleanup());

type Jest = {success?: boolean; numFailedTests?: number; numFailedTestSuites?: number; numPassedTests?: number; numPendingTests?: number};
const JOK: Jest = {success: true, numFailedTests: 0, numFailedTestSuites: 0, numPassedTests: 297, numPendingTests: 1};
const BASE = {tsc_errors: 45, jest_passed: 297, jest_pending: 1};
const tscLog = (n: number, extra: string[] = []) => [...Array.from({length: n}, (_, i) => `src/f${i}.ts(1,1): error TS2322: x`), ...extra].join('\n') + '\n';

function bl(o: {base?: unknown; baseRaw?: string | null; log?: string; exit?: number | string; jest?: Jest | string | null; allowPending?: boolean} = {}) {
    const d = s.tmp();
    const base = o.baseRaw !== undefined ? o.baseRaw : JSON.stringify(o.base || BASE);
    const args = ['baseline', '--tsc-log', s.posix(s.write(d, 'tsc.log', o.log === undefined ? tscLog(45) : o.log)), '--tsc-exit', String(o.exit === undefined ? 1 : o.exit)];
    const j = o.jest === undefined ? JOK : o.jest;
    args.push('--jest-json', s.posix(j === null ? d + '/missing.json' : s.write(d, 'jest.json', typeof j === 'string' ? j : JSON.stringify(j))));
    args.push('--baseline', s.posix(base === null ? d + '/nobase.json' : s.write(d, 'base.json', base)));
    if (o.allowPending) {
        args.push('--allow-pending');
    }
    return s.guard(args);
}

describe('baseline（詳細設計 §5.3.9）', () => {
    it('UT-172 基準 {45,297,1}・tsc ログ45件・exit=1・jest 全通過（297・pending 1）: rc=0', () => {
        expect(bl().rc).toBe(0);
    });

    it('UT-173 error TS 行が46件（基準+1）: rc=1・出力に 46 と 45', () => {
        const r = bl({log: tscLog(46)});
        expect(r.rc).toBe(1);
        expect(r.out).toContain('46');
        expect(r.out).toContain('45');
    });

    it('UT-174 error TS 行が44件（基準−1）／0件で exit=0: どちらも rc=0。44件のときは WARN: baseline: で基準の更新を促す', () => {
        const a = bl({log: tscLog(44)});
        expect(a.rc).toBe(0);
        expect(s.warnLines(a, 'baseline').length).toBeGreaterThanOrEqual(1);
        expect(bl({log: '', exit: 0}).rc).toBe(0);
    });

    it('UT-175 tsc の終了コードが 3／137／-1: 3通りとも rc=1（0・1・2以外は違反。ログが0件でも通らない）', () => {
        for (const e of [3, 137, -1]) {
            expect([e, bl({exit: e, log: ''}).rc]).toEqual([e, 1]);
        }
    });

    it('UT-176 tsc の終了コード 2（境界）: rc=0（0・1・2は有効）', () => {
        expect(bl({exit: 2}).rc).toBe(0);
    });

    it('UT-177 tsc ログの数え方: error TS を含まない行（Found 45 errors.・続き行・TS2345 だけの行）を足した46行でも数えるのは45: rc=0', () => {
        const r = bl({log: tscLog(45, ['Found 45 errors.']).replace(/\n$/, '\n') + '    indented continuation line\nTS2345 only line\n'});
        expect(r.rc).toBe(0);
    });

    it('UT-178 jest: numPassedTests=296（基準−1）: rc=1', () => {
        expect(bl({jest: {...JOK, numPassedTests: 296}}).rc).toBe(1);
    });

    it('UT-179 jest: numPassedTests=298（基準+1）: rc=0', () => {
        expect(bl({jest: {...JOK, numPassedTests: 298}}).rc).toBe(0);
    });

    it('UT-180 jest: numPendingTests=2（passed=298で合計は同じ299）: rc=1（スキップが基準を超えたら失敗）', () => {
        expect(bl({jest: {...JOK, numPassedTests: 298, numPendingTests: 2}}).rc).toBe(1);
    });

    it('UT-181 jest: success=false／numFailedTests=1／numFailedTestSuites=1: 3通りとも rc=1', () => {
        for (const j of [{...JOK, success: false}, {...JOK, numFailedTests: 1}, {...JOK, numFailedTestSuites: 1}]) {
            expect(bl({jest: j}).rc).toBe(1);
        }
    });

    it('UT-182 jest.json が存在しない／壊れたJSON／numPassedTests キー無し: 3通りとも rc=1', () => {
        const noKey: Jest = {...JOK};
        delete noKey.numPassedTests;
        for (const j of [null, '{broken', noKey]) {
            expect(bl({jest: j}).rc).toBe(1);
        }
    });

    it('UT-183 基準ファイルが存在しない／壊れたJSON／キー欠落／負数 -1／文字列 "abc": 5通りとも rc=1', () => {
        const cases: Array<string | null> = [null, '{broken', JSON.stringify({tsc_errors: 45, jest_passed: 297}), JSON.stringify({...BASE, tsc_errors: -1}), JSON.stringify({...BASE, jest_passed: 'abc'})];
        for (const c of cases) {
            expect(bl({baseRaw: c}).rc).toBe(1);
        }
    });

    it('UT-184 基準が "PENDING" 3項目＋--allow-pending（実測 tsc 45・passed 297・pending 1）: rc=0・NOTE: baseline: の3行', () => {
        const r = bl({base: {tsc_errors: 'PENDING', jest_passed: 'PENDING', jest_pending: 'PENDING'}, allowPending: true});
        expect(r.rc).toBe(0);
        expect(s.noteLines(r, 'baseline')).toEqual(expect.arrayContaining(['NOTE: baseline: tsc_errors=45', 'NOTE: baseline: jest_passed=297', 'NOTE: baseline: jest_pending=1']));
    });

    it('UT-185 同じ PENDING 基準で --allow-pending なし: rc=1（署名ありでは基準が確定していないと失敗）', () => {
        expect(bl({base: {tsc_errors: 'PENDING', jest_passed: 'PENDING', jest_pending: 'PENDING'}}).rc).toBe(1);
    });

    it('UT-186 PENDING 基準＋--allow-pending でも jest に numFailedTests=1 があれば rc=1（PENDINGは失敗を免責しない）', () => {
        const r = bl({base: {tsc_errors: 'PENDING', jest_passed: 'PENDING', jest_pending: 'PENDING'}, allowPending: true, jest: {...JOK, numFailedTests: 1}});
        expect(r.rc).toBe(1);
    });

    it('UT-187 基準の一部だけ PENDING（jest_passed のみ）: PENDING の項目だけ実測値を出力し、他は通常比較（超過なら rc=1）', () => {
        const base = {tsc_errors: 45, jest_passed: 'PENDING', jest_pending: 1};
        const ok = bl({base, allowPending: true});
        expect(ok.rc).toBe(0);
        expect(s.noteLines(ok, 'baseline').join('\n')).toContain('jest_passed=297');
        expect(s.noteLines(ok, 'baseline').join('\n')).not.toContain('tsc_errors');
        expect(bl({base, allowPending: true, log: tscLog(46)}).rc).toBe(1);
    });
});
