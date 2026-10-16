// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 追加試験: 署名なし測定ビルド（CI run 38485936546・bundletool 1.18.3）の実出力の書式をフィクスチャにした試験（詳細設計 v1.9）
//   UT-387 FGS種別の16進／UT-388 dump resources --values／UT-389 NSC（aapt2 xmltree）／UT-390 許可リスト(b)6件／
//   UT-391 基準値の境界／UT-392 aapt2・dexdump・zipalign・keytool の実測書式
// 実AAB（保持1日）は取得できないため、実装担当が確認した実出力の断片を使う。(b)・基準値の「現データ」を前提とする試験は段階値 S3 でだけ実行する。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const path = require('path');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const stageIs = (st: string) => {
    try {
        return s.stage() === st;
    } catch (e) {
        return false;
    }
};
const itS3 = stageIs('S3') || stageIs('S4') ? it : it.skip; // 現データ（(b)6件・基準値）は S3 で確定する
if (!(stageIs('S3') || stageIs('S4'))) {
    // eslint-disable-next-line no-console
    console.warn(s.ENV_MISSING + ' UT-390・391 の現データ試験: 段階値が S3 未満のため実行しない');
}

// ---- UT-387 FGS 種別の16進 ----
function mergedWith(type: string | null, extra: string[] = []) {
    const d = s.extractDir();
    const m = fs.readFileSync(d + '/manifest.xml', 'utf8').replace('</application>', `        <service android:name="androidx.work.impl.foreground.SystemForegroundService"${type === null ? '' : ` android:foregroundServiceType="${type}"`} />\n    </application>`);
    fs.writeFileSync(d + '/manifest.xml', m);
    const al = s.write(d, 'allow.txt', s.allowlistTxt());
    return s.guard(['ag1', '--kind', 'merged', '--manifest', s.posix(d + '/manifest.xml'), '--allowlist', s.posix(al), ...extra]);
}
describe('UT-387 AG1 merged の FGS 種別（bundletool dump manifest は16進で出す）', () => {
    it('0x1・0x00000001・0x0001・名前 dataSync は合格', () => {
        for (const t of ['0x1', '0x00000001', '0x0001', 'dataSync']) {
            const r = mergedWith(t);
            expect([t, r.rc]).toEqual([t, 0]);
        }
    });
    it('0x00000081（dataSync＋microphone）・0x00000080・0x40000000・0x0・0xZZ・空は違反（種別を出力に出す）', () => {
        for (const t of ['0x00000081', '0x00000080', '0x40000000', '0x0', '0xZZ', '']) {
            const r = mergedWith(t);
            expect([t, r.rc]).toEqual([t, 1]);
            expect(s.failLines(r, 'AG1').join('\n')).toContain('foreground service type');
            if (t.startsWith('0x00') || t === '0x0') {
                expect(r.out).toContain(t);
            }
        }
    });
    it('foregroundServiceType の無いサービスは検査対象外（rc=0）', () => {
        expect(mergedWith(null).rc).toBe(0);
    });
});

// ---- 実測フィクスチャで extract を動かす ----
const RES_PID = '0x7f120161 - string/project_id\n        (default) - [STR] "weaver-android-proj"\n';
const RES_APP = '0x7f12015f - string/google_app_id\n        (default) - [STR] "1:123456789012:android:abcdef0123456789"\n';
const NSC_REAL = ['N: android=http://schemas.android.com/apk/res/android (line=2)', '  E: network-security-config (line=2)', '    E: base-config (line=3)', '      A: cleartextTrafficPermitted=false', '      E: trust-anchors (line=4)', '        E: certificates (line=5)', '          A: src="user" (Raw: "user")', ''].join('\n');
const AAPT_RES = 'Package name=com.metarchitect.Weaver id=7f\n  type xml id=19 entryCount=1\n    resource 0x7f130001 xml/network_security_config\n      () (file) res/xml/network_security_config.xml type=XML\n';
const KEYTOOL_UNSIGNED = 'Not a signed jar file\n';
const KEYTOOL_SIGNED = ['Signer #1:', '', 'Signature:', '', 'Owner: CN=Weaver Upload, O=MET Architect', 'Issuer: CN=Weaver Upload, O=MET Architect', 'Serial number: 1a2b3c', 'Valid from: Mon Oct 13 00:00:00 JST 2026 until: Wed Oct 13 00:00:00 JST 2027', 'Certificate fingerprints:', `\t SHA1: AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD`, `\t SHA256: ${s.SHA_OK}`, 'Signature algorithm name: SHA256withRSA', 'Subject Public Key Algorithm: 2048-bit RSA key', 'Version: 3', ''].join('\n');
const DEXDUMP_REAL = ["Processing 'classes.dex'...", "Opened 'classes.dex', DEX version '039'", 'Class #0            -', "  Class descriptor  : 'Lcom/mattermost/rnbeta/MainActivity;'", '  Access flags      : 0x0001 (PUBLIC)', "  Superclass        : 'Lexpo/modules/ReactActivityDelegateWrapper;'", 'Class #1            -', "  Class descriptor  : 'Lcom/mattermost/rnbeta/MainApplication$Companion;'", ''].join('\n');
const UNZIP_L = ['Archive:  x.aab', '  Length      Date    Time    Name', '---------  ---------- -----   ----', '    1000  2026-10-14 00:00   base/lib/arm64-v8a/libhermes.so', '    1000  2026-10-14 00:00   base/lib/armeabi-v7a/libhermes.so', '    1000  2026-10-14 00:00   base/lib/x86_64/libhermes.so', '    1000  2026-10-14 00:00   base/dex/classes.dex', '---------                     -------', '     4000                     4 files', ''].join('\n');

function extractReal(o: {pid?: string; app?: string; keytoolRc?: number; keytoolOut?: string; signing?: 'signed' | 'unsigned'} = {}) {
    const st = s.makeStubs(['java', 'dexdump', 'aapt2', 'keytool', 'unzip']);
    const w = s.tmp('k79-real-');
    const f = (n: string, t: string) => s.posix(s.write(w, n, t));
    const rule = (n: string, rows: Array<[string, number, string]>) => s.posix(s.write(w, n, rows.map(([p, rc, of]) => `${p}|||${rc}|||${of}`).join('\n') + '\n'));
    const manifest = f('m.src', '<manifest package="com.metarchitect.Weaver" android:versionCode="1001" android:versionName="2.45.0" />\n');
    const env: Record<string, string> = {
        STUB_JAVA_RULES: rule('java.r', [['string/project_id', 0, f('pid', o.pid ?? RES_PID)], ['string/google_app_id', 0, f('app', o.app ?? RES_APP)], ['dump manifest', 0, manifest], ['build-apks', 0, '']]),
        STUB_JAVA_COPY_OUTPUT: s.posix(s.write(w, 'u.src', 'APK')),
        STUB_AAPT2_RULES: rule('aapt.r', [['dump resources', 0, f('ar', AAPT_RES)], ['xmltree', 0, f('nsc', NSC_REAL)]]),
        STUB_KEYTOOL_RULES: rule('kt.r', [['-printcert', o.keytoolRc ?? 0, f('kt', o.keytoolOut ?? KEYTOOL_SIGNED)], ['-genkeypair', 0, '']]),
        STUB_UNZIP_RULES: rule('un.r', [['-Z1', 0, f('z1', 'base/dex/classes.dex\n')], ['-l', 0, f('zl', UNZIP_L)], ['-p', 0, f('dd', DEXDUMP_REAL)]]),
        STUB_DEXDUMP_RULES: rule('dx.r', [['', 0, f('dxo', DEXDUMP_REAL)]]),
        WEAVER_KEYTOOL: s.posix(path.join(st.dir, 'keytool')), WEAVER_AAPT2: s.posix(path.join(st.dir, 'aapt2')), WEAVER_DEXDUMP: s.posix(path.join(st.dir, 'dexdump')),
    };
    const aab = s.write(w, 'in.aab', s.smallAab());
    const jar = s.write(w, 'b.jar', 'JAR');
    const out = path.join(w, 'out');
    const r = s.aab(['extract', '--aab', s.posix(aab), '--bundletool-jar', s.posix(jar), '--signing', o.signing || 'signed', '--out', s.posix(out)], {stubDir: st.dir, env});
    return {r, out};
}
const rd = (d: string, n: string) => fs.readFileSync(path.join(d, n), 'utf8').replace(/\r/g, '');

// ---- UT-388 ----
describe('UT-388 bundletool dump resources --values の実出力（0x7f… - string/名前 ＋ 次行 (default) - [STR] "値"）', () => {
    it('project_id・google_app_id が resources.txt に string/<名前>: <値> の2行で入る', () => {
        const {r, out} = extractReal();
        expect(r.rc).toBe(0);
        expect(rd(out, 'resources.txt')).toBe('string/project_id: weaver-android-proj\nstring/google_app_id: 1:123456789012:android:abcdef0123456789\n');
    });
    it('値が空・[STR] の行が無い→rc=1（FAIL: resources: string/<名前> was not found）', () => {
        for (const o of [{pid: '0x7f120161 - string/project_id\n        (default) - [STR] ""\n'}, {app: '0x7f12015f - string/google_app_id\n'}]) {
            const {r} = extractReal(o);
            expect(r.rc).toBe(1);
            expect(r.out).toMatch(/FAIL: .*resources: string\/(project_id|google_app_id) was not found/);
        }
    });
    it('旧形式（string/<名前>: <値>・Value: "…"）も受理する', () => {
        const a = extractReal({pid: 'string/project_id: weaver-old\n'});
        expect(a.r.rc).toBe(0);
        expect(rd(a.out, 'resources.txt')).toContain('string/project_id: weaver-old');
        const b = extractReal({app: 'Value: "1:1:android:zzz"\n'});
        expect(b.r.rc).toBe(0);
        expect(rd(b.out, 'resources.txt')).toContain('string/google_app_id: 1:1:android:zzz');
    });
    it('AG2 post: 抽出した resources.txt（実書式由来）をそのまま読める（ダミー判定・実キー判定が働く）', () => {
        const dummy = extractReal({pid: '0x7f120161 - string/project_id\n        (default) - [STR] "DUMMY-weaver-unsigned-verification"\n', app: '0x7f12015f - string/google_app_id\n        (default) - [STR] "1:000000000000:android:DUMMY0000000000000000"\n'});
        expect(dummy.r.rc).toBe(0);
        const root = s.fullTree();
        const r = s.guard(['ag2', '--phase', 'post', '--dir', s.posix(dummy.out), '--root', s.posix(root), '--signing', 'unsigned', '--mode', 'confirm']);
        expect(r.out).toMatch(/dummy/i);
    });
});

// ---- UT-389 NSC ----
describe('UT-389 aapt2 dump xmltree の実出力（A: cleartextTrafficPermitted=false は Raw なし／A: src="user" (Raw: "user")）', () => {
    it('extract が nsc.txt に実書式を保存し、ag6 post が forbid・keep で合格', () => {
        const {r, out} = extractReal();
        expect(r.rc).toBe(0);
        expect(rd(out, 'nsc.txt')).toContain('A: cleartextTrafficPermitted=false');
        expect(rd(out, 'nsc.txt')).toContain('A: src="user" (Raw: "user")');
        const d = s.extractDir({nscTxt: NSC_REAL});
        expect(s.guard(['ag6', '--phase', 'post', '--dir', s.posix(d), '--cleartext', 'forbid', '--user-ca', 'keep']).rc).toBe(0);
    });
    it('true は forbid で違反／allow で合格。user 証明書は keep で合格・forbid で違反', () => {
        const t = s.extractDir({cleartext: 'true', nscTxt: NSC_REAL.replace('cleartextTrafficPermitted=false', 'cleartextTrafficPermitted=true')});
        expect(s.guard(['ag6', '--phase', 'post', '--dir', s.posix(t), '--cleartext', 'forbid']).rc).toBe(1);
        expect(s.guard(['ag6', '--phase', 'post', '--dir', s.posix(t), '--cleartext', 'allow']).rc).toBe(0);
        const d = s.extractDir({nscTxt: NSC_REAL});
        expect(s.guard(['ag6', '--phase', 'post', '--dir', s.posix(d), '--cleartext', 'forbid', '--user-ca', 'forbid']).rc).toBe(1);
    });
});

// ---- UT-390 許可リスト (b) ----
const B6 = ['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT', 'android.permission.WAKE_LOCK', 'com.google.android.c2dm.permission.RECEIVE', '{APPLICATION_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION', 'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE'];
function ag1Merged(allowB: string[], manifestPerms: any[], dropA: string[] = []) {
    const d = s.tmp('k79-b6-');
    const a = s.A18.filter(([n]: any) => !dropA.includes(n)).map(([n, m]: any) => `A ${n.includes('.') ? n : 'android.permission.' + n}${m ? ` maxSdk=${m}` : ''}`);
    const al = s.write(d, 'allow.txt', s.allowlistTxt({a, b: allowB.map((n) => 'B ' + n)}));
    const man = s.write(d, 'm.xml', s.manifestXml({perms: manifestPerms}));
    return s.guard(['ag1', '--kind', 'merged', '--manifest', s.posix(man), '--allowlist', s.posix(al)]);
}
const MANIFEST_B6 = B6.map((n) => [n.replace('{APPLICATION_ID}', 'com.metarchitect.Weaver')]);
describe('UT-390 許可リスト(b)＝実測の6件（合成の許可リストで常時）', () => {
    it('(a)18＋(b)6＝24件の宣言で合格', () => {
        const r = ag1Merged(B6, [...s.A18, ...MANIFEST_B6]);
        expect(r.rc).toBe(0);
    });
    it('B切替後（ACCESS_FINE_LOCATION を除く）23件＝(a)17＋(b)6 で合格（6件目は BIND_GET_INSTALL_REFERRER_SERVICE）', () => {
        const a17 = s.A18.filter(([n]: any) => n !== 'ACCESS_FINE_LOCATION');
        const r = ag1Merged(B6, [...a17, ...MANIFEST_B6], ['ACCESS_FINE_LOCATION']);
        expect(r.rc).toBe(0);
        expect(B6[5]).toContain('BIND_GET_INSTALL_REFERRER_SERVICE');
    });
    it('(b)が5件（6件目が許可リストに無い）→違反。許可リストに無い権限を名指しで出す', () => {
        const r = ag1Merged(B6.slice(0, 5), [...s.A18, ...MANIFEST_B6]);
        expect(r.rc).toBe(1);
        expect(r.out).toContain('BIND_GET_INSTALL_REFERRER_SERVICE');
    });
    it('マージ後に7件目（(b)に無い権限 READ_CONTACTS）→違反。マージ後に(b)の6件目が欠ける→違反', () => {
        const over = ag1Merged(B6, [...s.A18, ...MANIFEST_B6, ['READ_CONTACTS']]);
        expect(over.rc).toBe(1);
        expect(over.out).toContain('READ_CONTACTS');
        const lack = ag1Merged(B6, [...s.A18, ...MANIFEST_B6.slice(0, 5)]);
        expect(lack.rc).toBe(1);
        expect(lack.out).toContain('BIND_GET_INSTALL_REFERRER_SERVICE');
    });
});
describe('UT-390（現データ）実ファイルの許可リスト(b)は S3 でちょうど6件', () => {
    itS3('B-PENDING が0件で B の行がちょうど6件（名前は上の6つ）。実ファイルで 24件の宣言が合格、17件版（FINE_LOCATION 除去）の23件も合格', () => {
        const rows = s.read(s.ALLOWLIST_REL).split('\n').filter((l: string) => /^B /.test(l)).map((l: string) => l.split(/\s+/)[1]).sort();
        expect(s.read(s.ALLOWLIST_REL)).not.toContain('B-PENDING');
        expect(rows).toEqual([...B6].sort());
        const real = (perms: any[], al: string) => {
            const d = s.tmp('k79-realal-');
            const man = s.write(d, 'm.xml', s.manifestXml({perms}));
            return s.guard(['ag1', '--kind', 'merged', '--manifest', s.posix(man), '--allowlist', al]);
        };
        expect(real([...s.A18, ...MANIFEST_B6], s.posix(s.abs(s.ALLOWLIST_REL))).rc).toBe(0);
        const d17 = s.tmp();
        const al17 = s.write(d17, 'al.txt', s.read(s.ALLOWLIST_REL).split('\n').filter((l: string) => !/ACCESS_FINE_LOCATION/.test(l)).join('\n'));
        expect(real([...s.A18.filter(([n]: any) => n !== 'ACCESS_FINE_LOCATION'), ...MANIFEST_B6], s.posix(al17)).rc).toBe(0);
    });
});

// ---- UT-391 基準値 ----
const jestOk = (passed: number, pending: number) => ({success: true, numFailedTests: 0, numFailedTestSuites: 0, numPassedTests: passed, numPendingTests: pending});
function blRun(tsc: number, passed: number, pending: number, base = {tsc_errors: 10, jest_passed: 852, jest_pending: 12}) {
    const d = s.tmp('k79-bl-');
    const log = Array.from({length: tsc}, (_, i) => `src/f${i}.ts(1,1): error TS2322: x`).join('\n') + '\n';
    return s.guard(['baseline', '--tsc-log', s.posix(s.write(d, 't.log', log)), '--tsc-exit', tsc ? '2' : '0', '--jest-json', s.posix(s.write(d, 'j.json', JSON.stringify(jestOk(passed, pending)))), '--baseline', s.posix(s.write(d, 'b.json', JSON.stringify(base)))]);
}
describe('UT-391 基準値（CI実測 tsc 10・passed 852・pending 12 を基準にした境界。V5の比較規則 §5.8.2③）', () => {
    it('基準と同じ＝合格／tsc_errors＋1＝違反／jest_passed−1＝違反／jest_pending＋1＝違反／tsc_errors−1＝警告つきで合格／passed＋1・pending−1＝合格', () => {
        expect(blRun(10, 852, 12).rc).toBe(0);
        expect(blRun(11, 852, 12).rc).toBe(1);
        expect(blRun(10, 851, 12).rc).toBe(1);
        expect(blRun(10, 852, 13).rc).toBe(1);
        const less = blRun(9, 852, 12);
        expect(less.rc).toBe(0);
        expect(s.warnLines(less, 'baseline').length).toBeGreaterThanOrEqual(1);
        expect(blRun(10, 853, 12).rc).toBe(0);
        expect(blRun(10, 852, 11).rc).toBe(0);
    });
});
describe('UT-391（現データ）S3 の基準値ファイル', () => {
    itS3('PENDING が0件・tsc_errors≧0・jest_passed≧1・jest_pending≧0 の整数（測定 artifact との一致は CI のランで確認＝ST）', () => {
        const j = JSON.parse(s.readBuf(s.BASELINE_REL).toString('utf8'));
        expect(Object.keys(j).sort()).toEqual(['jest_passed', 'jest_pending', 'tsc_errors']);
        expect(Number.isInteger(j.tsc_errors) && j.tsc_errors >= 0).toBe(true);
        expect(Number.isInteger(j.jest_passed) && j.jest_passed >= 1).toBe(true);
        expect(Number.isInteger(j.jest_pending) && j.jest_pending >= 0).toBe(true);
    });
});

// ---- UT-392 他の出力パース ----
describe('UT-392 aapt2・dexdump・zipalign・keytool の実測書式', () => {
    it('dexdump: Class descriptor の行からドット区切りの名前（$ を含む内部クラスも）。Class # や Access flags の行は混ざらない', () => {
        const {r, out} = extractReal();
        expect(r.rc).toBe(0);
        const rows = rd(out, 'dex-classes.txt').split('\n').filter(Boolean);
        expect(rows).toContain('com.mattermost.rnbeta.MainActivity');
        expect(rows).toContain('com.mattermost.rnbeta.MainApplication$Companion');
        expect(rows.some((x: string) => /Class #|Access|Superclass|^L|;/.test(x))).toBe(false);
    });
    it('unzip -l: abis.txt は base/lib/ 配下の ABI 名3つ（Archive 行・合計行は混ざらない）', () => {
        const {out} = extractReal();
        expect(rd(out, 'abis.txt').split('\n').filter(Boolean).sort()).toEqual(['arm64-v8a', 'armeabi-v7a', 'x86_64']);
    });
    it('keytool: 署名なし（Not a signed jar file・rc=1）でも unsigned は rc=0 で cert.txt を保存、signed は rc=1。署名あり（Signer #1 付き）の cert.txt から summary が64桁の cert_sha256 を作る', () => {
        const u = extractReal({signing: 'unsigned', keytoolRc: 1, keytoolOut: KEYTOOL_UNSIGNED});
        expect(u.r.rc).toBe(0);
        expect(rd(u.out, 'cert.txt')).toContain('Not a signed jar file');
        expect(extractReal({signing: 'signed', keytoolRc: 1, keytoolOut: KEYTOOL_UNSIGNED}).r.rc).toBe(1);
        const sg = extractReal({signing: 'signed'});
        expect(sg.r.rc).toBe(0);
        const d = s.tmp('k79-sum-');
        const facts = s.write(d, 'facts.txt', 'version=2.45.0\nversionCode=1001\nrun=1\n');
        const sum = s.aab(['summary', '--facts', s.posix(facts), '--cert', s.posix(path.join(sg.out, 'cert.txt')), '--signing', 'signed', '--kind', 'confirm', '--run', '1', '--expect-version', '2.45.0', '--expect-version-code', '1001', '--out', s.posix(path.join(d, 'sum.txt'))]);
        expect(sum.rc).toBe(0);
        expect(sum.out).toMatch(/^cert_sha256: [0-9A-F]{64}$/m);
    });
    it('AG3 post: 実書式の署名なし cert.txt（Not a signed jar file）は --signing unsigned で合格、署名ありの cert.txt（Signer #1 付き）は登録値一致で合格・unsigned では違反', () => {
        const d = s.tmp('k79-cert-');
        const un = s.posix(s.write(d, 'u.txt', KEYTOOL_UNSIGNED));
        const sg = s.posix(s.write(d, 's.txt', KEYTOOL_SIGNED));
        expect(s.guard(['ag3', '--phase', 'post', '--signing', 'unsigned', '--cert-file', un]).rc).toBe(0);
        expect(s.guard(['ag3', '--phase', 'post', '--signing', 'signed', '--cert-file', sg, '--expected-sha256', s.SHA_OK_PLAIN]).rc).toBe(0);
        expect(s.guard(['ag3', '--phase', 'post', '--signing', 'unsigned', '--cert-file', sg]).rc).toBe(1);
    });
    it('zipalign の実出力（Verifying alignment … Verification successful／FAILED）: 16k 検査は zipalign の終了コードで判定し、出力の文言には依存しない', () => {
        const st = s.makeStubs(['llvm-objdump', 'zipalign']);
        const w = s.tmp('k79-za-');
        const apkDir = path.join(w, 'x');
        for (const rel of ['lib/arm64-v8a/liba.so', 'lib/x86_64/libb.so']) {
            s.write(apkDir, rel, 'ELF');
        }
        const obj = s.write(w, 'o.txt', '\nProgram Header:\n    LOAD off    0x0 vaddr 0x0 paddr 0x0 align 2**14\n');
        const rules = s.write(w, 'r.rules', `.so|||0|||${s.posix(obj)}\n`);
        const apk = path.join(w, 'in.apk');
        fs.writeFileSync(apk, s.zipBuf({'lib/arm64-v8a/liba.so': 'ELF', 'lib/x86_64/libb.so': 'ELF'}));
        const env = {STUB_LLVM_OBJDUMP_RULES: s.posix(rules), WEAVER_OBJDUMP: s.posix(path.join(st.dir, 'llvm-objdump')), WEAVER_ZIPALIGN: s.posix(path.join(st.dir, 'zipalign'))};
        const ok = s.k16([s.posix(apk)], {stubDir: st.dir, env: {...env, STUB_ZIPALIGN_OUT: 'Verifying alignment of in.apk (16)...\n      50 AndroidManifest.xml (OK - compressed)\nVerification successful', STUB_ZIPALIGN_RC: '0'}});
        expect(ok.rc).toBe(0);
        const ng = s.k16([s.posix(apk)], {stubDir: st.dir, env: {...env, STUB_ZIPALIGN_OUT: 'Verifying alignment of in.apk (16)...\n      50 AndroidManifest.xml (BAD - 8)\nVerification FAILED', STUB_ZIPALIGN_RC: '1'}});
        expect(ng.rc).toBe(1);
    });
});
