// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG6 外部送信・平文通信（UT-118〜134・322）。詳細設計 §5.3.6・§3.1（D-17）
// 運用値は --cleartext forbid（ガードの既定）。allow は「許可の値を検出できること」と将来 U-10 を戻す場合のためだけ。
// post の nsc.txt の書式は測定ラン（§4.8・§12.4の8）で確定するまで暫定（見込み: A: cleartextTrafficPermitted=false (Raw: "false")）。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const ag6 = (root: string, extra: string[] = []) => s.guard(['ag6', '--phase', 'pre', '--root', s.posix(root), ...extra]);
const GOOD = {nsc: {cleartext: 'false'}, manifest: {app: {cleartext: 'false'}}};
const UPSTREAM = {nsc: {cleartext: 'true'}, manifest: {app: {cleartext: 'true'}}};
const tree = (o: Record<string, unknown> = {}) => s.goodTree({...GOOD, ...o});
const NSC = 'android/app/src/main/res/xml/network_security_config.xml';
const MAN = 'android/app/src/main/AndroidManifest.xml';

describe('AG6 pre（詳細設計 §5.3.6）', () => {
    it('UT-118 運用値（引数なし＝既定 forbid／--cleartext forbid 明示）: sentry・config・firebase 無効・NSC false＋user あり・マニフェスト false → 2通りとも rc=0', () => {
        expect(ag6(tree()).rc).toBe(0);
        expect(ag6(tree(), ['--cleartext', 'forbid']).rc).toBe(0);
    });

    it('UT-119 sentry.options.json の dsn・SentryEnabled=true・SentryDsnAndroid・RudderApiKey に値: 4通りとも rc=1・該当キー名が出力に出る', () => {
        const cases: Array<[string, Record<string, unknown>]> = [
            ['dsn', {sentry: {dsn: 'https://x@example.invalid/1'}}], ['SentryEnabled', {config: {SentryEnabled: true}}],
            ['SentryDsnAndroid', {config: {SentryDsnAndroid: 'https://x@example.invalid/2'}}], ['RudderApiKey', {config: {RudderApiKey: 'abc'}}],
        ];
        for (const [key, o] of cases) {
            const r = ag6(tree(o));
            expect([key, r.rc]).toEqual([key, 1]);
            expect(r.out).toContain(key);
        }
    });

    it('UT-120 firebase_analytics_collection_deactivated の meta-data が欠落／android:value="false": 2通りとも rc=1', () => {
        expect(ag6(tree({manifest: {app: {analytics: false}}})).rc).toBe(1);
        expect(ag6(tree({manifest: {app: {analytics: 'false'}}})).rc).toBe(1);
    });

    it('UT-121 ①--cleartext allow で NSC・マニフェストが false → rc=1 ②既定（引数なし）で NSC・マニフェストが true（上流のまま）→ rc=1・出力に cleartextTrafficPermitted と usesCleartextTraffic', () => {
        expect(ag6(tree(), ['--cleartext', 'allow']).rc).toBe(1);
        const r = ag6(tree(UPSTREAM));
        expect(r.rc).toBe(1);
        expect(r.out).toContain('cleartextTrafficPermitted');
        expect(r.out).toContain('usesCleartextTraffic');
    });

    it('UT-122 --cleartext forbid --user-ca forbid: 現行相当（NSC true・user あり）は rc=1、禁止形（false・user なし・マニフェスト false）は rc=0', () => {
        expect(ag6(tree(UPSTREAM), ['--cleartext', 'forbid', '--user-ca', 'forbid']).rc).toBe(1);
        expect(ag6(tree({nsc: {cleartext: 'false', userCa: ''}}), ['--cleartext', 'forbid', '--user-ca', 'forbid']).rc).toBe(0);
    });

    it('UT-123 既定で食い違い: ①NSC=true・マニフェスト false ②NSC=false・マニフェスト true: 2通りとも rc=1', () => {
        expect(ag6(tree({nsc: {cleartext: 'true'}})).rc).toBe(1);
        expect(ag6(tree({manifest: {app: {cleartext: 'true'}}})).rc).toBe(1);
    });

    it('UT-124 マニフェストに usesCleartextTraffic 属性が無い（既定／--cleartext allow）: 2通りとも rc=1（明示が必要）', () => {
        expect(ag6(tree({manifest: {app: {cleartext: null}}})).rc).toBe(1);
        expect(ag6(tree({nsc: {cleartext: 'true'}, manifest: {app: {cleartext: null}}}), ['--cleartext', 'allow']).rc).toBe(1);
    });

    it('UT-125 --user-ca keep で user 証明書の行が無い／--user-ca forbid で行がある: どちらも rc=1', () => {
        expect(ag6(tree({nsc: {cleartext: 'false', userCa: ''}}), ['--user-ca', 'keep']).rc).toBe(1);
        expect(ag6(tree(), ['--user-ca', 'forbid']).rc).toBe(1);
    });

    it('UT-126 user 証明書の行の書式ゆれ（<certificates src="user"/>・" />"・単一引用符・前後の空白）: 4通りとも keep で rc=0', () => {
        for (const line of ['<certificates src="user"/>', '<certificates src="user" />', "<certificates src='user' />", '   <certificates   src="user"   />   ']) {
            const r = ag6(tree({nsc: {cleartext: 'false', userCa: line}}));
            expect([line, r.rc]).toEqual([line, 0]);
        }
    });

    it('UT-127 コメントアウトされた <!-- <certificates src="user" /> --> だけがある NSC（keep）: rc=1（コメントは存在に数えない）', () => {
        expect(ag6(tree({nsc: {cleartext: 'false', userCa: '<!-- <certificates src="user" /> -->'}})).rc).toBe(1);
    });

    it('UT-128 対象の値が見つからない: sentry.options.json 無し／config.json に SentryEnabled キー無し／NSC に cleartextTrafficPermitted 無し／config.json が壊れたJSON: 4通りとも rc=1', () => {
        const a = tree();
        fs.rmSync(a + '/android/app/src/main/assets/sentry.options.json');
        const b = tree();
        fs.writeFileSync(b + '/assets/base/config.json', '{"SentryDsnAndroid":"","RudderApiKey":""}\n');
        const c = tree();
        fs.writeFileSync(c + '/' + NSC, '<network-security-config><base-config><trust-anchors><certificates src="user" /></trust-anchors></base-config></network-security-config>\n');
        const d = tree();
        fs.writeFileSync(d + '/assets/base/config.json', '{broken');
        for (const root of [a, b, c, d]) {
            expect(ag6(root).rc).toBe(1);
        }
    });

    it('UT-129 値域外（--cleartext maybe／deny／空／Forbid、--user-ca zzz／空）の6通り: 全て rc=2・FAIL 行0件（usage のみ）', () => {
        const root = tree();
        const bad: string[][] = [['--cleartext', 'maybe'], ['--cleartext', 'deny'], ['--cleartext', ''], ['--cleartext', 'Forbid'], ['--user-ca', 'zzz'], ['--user-ca', '']];
        for (const b of bad) {
            const r = ag6(root, b);
            expect([b.join(' '), r.rc]).toEqual([b.join(' '), 2]);
            expect(s.failLines(r)).toHaveLength(0);
            expect(r.err).toMatch(/usage/i);
        }
    });

    it('UT-134【基】基点コミットの NSC・マニフェスト・Sentry 設定: ①既定→rc=1（cleartextTrafficPermitted と usesCleartextTraffic の2件の FAIL: AG6:）②forbid＋user-ca forbid→rc=1（user 証明書も違反）③allow→rc=0', () => {
        const root = s.baseTree(['android/app/src/main/res/xml', 'android/app/src/main/AndroidManifest.xml', 'android/app/src/main/assets/sentry.options.json', 'assets/base/config.json']);
        const one = ag6(root);
        expect(one.rc).toBe(1);
        const f = s.failLines(one, 'AG6').join('\n');
        expect(f).toContain('cleartextTrafficPermitted');
        expect(f).toContain('usesCleartextTraffic');
        const two = ag6(root, ['--cleartext', 'forbid', '--user-ca', 'forbid']);
        expect(two.rc).toBe(1);
        expect(s.failLines(two, 'AG6').length).toBeGreaterThan(s.failLines(one, 'AG6').length);
        expect(ag6(root, ['--cleartext', 'allow']).rc).toBe(0);
    });

    it('UT-322 既定が forbid であること（IT-131の細目）: 6入力を引数なしと --cleartext forbid --user-ca keep で実行し rc・FAIL 行が完全一致。--cleartext allow では ② が rc=0・① が rc=1', () => {
        const inputs: Array<[string, Record<string, unknown>, number]> = [
            ['good', {}, 0], ['upstream', UPSTREAM, 1], ['nsc-false-man-true', {manifest: {app: {cleartext: 'true'}}}, 1],
            ['nsc-true-man-false', {nsc: {cleartext: 'true'}}, 1], ['no-attr', {manifest: {app: {cleartext: null}}}, 1], ['no-user', {nsc: {cleartext: 'false', userCa: ''}}, 1],
        ];
        for (const [label, o, rc] of inputs) {
            const root = tree(o);
            const d = ag6(root);
            const e = ag6(root, ['--cleartext', 'forbid', '--user-ca', 'keep']);
            expect([label, d.rc]).toEqual([label, rc]);
            expect(e.rc).toBe(d.rc);
            expect(s.failLines(e)).toEqual(s.failLines(d));
        }
        expect(ag6(tree(UPSTREAM), ['--cleartext', 'allow']).rc).toBe(0);
        expect(ag6(tree(), ['--cleartext', 'allow']).rc).toBe(1);
    });
});

describe('AG6 post（マージ後マニフェスト・nsc.txt。詳細設計 §5.3.6 ⑧⑨）', () => {
    const post = (d: string, extra: string[] = []) => s.guard(['ag6', '--phase', 'post', '--dir', s.posix(d), ...extra]);
    const NSC_FALSE = 'A: cleartextTrafficPermitted=false (Raw: "false")\n  E: certificates src="user"\n';
    const NSC_TRUE = 'A: cleartextTrafficPermitted=true (Raw: "true")\n  E: certificates src="user"\n';

    it('UT-130 post（forbid。既定・明示の2通り）: マージ後 usesCleartextTraffic="false"・nsc.txt が false を示す＋user 証明書あり: 2通りとも rc=0', () => {
        const d = s.extractDir({cleartext: 'false', nscTxt: NSC_FALSE});
        expect(post(d).rc).toBe(0);
        expect(post(d, ['--cleartext', 'forbid']).rc).toBe(0);
    });

    it('UT-131 post（forbid）: マージ後マニフェストが "true"（ライブラリが足した想定）・NSC は false: rc=1（ソースでなくマージ後を読む）', () => {
        const r = post(s.extractDir({cleartext: 'true', nscTxt: NSC_FALSE}));
        expect(r.rc).toBe(1);
        expect(r.out).toContain('usesCleartextTraffic');
    });

    it('UT-132 post（--cleartext allow。戻す場合の鏡像）: マージ後マニフェストが "false"／属性なし: どちらも rc=1', () => {
        expect(post(s.extractDir({cleartext: 'false', nscTxt: NSC_TRUE}), ['--cleartext', 'allow']).rc).toBe(1);
        const noAttr = s.extractDir({nscTxt: NSC_TRUE});
        fs.writeFileSync(noAttr + '/manifest.xml', fs.readFileSync(noAttr + '/manifest.xml', 'utf8').replace(/ android:usesCleartextTraffic="[^"]*"/, ''));
        expect(post(noAttr, ['--cleartext', 'allow']).rc).toBe(1);
    });

    it('UT-133 post: nsc.txt が空／認識できない書式（無関係なテキスト）: どちらも rc=1（認識できない書式は違反）', () => {
        expect(post(s.extractDir({nscTxt: '', cleartext: 'false'})).rc).toBe(1);
        expect(post(s.extractDir({nscTxt: 'lorem ipsum\n', cleartext: 'false'})).rc).toBe(1);
    });
});
