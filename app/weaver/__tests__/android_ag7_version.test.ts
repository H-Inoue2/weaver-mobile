// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG7 版（UT-135〜147・341・355）。詳細設計 §5.3.7・§5.5
// versionCode は 1000+run_number と一致（基準は --base。既定 1000）。宣言形の定義（D-K79R0-36）:
//   行頭（空白を除く）が語 versionCode で直後が空白・=・( のもの／左辺が <識別子>.versionCode の代入。読み取り・別名は宣言形でない。
// ※UT-143・204 の入力は元の `def x = { versionCode(5) }`（詳細設計v1.3: 宣言形に「同じ行の { ・ ; の直後」を追加＝D-K79R0-71）。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

function ag7(gradle: string, n: string | number, v = '2.45.0', extra: string[] = []) {
    const root = s.tmp();
    const f = s.write(root, 'build.gradle', gradle);
    return s.guard(['ag7', '--gradle', s.posix(f), '--run-number', String(n), '--app-version', v, ...extra]);
}
const gradleWith = (code: number | string, name = '2.45.0') => s.buildGradle({versionCode: code as number, versionName: name});

describe('AG7 版（pre）', () => {
    it('UT-135 N=1・versionCode=1001・versionName "2.45.0"・V=2.45.0: rc=0', () => {
        expect(ag7(gradleWith(1001), 1).rc).toBe(0);
    });

    it('UT-136 N=123→1123、N=0→1000（下限ちょうど）: どちらも rc=0', () => {
        expect(ag7(gradleWith(1123), 123).rc).toBe(0);
        expect(ag7(gradleWith(1000), 0).rc).toBe(0);
    });

    it('UT-137 N=1×817（現行）／N=0×999／N=7×1500: 3通りとも rc=1（1000+N との一致が要る）', () => {
        for (const [n, vc] of [[1, 817], [0, 999], [7, 1500]]) {
            expect([n, vc, ag7(gradleWith(vc), n).rc]).toEqual([n, vc, 1]);
        }
    });

    it('UT-138 N=7×1007: rc=0（1007 の正の対）', () => {
        expect(ag7(gradleWith(1007), 7).rc).toBe(0);
    });

    it('UT-139 N が空／abc／-5／1e3／+5／" 7"／全角７: 7通りとも rc=1（^[0-9]+$ のみ）', () => {
        for (const n of ['', 'abc', '-5', '1e3', '+5', ' 7', '７']) {
            expect([JSON.stringify(n), ag7(gradleWith(1007), n).rc]).toEqual([JSON.stringify(n), 1]);
        }
    });

    it('UT-140 N=007（先行ゼロ）× versionCode 1007: rc=0', () => {
        expect(ag7(gradleWith(1007), '007').rc).toBe(0);
    });

    it('UT-141 versionCode = 817（=付き）／versionCode 行が2件／0件: 3通りとも rc=1', () => {
        const eq = s.buildGradle({versionCodeLines: ['        versionCode = 1001']});
        const two = s.buildGradle({versionCodeLines: ['        versionCode 1001', '        versionCode 1001']});
        const zero = s.buildGradle({versionCodeLines: []});
        for (const g of [eq, two, zero]) {
            expect(ag7(g, 1).rc).toBe(1);
        }
    });

    it('UT-142 versionCode 1001 の他に // versionCode 100（コメント行）がある: rc=0', () => {
        const g = s.buildGradle({versionCodeLines: ['        // versionCode 100', '        versionCode 1001']});
        expect(ag7(g, 1).rc).toBe(0);
    });

    it('UT-143 versionCode 1001 の他に def x = { versionCode(5) }（同じ行の { の直後の宣言形。v1.3）がある: rc=1（宣言形は1件だけ）', () => {
        const g = s.buildGradle({versionCodeLines: ['        versionCode 1001', '        def x = { versionCode(5) }']});
        expect(ag7(g, 1).rc).toBe(1);
    });

    it('UT-144 versionName が "2.46.0"（V=2.45.0）／versionName が2件／0件: 3通りとも rc=1', () => {
        expect(ag7(gradleWith(1001, '2.46.0'), 1).rc).toBe(1);
        expect(ag7(s.buildGradle({versionNameLines: ['        versionName "2.45.0"', '        versionName "2.45.0"']}), 1).rc).toBe(1);
        expect(ag7(s.buildGradle({versionNameLines: []}), 1).rc).toBe(1);
    });

    it('UT-145 V が 2.45／空／2.45.0.1／v2.45.0: 4通りとも rc=1（^\\d+\\.\\d+\\.\\d+$）', () => {
        for (const v of ['2.45', '', '2.45.0.1', 'v2.45.0']) {
            expect([v, ag7(gradleWith(1001, v || '2.45.0'), 1, v).rc]).toEqual([v, 1]);
        }
    });

    it('UT-146 インデントがタブ／スペース4／行末空白あり／CRLF の正常ファイル: 4通りとも rc=0', () => {
        const variants = [
            s.buildGradle({}).replace(/^ +/gm, '\t'),
            s.buildGradle({}),
            s.buildGradle({}).replace(/\n/g, '   \n'),
            s.buildGradle({eol: '\r\n'}),
        ];
        for (const g of variants) {
            expect(ag7(g, 1).rc).toBe(0);
        }
    });

    it('UT-147【基】基点コミットの build.gradle（L116 versionCode 817）: 注入前は rc=1（出力に 1001 と 817）、同じファイルへ inject_version.sh を当てた後は rc=0', () => {
        const root = s.tmp();
        const f = s.write(root, 'build.gradle', s.gitShow(s.BASE_SHA, 'android/app/build.gradle'));
        const before = s.guard(['ag7', '--gradle', s.posix(f), '--run-number', '1', '--app-version', '2.45.0']);
        expect(before.rc).toBe(1);
        expect(before.out).toContain('1001');
        expect(before.out).toContain('817');
        const inj = s.inject(['--gradle', s.posix(f), '--run-number', '1', '--app-version', '2.45.0']);
        expect(inj.rc).toBe(0);
        expect(s.guard(['ag7', '--gradle', s.posix(f), '--run-number', '1', '--app-version', '2.45.0']).rc).toBe(0);
    });

    it('UT-341 宣言形: 基点の実 build.gradle の L116 を versionCode 1001 に変えたコピー（L185・L188・L189 はそのまま）は rc=0。defaultConfig.versionCode = 1 を足すと rc=1', () => {
        const base = s.gitShowText(s.BASE_SHA, 'android/app/build.gradle');
        expect(base).toMatch(/^\s*versionCode\s+817\s*$/m);
        const changed = base.replace(/^(\s*)versionCode\s+817\s*$/m, '$1versionCode 1001');
        expect(changed).toMatch(/versionCodes|versionCodeOverride/);
        expect(ag7(changed, 1).rc).toBe(0);
        const twice = changed.replace(/^(\s*)versionCode 1001$/m, '$1versionCode 1001\n$1defaultConfig.versionCode = 1');
        expect(ag7(twice, 1).rc).toBe(1);
    });
});

describe('AG7 --phase post（マージ後の版。詳細設計 §5.3.7。inspect の I8）', () => {
    const post = (d: string, n: string | number = 7, extra: string[] = []) => s.guard(['ag7', '--phase', 'post', '--dir', s.posix(d), '--run-number', String(n), '--app-version', '2.45.0', ...extra]);

    it('UT-355 マージ後 versionCode=1007・versionName=2.45.0（N=7）は rc=0。1500・817・versionName 違い・manifest 無し／空・versionCode 属性なしは rc=1。--base 2000 では 2007 が要る', () => {
        expect(post(s.extractDir({versionCode: 1007})).rc).toBe(0);
        expect(post(s.extractDir({versionCode: 1500})).rc).toBe(1);
        expect(post(s.extractDir({versionCode: 817})).rc).toBe(1);
        expect(post(s.extractDir({versionCode: 1007, versionName: '2.46.0'})).rc).toBe(1);
        const none = s.extractDir();
        fs.rmSync(none + '/manifest.xml');
        expect(post(none).rc).toBe(1);
        const empty = s.extractDir({manifestXml: ''});
        expect(post(empty).rc).toBe(1);
        const noAttr = s.extractDir();
        fs.writeFileSync(noAttr + '/manifest.xml', fs.readFileSync(noAttr + '/manifest.xml', 'utf8').replace(/ android:versionCode="[^"]*"/, ''));
        expect(post(noAttr).rc).toBe(1);
        expect(post(s.extractDir({versionCode: 2007}), 7, ['--base', '2000']).rc).toBe(0);
        expect(post(s.extractDir({versionCode: 1007}), 7, ['--base', '2000']).rc).toBe(1);
    });
});
