// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG3 署名（UT-066〜086・352・353・356）。詳細設計 §5.3.3
// 秘密の値は使わない: パスワードはカナリア、鍵は実行ごとに作る使い捨て（L2。keytool が無ければ「未実施（環境）」）。
// keytool スタブは引数を stub.log に記録し、STUB_KEYTOOL_RC / _OUT で挙動を指定する。

export {};

const s = require('./android_test_support.cjs');
const cp = require('child_process');
const fs = require('fs');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const PW = 'CANARY_PW_9f3a';
const ALIAS = 'weaver-test';
const FP_OUT = `Certificate fingerprints:\n\t SHA256: ${s.SHA_OK}`;

function pre(o: {signing?: string; mode?: string; upload?: string; check?: string | null; env?: Record<string, string | undefined>; keytoolRc?: string; keytoolOut?: string; ks?: string | null; expected?: string | undefined} = {}) {
    const stubs = s.makeStubs(['keytool']);
    const root = s.tmp();
    const ksPath = o.ks === undefined ? s.write(root, 'k.jks', 'dummy-keystore') : o.ks;
    const env: Record<string, string> = {
        WEAVER_KEYTOOL: s.posix(stubs.dir + '/keytool'),
        STUB_KEYTOOL_OUT: o.keytoolOut === undefined ? FP_OUT : o.keytoolOut,
    };
    if (ksPath) {
        env.WEAVER_KEYSTORE_FILE = s.posix(ksPath);
    }
    env.WEAVER_KEYSTORE_PASSWORD = PW;
    env.WEAVER_KEY_ALIAS = ALIAS;
    if (o.expected !== undefined) {
        env.WEAVER_EXPECTED_CERT_SHA256 = o.expected;
    } else {
        env.WEAVER_EXPECTED_CERT_SHA256 = s.SHA_OK_PLAIN;
    }
    if (o.keytoolRc) {
        env.STUB_KEYTOOL_RC = o.keytoolRc;
    }
    const unset: string[] = [];
    for (const [k, v] of Object.entries(o.env || {})) {
        if (v === undefined) {
            unset.push(k);
        } else {
            env[k] = v;
        }
    }
    const args = ['ag3', '--phase', 'pre', '--mode', o.mode ?? 'confirm', '--signing', o.signing ?? 'signed', '--upload-to-play', o.upload ?? 'false'];
    if (o.check !== null) {
        args.push('--keystore-check', o.check ?? 'required');
    }
    const r = s.guard(args, {env, stubDir: stubs.dir, unsetEnv: unset});
    return {r, stubs};
}

describe('AG3 pre（署名あり）', () => {
    it('UT-066 3変数が全て非空・keytool スタブ rc=0（証明書SHA一致）: rc=0・ANDROID GUARD AG3 PASSED', () => {
        const {r} = pre();
        expect(r.rc).toBe(0);
        expect(r.out).toContain('ANDROID GUARD AG3 PASSED');
    });

    it('UT-067 3変数を1つずつ空／未定義にした6通り: 全て rc=1・欠けた変数名が出る・keytool スタブの呼び出し0回', () => {
        for (const name of ['WEAVER_KEYSTORE_FILE', 'WEAVER_KEYSTORE_PASSWORD', 'WEAVER_KEY_ALIAS']) {
            for (const how of ['empty', 'unset']) {
                const {r, stubs} = pre({env: {[name]: how === 'empty' ? '' : undefined}});
                expect([name, how, r.rc]).toEqual([name, how, 1]);
                expect(r.out).toContain(name);
                expect(stubs.calls('keytool')).toHaveLength(0);
            }
        }
    });

    it('UT-068 WEAVER_KEYSTORE_FILE が存在しないパス／ディレクトリ／0バイト（keytool 失敗）: 3通りとも rc=1', () => {
        const root = s.tmp();
        s.write(root, 'dir/x', 'x');
        const zero = s.write(root, 'zero.jks', '');
        for (const [label, ks, rc] of [['missing', s.posix(root + '/nope.jks'), undefined], ['dir', s.posix(root + '/dir'), undefined], ['zero', s.posix(zero), '1']] as Array<[string, string, string | undefined]>) {
            const {r} = pre({ks, keytoolRc: rc});
            expect([label, r.rc]).toEqual([label, 1]);
        }
    });

    it('UT-069 keytool スタブが rc=1（パスワード誤り・別名なし）: rc=1・出力にパスワード文字列0件', () => {
        const {r} = pre({keytoolRc: '1'});
        expect(r.rc).toBe(1);
        expect(s.all(r)).not.toContain(PW);
    });

    it('UT-070 keytool の引数記録: -storepass:env と WEAVER_KEYSTORE_PASSWORD を含み、実際のパスワードは含まない・-alias の直後が別名の値', () => {
        const {r, stubs} = pre();
        expect(r.rc).toBe(0);
        const calls = stubs.calls('keytool');
        expect(calls.length).toBeGreaterThanOrEqual(1);
        for (const c of calls) {
            expect(c).toContain('-storepass:env');
            expect(c).toContain('WEAVER_KEYSTORE_PASSWORD');
            expect(c).not.toContain(PW);
        }
        expect(calls.some((c: string) => new RegExp(`-alias\\s+${ALIAS}(\\s|$)`).test(c))).toBe(true);
    });

    it('UT-071 署名なし pre（confirm）で3変数が設定済み: rc=0・keytool スタブ呼び出し0回（署名用変数を見ない）', () => {
        const {r, stubs} = pre({signing: 'unsigned'});
        expect(r.rc).toBe(0);
        expect(stubs.calls('keytool')).toHaveLength(0);
    });

    it('UT-072 署名なし pre＋--mode submission: rc=1（提出用は署名ありのみ）', () => {
        const {r} = pre({signing: 'unsigned', mode: 'submission'});
        expect(r.rc).toBe(1);
    });

    it('UT-073 --upload-to-play true（署名あり・署名なしの2通り）: rc=1・標準出力に FAIL: AG3: upload_to_play: manual upload only', () => {
        for (const signing of ['signed', 'unsigned']) {
            const {r} = pre({signing, upload: 'true'});
            expect([signing, r.rc]).toEqual([signing, 1]);
            expect(r.out).toContain('FAIL: AG3: upload_to_play: manual upload only');
            expect(r.err).not.toContain('manual upload only');
        }
    });

    it('UT-074 --upload-to-play false＋署名なし・confirm: rc=0', () => {
        expect(pre({signing: 'unsigned', upload: 'false'}).r.rc).toBe(0);
    });

    it('UT-075 --upload-to-play が yes／空文字: rc=2（値は true|false のみ）', () => {
        expect(pre({upload: 'yes', signing: 'unsigned'}).r.rc).toBe(2);
        expect(pre({upload: '', signing: 'unsigned'}).r.rc).toBe(2);
    });
});

describe('AG3 post（署名後の証明書。詳細設計 §5.3.3）', () => {
    const post = (cert: string | null, o: {signing?: string; expected?: string | null} = {}) => {
        const root = s.tmp();
        const args = ['ag3', '--phase', 'post', '--signing', o.signing || 'signed'];
        if (cert !== null) {
            args.push('--cert-file', s.posix(s.write(root, 'cert.txt', cert)));
        } else {
            args.push('--cert-file', s.posix(root + '/missing.txt'));
        }
        if (o.expected !== null) {
            args.push('--expected-sha256', o.expected === undefined ? s.SHA_OK_PLAIN : o.expected);
        }
        return s.guard(args);
    };

    it('UT-076 署名あり: 登録値をコロンなし大文字／コロンあり小文字／前後空白／コロンなし小文字で渡す: 4通りとも rc=0', () => {
        for (const v of [s.SHA_OK_PLAIN, s.SHA_OK.toLowerCase(), ` ${s.SHA_OK_PLAIN} `, s.SHA_OK_PLAIN.toLowerCase()]) {
            const r = post(s.certTxt(), {expected: v});
            expect([v, r.rc]).toEqual([v, 0]);
        }
    });

    it('UT-077 署名あり: 1桁だけ違う登録値: rc=1', () => {
        const wrong = s.SHA_OK_PLAIN.slice(0, -1) + (s.SHA_OK_PLAIN.endsWith('D') ? 'E' : 'D');
        expect(post(s.certTxt(), {expected: wrong}).rc).toBe(1);
    });

    it('UT-078 署名あり: 登録値が空・未指定: rc=1', () => {
        expect(post(s.certTxt(), {expected: ''}).rc).toBe(1);
        expect(post(s.certTxt(), {expected: null}).rc).toBe(1);
    });

    it('UT-079 署名あり: SHA256: 行が0件／2件: どちらも rc=1（ちょうど1件）', () => {
        expect(post('Owner: CN=Weaver Upload\n').rc).toBe(1);
        expect(post(s.certTxt() + `\t SHA256: ${s.SHA_OK}\n`).rc).toBe(1);
    });

    it('UT-080 署名あり: Owner が CN=Android Debug で SHA は登録値と一致: rc=1（debug 署名は登録値と一致しても違反）', () => {
        expect(post(s.certTxt({owner: 'CN=Android Debug, OU=Android, O=US'})).rc).toBe(1);
    });

    it('UT-081 署名なし: cert.txt が SHA256: 行を含まない: rc=0', () => {
        expect(post(s.certTxt({unsigned: true}), {signing: 'unsigned', expected: null}).rc).toBe(0);
    });

    it('UT-082 署名なし: cert.txt に SHA256: 行が1件ある（署名がある）: rc=1', () => {
        expect(post(s.certTxt(), {signing: 'unsigned', expected: null}).rc).toBe(1);
    });

    it('UT-083 --cert-file が存在しない: rc=1', () => {
        expect(post(null).rc).toBe(1);
    });

    it('UT-356 post --signing unsigned の意味と ag3 post --signing signed の意味（署名なしを確かめる／登録の証明書で署名済み）', () => {
        const dUnsigned = s.extractDir({signed: false});
        const dSigned = s.extractDir({signed: true});
        const common = ['--mode', 'confirm', '--run-number', '1', '--app-version', '2.45.0', '--cleartext', 'forbid'];
        const a = s.guard(['post', '--dir', s.posix(dUnsigned), '--signing', 'unsigned', ...common]);
        const b = s.guard(['post', '--dir', s.posix(dSigned), '--signing', 'unsigned', ...common]);
        expect(a.rc).toBe(0);
        expect(b.rc).toBe(1);
        expect(s.failLines(b, 'AG3').length).toBeGreaterThanOrEqual(1);
        expect(post(s.certTxt()).rc).toBe(0);
        expect(post(s.certTxt({unsigned: true})).rc).toBe(1);
        expect(post(s.certTxt(), {expected: '00'.repeat(32)}).rc).toBe(1);
        expect(post(s.certTxt(), {expected: ''}).rc).toBe(1);
        expect(post(s.certTxt({owner: 'CN=Android Debug'})).rc).toBe(1);
    });
});

describe('--keystore-check と証明書SHA-256の事前照合（詳細設計 §5.3.3。P5・B9・B10）', () => {
    const none = {WEAVER_KEYSTORE_FILE: undefined, WEAVER_KEYSTORE_PASSWORD: undefined, WEAVER_KEY_ALIAS: undefined};

    it('UT-352 3変数が未設定で: 引数なし・required は rc=1（既定は required）、skip は rc=0、Required・off・空は rc=2、unsigned＋required は rc=0。skip でも upload true は rc=1', () => {
        const mk = (check: string | null, signing = 'signed', upload = 'false') => pre({env: none, check, signing, upload, ks: null});
        expect(mk(null).r.rc).toBe(1);
        expect(mk('required').r.rc).toBe(1);
        expect(mk('skip').r.rc).toBe(0);
        for (const bad of ['Required', 'off', '']) {
            const x = mk(bad).r;
            expect([bad, x.rc]).toEqual([bad, 2]);
            expect(s.failLines(x)).toHaveLength(0);
        }
        expect(mk('required', 'unsigned').r.rc).toBe(0);
        const up = mk('skip', 'signed', 'true').r;
        expect(up.rc).toBe(1);
        expect(up.out).toContain('manual upload only');
    });

    it('UT-353 証明書SHA-256の事前照合: 一致（コロンあり小文字・コロンなし大文字・前後空白）は rc=0。1桁違い・登録値が空・keytool -list 失敗・SHA256 行なしは rc=1。パスワードは出力・引数に出ない', () => {
        for (const v of [s.SHA_OK.toLowerCase(), s.SHA_OK_PLAIN, ` ${s.SHA_OK_PLAIN} `]) {
            const {r} = pre({expected: v});
            expect([v, r.rc]).toEqual([v, 0]);
        }
        const wrong = s.SHA_OK_PLAIN.slice(0, -1) + (s.SHA_OK_PLAIN.endsWith('D') ? 'E' : 'D');
        const cases: Array<[string, ReturnType<typeof pre>]> = [
            ['one-digit', pre({expected: wrong})], ['empty-registered', pre({expected: ''})],
            ['keytool-fails', pre({keytoolRc: '1'})], ['no-sha-line', pre({keytoolOut: 'Alias name: weaver-test'})],
        ];
        for (const [label, x] of cases) {
            expect([label, x.r.rc]).toEqual([label, 1]);
            expect(s.all(x.r)).not.toContain(PW);
            for (const c of x.stubs.calls('keytool')) {
                expect(c).not.toContain(PW);
            }
        }
    });
});

// ---- L2（実ツール。keytool・jarsigner が無ければ「未実施（環境）」）----
const haveKeytool = s.toolOk(s.L2_KEYTOOL);
const haveJarsigner = s.toolOk(s.L2_JARSIGNER);
const itL2 = (name: string, ok: boolean, fn: () => void) => (ok ? it(name, fn) : it.skip(`${s.ENV_MISSING}${name}`, fn));
const L2PW = 'CANARY_L2_PW_71c';

function makeKeystore(dir: string, storePw: string, keyPw: string, alias = 'weaver-test', dn = 'CN=Weaver Upload, O=MET Architect') {
    const ks = s.posix(dir + '/ks.jks');
    const r = cp.spawnSync(s.BASH, ['-c', `"${s.L2_KEYTOOL}" -genkeypair -alias ${alias} -keyalg RSA -keysize 2048 -validity 2 -dname "${dn}" -keystore "${ks}" -storepass:env WEAVER_L2_STORE -keypass:env WEAVER_L2_KEY`], {encoding: 'utf8', env: {...process.env, WEAVER_L2_STORE: storePw, WEAVER_L2_KEY: keyPw}});
    return {ks, ok: r.status === 0, err: r.stderr};
}
function certSha(ks: string, storePw: string, alias = 'weaver-test') {
    const r = cp.spawnSync(s.BASH, ['-c', `"${s.L2_KEYTOOL}" -list -v -keystore "${ks}" -alias ${alias} -storepass:env WEAVER_L2_STORE`], {encoding: 'utf8', env: {...process.env, WEAVER_L2_STORE: storePw}});
    const m = /SHA256:\s*([0-9A-F:]+)/i.exec(r.stdout || '');
    return m ? m[1].replace(/:/g, '') : '';
}

describe('AG3 L2（実 keytool・jarsigner）', () => {
    const l2pre = (ks: string, pw: string, alias: string, expected: string) => s.guard(
        ['ag3', '--phase', 'pre', '--mode', 'confirm', '--signing', 'signed', '--upload-to-play', 'false', '--keystore-check', 'required'],
        {env: {WEAVER_KEYTOOL: s.L2_KEYTOOL, WEAVER_KEYSTORE_FILE: ks, WEAVER_KEYSTORE_PASSWORD: pw, WEAVER_KEY_ALIAS: alias, WEAVER_EXPECTED_CERT_SHA256: expected}},
    );

    itL2('UT-084 実 keytool で使い捨て keystore を作り AG3 pre: 正しいパスワードで rc=0、誤ったパスワード・存在しない alias は rc=1・出力にパスワード0件', haveKeytool, () => {
        const d = s.tmp();
        const k = makeKeystore(d, L2PW, L2PW);
        expect(k.ok).toBe(true);
        const sha = certSha(k.ks, L2PW);
        expect(l2pre(k.ks, L2PW, 'weaver-test', sha).rc).toBe(0);
        const bad = l2pre(k.ks, 'WRONG_PW_xyz', 'weaver-test', sha);
        const noAlias = l2pre(k.ks, L2PW, 'no-such-alias', sha);
        expect([bad.rc, noAlias.rc]).toEqual([1, 1]);
        for (const r of [bad, noAlias]) {
            expect(s.all(r)).not.toContain(L2PW);
            expect(s.all(r)).not.toContain('WRONG_PW_xyz');
        }
    });

    itL2('UT-085 使い捨て jar を同 keystore で署名（jarsigner）し keytool -printcert -jarfile の出力を post へ: 一致で rc=0。CN=Android Debug の使い捨て鍵で署名した版は、登録値と一致しても rc=1', haveKeytool && haveJarsigner, () => {
        const d = s.tmp();
        const k = makeKeystore(d, L2PW, L2PW);
        expect(k.ok).toBe(true);
        const sha = certSha(k.ks, L2PW);
        const jar1 = s.posix(s.write(d, 'a.jar', s.zipBuf({'x.txt': 'x'}), null));
        const jar2 = s.posix(s.write(d, 'b.jar', s.zipBuf({'x.txt': 'x'}), null));
        const sign = (jar: string, ks: string, pw: string, alias: string) => cp.spawnSync(s.BASH, ['-c', `"${s.L2_JARSIGNER}" -keystore "${ks}" -storepass:env WEAVER_L2_STORE -sigalg SHA256withRSA -digestalg SHA-256 "${jar}" ${alias}`], {encoding: 'utf8', env: {...process.env, WEAVER_L2_STORE: pw}});
        expect(sign(jar1, k.ks, L2PW, 'weaver-test').status).toBe(0);
        // リポジトリの android/app/debug.keystore は Mattermost 社の QA 鍵（CN=QA Team）で CN=Android Debug ではない（D-S2-10）。使い捨ての「Android Debug」鍵を作って確かめる
        const dbg = makeKeystore(s.tmp(), 'android', 'android', 'androiddebugkey', 'CN=Android Debug, O=Android, C=US');
        expect(dbg.ok).toBe(true);
        expect(sign(jar2, dbg.ks, 'android', 'androiddebugkey').status).toBe(0);
        const printcert = (jar: string) => cp.spawnSync(s.BASH, ['-c', `"${s.L2_KEYTOOL}" -printcert -jarfile "${jar}"`], {encoding: 'utf8'}).stdout;
        const c1 = s.posix(s.write(d, 'c1.txt', printcert(jar1)));
        const c2 = s.posix(s.write(d, 'c2.txt', printcert(jar2)));
        expect(s.guard(['ag3', '--phase', 'post', '--signing', 'signed', '--cert-file', c1, '--expected-sha256', sha]).rc).toBe(0);
        const debugSha = (/SHA256:\s*([0-9A-F:]+)/i.exec(fs.readFileSync(c2, 'utf8')) || ['', ''])[1].replace(/:/g, '');
        expect(s.guard(['ag3', '--phase', 'post', '--signing', 'signed', '--cert-file', c2, '--expected-sha256', debugSha]).rc).toBe(1);
    });

    itL2('UT-086 store password と key password が異なる keystore で AG3 pre: rc=0（検出しない。BD-40の限界を固定する陽性テスト）', haveKeytool, () => {
        const d = s.tmp();
        const k = makeKeystore(d, L2PW, 'OTHER_KEY_PW_88e');
        expect(k.ok).toBe(true);
        expect(l2pre(k.ks, L2PW, 'weaver-test', certSha(k.ks, L2PW)).rc).toBe(0);
    });
});
