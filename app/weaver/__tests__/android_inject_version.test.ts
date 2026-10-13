// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: weaver_android_inject_version.sh（UT-197〜207）。詳細設計 §5.5
// 注入は versionCode 行と versionName 行だけを書き換え、事後検査（AG7相当）に失敗したら元へ戻す。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const path = require('path');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const args = (f: string, n: string | number = 234, v = '2.45.0') => ['--gradle', s.posix(f), '--run-number', String(n), '--app-version', v];
function put(content: string, name = 'build.gradle') {
    const d = s.tmp();
    return s.write(d, name, content);
}
const lines = (t: string) => t.replace(/\r/g, '').split('\n');

describe('inject_version（詳細設計 §5.5）', () => {
    it('UT-197 基点の実 build.gradle に N=234: rc=0・versionCode 行が 1234・versionName 同一・差分は versionCode の1行のみ（L185・L188・L189 は不変）', () => {
        const base = s.gitShowText(s.BASE_SHA, 'android/app/build.gradle');
        const f = put(base);
        const r = s.inject(args(f));
        expect(r.rc).toBe(0);
        const after = fs.readFileSync(f, 'utf8').replace(/\r/g, '');
        const a = lines(base);
        const b = lines(after);
        expect(b).toHaveLength(a.length);
        const diff = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
        expect(diff).toHaveLength(1);
        expect(diff[0][1].trim()).toBe('versionCode 1234');
    });

    it('UT-198 --app-version 2.46.0: versionName が "2.46.0"・versionCode も更新・差分は2行のみ', () => {
        const base = s.gitShowText(s.BASE_SHA, 'android/app/build.gradle');
        const f = put(base);
        expect(s.inject(args(f, 234, '2.46.0')).rc).toBe(0);
        const a = lines(base);
        const b = lines(fs.readFileSync(f, 'utf8'));
        const diff = a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
        expect(diff).toHaveLength(2);
        expect(diff.map(([, y]) => y.trim()).sort()).toEqual(['versionCode 1234', 'versionName "2.46.0"'].sort());
    });

    it('UT-199 インデント（スペース4／タブ）・行末（LF／CRLF）が保たれる（バイト差分は該当行のみ）', () => {
        const variants = [
            s.buildGradle({}),
            s.buildGradle({}).replace(/^ +/gm, '\t'),
            s.buildGradle({eol: '\r\n'}),
            s.buildGradle({eol: '\r\n'}).replace(/^ +/gm, '\t'),
        ];
        for (const v of variants) {
            const f = put(v);
            expect(s.inject(args(f)).rc).toBe(0);
            const after = fs.readFileSync(f, 'utf8');
            expect(after.includes('\r\n')).toBe(v.includes('\r\n'));
            const ra = v.split(/(?<=\n)/);
            const rb = after.split(/(?<=\n)/);
            expect(rb).toHaveLength(ra.length);
            const changed = ra.filter((l, i) => l !== rb[i]);
            expect(changed.length).toBe(1 + (v.includes('versionName') ? 0 : 0) || 2);
            expect(changed.every((l) => /version(Code|Name)/.test(l))).toBe(true);
            const indent = (/^([ \t]*)versionCode/m.exec(v) || [])[1];
            expect(/^([ \t]*)versionCode/m.exec(after)![1]).toBe(indent);
        }
    });

    it('UT-200 同じ引数で2回続けて実行: 2回目後の sha256 が1回目後と同一（冪等）', () => {
        const f = put(s.buildGradle({versionCode: 817}));
        expect(s.inject(args(f)).rc).toBe(0);
        const h1 = s.sha256File(f);
        expect(s.inject(args(f)).rc).toBe(0);
        expect(s.sha256File(f)).toBe(h1);
    });

    it('UT-201 --run-number が空／abc／-5／1e3: 4通りとも rc=1・build.gradle の sha256 は不変', () => {
        for (const n of ['', 'abc', '-5', '1e3']) {
            const f = put(s.buildGradle({versionCode: 817}));
            const h = s.sha256File(f);
            expect([JSON.stringify(n), s.inject(args(f, n)).rc]).toEqual([JSON.stringify(n), 1]);
            expect(s.sha256File(f)).toBe(h);
        }
    });

    it('UT-202 --app-version が空／2.45: 2通りとも rc=1・ファイル不変', () => {
        for (const v of ['', '2.45']) {
            const f = put(s.buildGradle({versionCode: 817}));
            const h = s.sha256File(f);
            expect(s.inject(args(f, 234, v)).rc).toBe(1);
            expect(s.sha256File(f)).toBe(h);
        }
    });

    it('UT-203 versionCode 行が0件／2件／= 付き、versionName 行が0件／2件（5通り）: 全て rc=1・ファイル不変', () => {
        const g = [
            s.buildGradle({versionCodeLines: []}),
            s.buildGradle({versionCodeLines: ['        versionCode 817', '        versionCode 818']}),
            s.buildGradle({versionCodeLines: ['        versionCode = 817']}),
            s.buildGradle({versionNameLines: []}),
            s.buildGradle({versionNameLines: ['        versionName "2.45.0"', '        versionName "2.45.0"']}),
        ];
        for (const t of g) {
            const f = put(t);
            const h = s.sha256File(f);
            expect(s.inject(args(f)).rc).toBe(1);
            expect(s.sha256File(f)).toBe(h);
        }
    });

    it('UT-204 正規表現に当たらない宣言形（def x = { versionCode(5) }）が別にある状態で注入: 事後検査で失敗し rc=1・ファイルは元の sha256 に戻る', () => {
        const f = put(s.buildGradle({versionCodeLines: ['        versionCode 817', '        def x = { versionCode(5) }']}));
        const h = s.sha256File(f);
        const r = s.inject(args(f));
        expect(r.rc).toBe(1);
        expect(s.sha256File(f)).toBe(h);
    });

    it('UT-205 mv（置換）が失敗する環境（PATH 先頭の失敗スタブ）: rc=1・元の build.gradle が残る・一時ファイルが残らない', () => {
        const f = put(s.buildGradle({versionCode: 817}));
        const dir = path.dirname(f);
        const before = fs.readdirSync(dir).sort();
        const h = s.sha256File(f);
        const st = s.makeStubs(['mv']);
        const r = s.inject(args(f), {stubDir: st.dir, env: {STUB_MV_RC: '1'}});
        expect(r.rc).toBe(1);
        expect(s.sha256File(f)).toBe(h);
        expect(fs.readdirSync(dir).sort()).toEqual(before);
    });

    it('UT-206 成功後・失敗後のディレクトリ一覧が注入前と同じファイル名の集合（*.tmp・*.bak が残らない）', () => {
        const ok = put(s.buildGradle({versionCode: 817}));
        const okDir = path.dirname(ok);
        const b1 = fs.readdirSync(okDir).sort();
        expect(s.inject(args(ok)).rc).toBe(0);
        expect(fs.readdirSync(okDir).sort()).toEqual(b1);
        const ng = put(s.buildGradle({versionCodeLines: []}));
        const ngDir = path.dirname(ng);
        const b2 = fs.readdirSync(ngDir).sort();
        expect(s.inject(args(ng)).rc).toBe(1);
        expect(fs.readdirSync(ngDir).sort()).toEqual(b2);
    });

    it('UT-207 --gradle 未指定・不明オプションは rc=2、存在しないファイルは rc=1', () => {
        expect(s.inject(['--run-number', '1', '--app-version', '2.45.0']).rc).toBe(2);
        const f = put(s.buildGradle({}));
        expect(s.inject([...args(f), '--bogus', 'x']).rc).toBe(2);
        expect(s.inject(args(path.join(path.dirname(f), 'nothing.gradle'))).rc).toBe(1);
    });
});
