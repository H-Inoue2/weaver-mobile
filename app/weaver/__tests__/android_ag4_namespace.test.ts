// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG4 namespace・クラス（UT-087〜107・334）。詳細設計 §5.3.4
// pre＝ソース（build.gradle の namespace・main/androidTest の package・マニフェストの「.」始まりの名前の実在）、
// post＝マージ後マニフェストの namespace 接頭辞のクラスが dex-classes.txt に存在すること。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');

jest.setTimeout(180000);
afterAll(() => s.cleanup());

const NS = 'com.mattermost.rnbeta';
const JAVA = 'android/app/src/main/java/com/mattermost/rnbeta/';
const pre = (root: string, extra: string[] = []) => s.guard(['ag4', '--phase', 'pre', '--root', s.posix(root), ...extra]);
const tree = (o: Record<string, unknown> = {}) => s.goodTree(o);
const manifestWith = (names: {application?: string; activities?: string[]; services?: string[]; receivers?: string[]}) => s.manifestXml({
    app: {name: names.application || '.MainApplication', activities: names.activities || ['.MainActivity'], services: names.services || ['.NotificationDismissService'], receivers: names.receivers || ['.NotificationReplyBroadcastReceiver']},
});

describe('AG4 pre（ソース）', () => {
    it('UT-087 正常な木（namespace・main 6ファイル・マニフェストの4つの相対名に対応するクラス）: rc=0', () => {
        expect(pre(tree()).rc).toBe(0);
    });

    it('UT-088 namespace が com.metarchitect.Weaver（現行）: rc=1・見つけた値と期待値 com.mattermost.rnbeta が出る', () => {
        const r = pre(tree({gradle: {namespace: 'com.metarchitect.Weaver'}}));
        expect(r.rc).toBe(1);
        expect(r.out).toContain('com.metarchitect.Weaver');
        expect(r.out).toContain(NS);
    });

    it('UT-089【基】基点コミットの build.gradle・ソース木に ag4 --phase pre: rc=1（namespace 違反。BD-01の再現）', () => {
        const root = s.baseTree(['android/app/build.gradle', 'android/app/src']);
        const r = pre(root);
        expect(r.rc).toBe(1);
        const f = s.failLines(r, 'AG4').join('\n');
        expect(f).toContain('namespace');
        expect(f).toContain('com.metarchitect.Weaver');
    });

    it('UT-090 namespace 行が0件／2件／namespace = "…"（=付き）: 3通りとも rc=1', () => {
        const cases: Array<[string, Record<string, unknown>]> = [
            ['none', {namespace: null}],
            ['two', {nsExtra: [`    namespace "${NS}"`]}],
            ['equals', {namespace: null, nsExtra: [`    namespace = "${NS}"`]}],
        ];
        for (const [label, g] of cases) {
            const r = pre(tree({gradle: g}));
            expect([label, r.rc]).toEqual([label, 1]);
        }
    });

    it("UT-091 namespace 'com.mattermost.rnbeta'（単一引用符）: rc=0", () => {
        const root = tree();
        const f = root + '/android/app/build.gradle';
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(`namespace "${NS}"`, `namespace '${NS}'`));
        expect(pre(root).rc).toBe(0);
    });

    it('UT-092 main の Kotlin の package が com.mattermost.rnbeta.sub（サブパッケージ）: rc=1', () => {
        const root = tree({files: {[JAVA + 'MainActivity.kt']: `package ${NS}.sub\n\nclass MainActivity\n`}});
        expect(pre(root).rc).toBe(1);
    });

    it('UT-093 com.mattermost.helpers 配下のファイル（package com.mattermost.helpers）が存在: rc=0（接頭辞が rnbeta でないものは対象外）', () => {
        const root = tree();
        expect(fs.existsSync(root + '/android/app/src/main/java/com/mattermost/helpers/Helper.kt')).toBe(true);
        expect(pre(root).rc).toBe(0);
    });

    it('UT-094 1行目がコメント・空行のファイル（Java: // Copyright＋空行＋package …;／Kotlin: /* … */＋package …）: rc=0', () => {
        const root = tree({files: {
            [JAVA + 'ReceiptDelivery.java']: `// Copyright (c) X\n\npackage ${NS};\n\nclass ReceiptDelivery {}\n`,
            [JAVA + 'MainActivity.kt']: `/*\n * header\n */\n\npackage ${NS}\n\nclass MainActivity\n`,
        }});
        expect(pre(root).rc).toBe(0);
    });

    it('UT-095 androidTest 配下の package が com.mattermost.rnbeta.test: rc=1', () => {
        const root = tree({files: {'android/app/src/androidTest/java/com/mattermost/rnbeta/DetoxTest.java': `package ${NS}.test;\n\nclass DetoxTest {}\n`}});
        expect(pre(root).rc).toBe(1);
    });

    it('UT-096 ディレクトリ com/mattermost/rnbeta/ 直下のファイルの package が com.other: rc=1（規則③）', () => {
        const root = tree({files: {[JAVA + 'CustomPushNotification.kt']: 'package com.other\n\nclass X\n'}});
        expect(pre(root).rc).toBe(1);
    });

    it('UT-097 マニフェストの .Missing（対応するクラスが無い）: rc=1・出力に Missing', () => {
        const root = tree({manifest: {app: {activities: ['.MainActivity', '.Missing']}}});
        const r = pre(root);
        expect(r.rc).toBe(1);
        expect(r.out).toContain('Missing');
    });

    it('UT-098 完全修飾名（com.mattermost.rnshare.ShareActivity）は対象外。.sub.Foo は sub/Foo.kt があれば rc=0', () => {
        const root = tree({
            manifest: {app: {activities: ['.MainActivity', 'com.mattermost.rnshare.ShareActivity', '.sub.Foo']}},
            files: {[JAVA + 'sub/Foo.kt']: `package ${NS}\n\nclass Foo\n`},
        });
        expect(pre(root).rc).toBe(0);
    });

    it('UT-099（ア）main にも androidTest にも *.kt・*.java が0件（マニフェストの . 始まりの名前は1件以上）: rc=1・読んだソースが0件であることが分かる説明', () => {
        const root = tree();
        fs.rmSync(root + '/android/app/src/main/java', {recursive: true, force: true});
        fs.rmSync(root + '/android/app/src/androidTest', {recursive: true, force: true});
        const r = pre(root);
        expect(r.rc).toBe(1);
        expect(s.failLines(r, 'AG4')).toHaveLength(1);
        expect(r.out).toMatch(/0/);
    });

    it('UT-100 --namespace com.example.app を指定し、フィクスチャもそれに揃える: rc=0（既定値を引数で変えられる）', () => {
        const root = tree({gradle: {namespace: 'com.example.app'}});
        fs.rmSync(root + '/android/app/src/main/java', {recursive: true, force: true});
        fs.rmSync(root + '/android/app/src/androidTest', {recursive: true, force: true});
        for (const f of s.KOTLIN_FILES) {
            s.write(root, 'android/app/src/main/java/com/example/app/' + f, `package com.example.app${f.endsWith('.java') ? ';' : ''}\n\nclass X\n`);
        }
        expect(pre(root, ['--namespace', 'com.example.app']).rc).toBe(0);
    });

    it('UT-334（イ）ソースのマニフェストに「.」始まりの名前が0件（全て完全修飾名）: rc=1。（ア）UT-099 と説明が区別できる', () => {
        const fq = (n: string) => `${NS}.${n}`;
        const root = tree({manifest: {app: {name: fq('MainApplication'), activities: [fq('MainActivity')], services: [fq('NotificationDismissService')], receivers: [fq('NotificationReplyBroadcastReceiver')]}}});
        const r = pre(root);
        expect(r.rc).toBe(1);
        expect(s.failLines(r, 'AG4')).toHaveLength(1);
        const noSrc = tree();
        fs.rmSync(noSrc + '/android/app/src/main/java', {recursive: true, force: true});
        fs.rmSync(noSrc + '/android/app/src/androidTest', {recursive: true, force: true});
        const a = pre(noSrc);
        expect(a.rc).toBe(1);
        expect(s.failLines(a, 'AG4')[0]).not.toBe(s.failLines(r, 'AG4')[0]);
    });
});

describe('AG4 post（マージ後マニフェスト×dex-classes.txt）', () => {
    const post = (d: string) => s.guard(['ag4', '--phase', 'post', '--dir', s.posix(d)]);
    const pm = (names: string[]) => {
        const [app, ...rest] = names;
        return [
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.metarchitect.Weaver">',
            `    <application android:name="${app}">`,
            ...rest.map((n, i) => (i === 0 ? `        <activity android:name="${n}" />` : i === 1 ? `        <service android:name="${n}" />` : `        <receiver android:name="${n}" />`)),
            '    </application>',
            '</manifest>',
            '',
        ].join('\n');
    };

    it('UT-101 4件（application・activity・service・receiver）が dex-classes.txt に全て存在: rc=0', () => {
        expect(post(s.extractDir()).rc).toBe(0);
    });

    it('UT-102 dex-classes.txt から MainActivity だけを除く: rc=1・出力に MainActivity', () => {
        const d = s.extractDir({dexClasses: s.CLASSES4.filter((c: string) => !c.endsWith('MainActivity')).join('\n') + '\n'});
        const r = post(d);
        expect(r.rc).toBe(1);
        expect(r.out).toContain('MainActivity');
    });

    it('UT-103 抽出が2件（application＋activity）は rc=1（3件未満は空振り）、3件ちょうどは rc=0（境界）', () => {
        const two = s.extractDir({manifestXml: pm([`${NS}.MainApplication`, `${NS}.MainActivity`])});
        const three = s.extractDir({manifestXml: pm([`${NS}.MainApplication`, `${NS}.MainActivity`, `${NS}.NotificationDismissService`])});
        expect(post(two).rc).toBe(1);
        expect(post(three).rc).toBe(0);
    });

    it('UT-104 マージ後が AGP で展開されず android:name=".MainApplication" のまま（相対名）: 抽出0件で rc=1', () => {
        const d = s.extractDir({manifestXml: pm(['.MainApplication', '.MainActivity', '.NotificationDismissService', '.NotificationReplyBroadcastReceiver'])});
        expect(post(d).rc).toBe(1);
    });

    it('UT-105 namespace 外（com.mattermost.rnshare.ShareActivity）が dex に無くても、他の4件がそろえば rc=0', () => {
        const xml = pm([`${NS}.MainApplication`, `${NS}.MainActivity`, `${NS}.NotificationDismissService`, `${NS}.NotificationReplyBroadcastReceiver`, 'com.mattermost.rnshare.ShareActivity']);
        expect(post(s.extractDir({manifestXml: xml})).rc).toBe(0);
    });

    it('UT-106 dex-classes.txt が0バイト／存在しない、manifest.xml が存在しない: 3通りとも rc=1', () => {
        const a = s.extractDir({dexClasses: ''});
        const b = s.extractDir();
        fs.rmSync(b + '/dex-classes.txt');
        const c = s.extractDir();
        fs.rmSync(c + '/manifest.xml');
        for (const d of [a, b, c]) {
            expect(post(d).rc).toBe(1);
        }
    });

    it('UT-107 dex-classes.txt がディスクリプタ形式（Lcom/mattermost/rnbeta/MainActivity;）のまま: rc=1（ドット区切りの完全修飾名のみ受理）', () => {
        const d = s.extractDir({dexClasses: s.CLASSES4.map((c: string) => 'L' + c.replace(/\./g, '/') + ';').join('\n') + '\n'});
        expect(post(d).rc).toBe(1);
    });
});
