// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: weaver_release_guard.sh --shared-only（UT-239〜249）。詳細設計 §5.4
// 既存の iOS ガードは変更せず、--shared-only のとき G1・G2 を飛ばす。既存の挙動は基点コミットと同一でなければならない。

export {};

const s = require('./android_test_support.cjs');
const base = require('./weaver_test_support.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

jest.setTimeout(240000);
afterAll(() => {
    s.cleanup();
});

const roots: string[] = [];
function fx(o: any = {}) {
    const r = base.makeFixture(o);
    roots.push(r);
    return r;
}
afterAll(() => roots.forEach((r) => base.removeFixture(r)));
const sh = (args: string[]) => base.runGuard(args);
const noIos = (extra: any = {}) => fx({omit: ['pbxproj', 'plist'], ...extra});

describe('--shared-only（詳細設計 §5.4）', () => {
    it('UT-239 --shared-only のみ・ios/ なし・constants.ts が正しい書式: rc=0・RELEASE GUARD PASSED (basic, shared-only)・G1・G2 の語が0件', () => {
        const r = sh(['--shared-only', noIos()]);
        expect(r.status).toBe(0);
        expect(r.out).toContain('RELEASE GUARD PASSED (basic, shared-only)');
        for (const w of ['G1', 'G2', 'TARGETED_DEVICE_FAMILY']) {
            expect(r.out).not.toContain(w);
        }
    });

    it('UT-240 --shared-only --release・ios/ なし・プレースホルダなし: rc=0・RELEASE GUARD PASSED (--release, shared-only)（(--release) を部分一致で含まない）', () => {
        const r = sh(['--shared-only', '--release', noIos()]);
        expect(r.status).toBe(0);
        expect(r.out).toContain('RELEASE GUARD PASSED (--release, shared-only)');
        expect(r.out).not.toContain('PASSED (--release)');
    });

    it('UT-241 --shared-only --release で app/weaver にプレースホルダ1件: rc=1・出力に G3', () => {
        const r = sh(['--shared-only', '--release', noIos({messages: "export const WEAVER_MESSAGES = {x: '⟦ x ⟧'};\n"})]);
        expect(r.status).toBe(1);
        expect(r.out).toContain('G3');
    });

    it('UT-242 --shared-only で constants.ts の定数が2行書式（G5 違反）: rc=1・出力に G5', () => {
        const r = sh(['--shared-only', noIos({constRaw: {SUPPORT_URL: "export const SUPPORT_URL =\n    'https://weaver.example/support';"}})]);
        expect(r.status).toBe(1);
        expect(r.out).toContain('G5');
    });

    it('UT-243 --shared-only の失敗時の末尾付近の行に mode: と shared-only を含む', () => {
        const r = sh(['--shared-only', noIos({constRaw: {SUPPORT_URL: null}})]);
        expect(r.status).toBe(1);
        const tail = r.out.trim().split('\n').slice(-2).join('\n');
        expect(tail).toContain('mode:');
        expect(tail).toContain('shared-only');
    });

    it('UT-244 --shared-only の二重指定／--release との順序／ROOT との順序（4通り）: 全て rc=0・G1・G2 は実行されない', () => {
        const root = noIos();
        for (const a of [['--shared-only', '--shared-only', root], ['--release', '--shared-only', root], ['--shared-only', root], [root, '--shared-only']]) {
            const r = sh(a);
            expect([a.length, r.status]).toEqual([a.length, 0]);
            expect(r.out).not.toContain('G1');
        }
    });

    it('UT-245【既】--shared-onlyy: rc=2・unknown option', () => {
        const r = sh(['--shared-onlyy', noIos()]);
        expect(r.status).toBe(2);
        expect(r.out).toContain('unknown option');
    });

    it('UT-246【既】オプションなし・ios/ なしの ROOT: rc=1・G1 の項目名が出力に出る', () => {
        const r = sh([noIos()]);
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/G1|pbxproj/);
    });

    it('UT-247【既】基点コミットのスクリプトと現行を、同じ4フィクスチャ（正常・G1違反・G3違反・--release）で実行: 標準出力・標準エラー・rc が完全一致', () => {
        const baseScript = path.join(s.tmp('k79-basescript-'), 'weaver_release_guard.sh');
        fs.writeFileSync(baseScript, s.gitShow(s.BASE_SHA, '.github/scripts/weaver_release_guard.sh'));
        const cases: Array<[any, string[]]> = [
            [{}, []],
            [{pbx: ['1', '1', '1', '1', '1', '2']}, []],
            [{messages: "export const WEAVER_MESSAGES = {x: '⟦ x ⟧'};\n"}, ['--release']],
            [{}, ['--release']],
        ];
        for (const [o, flags] of cases) {
            const root = fx(o);
            const run = (script: string) => cp.spawnSync(base.BASH, [s.posix(script), ...flags, s.posix(root)], {encoding: 'utf8', timeout: 60000});
            const a = run(baseScript);
            const b = run(s.abs(s.SCRIPTS.shared));
            expect([b.status, b.stdout, b.stderr]).toEqual([a.status, a.stdout, a.stderr]);
        }
    });

    it('UT-248【既】既存 release_guard.test.ts の sha256 が基点コミットと同一（無修正）', () => {
        const rel = 'app/weaver/__tests__/release_guard.test.ts';
        expect(s.sha256Buf(Buffer.from(s.read(rel)))).toBe(s.sha256Buf(Buffer.from(s.gitShowText(s.BASE_SHA, rel))));
    });

    it('UT-249 スクリプト先頭の使い方コメントに --shared-only の記述があり、基点との差分で削除された既存行が0件（追加のみ）', () => {
        const now = s.read(s.SCRIPTS.shared);
        const head = now.split('\n').slice(0, 25).join('\n');
        expect(head).toContain('--shared-only');
        const was = new Set(s.gitShowText(s.BASE_SHA, '.github/scripts/weaver_release_guard.sh').split('\n'));
        const cur = new Set(now.split('\n'));
        const removed = [...was].filter((l) => !cur.has(l) && l.trim() !== '');
        const header = removed.filter((l) => /^#/.test(l));
        expect(header).toEqual([]);
    });
});
