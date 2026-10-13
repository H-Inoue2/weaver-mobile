// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG1 権限（UT-025〜047・325〜327・333）。詳細設計 §5.3.1・§5.8.1・§6.1
// 許可リストが正（ガードは件数・権限名を持たない）。期待は単体テスト設計書の各行から導いた。

export {};

const s = require('./android_test_support.cjs');

jest.setTimeout(180000);
afterAll(() => s.cleanup());

// 単体テスト用の小さな許可リスト（設計書 §2 の FAL）: A＝INTERNET・CAMERA・WRITE_EXTERNAL_STORAGE(maxSdk=32)・BLUETOOTH(maxSdk=30)
const FAL_A = ['A android.permission.INTERNET', 'A android.permission.CAMERA', 'A android.permission.WRITE_EXTERNAL_STORAGE maxSdk=32', 'A android.permission.BLUETOOTH maxSdk=30'];
const FAL_B = ['B android.permission.WAKE_LOCK', 'B {APPLICATION_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'];
const FAL_C = ['C android.permission.FOREGROUND_SERVICE_MICROPHONE'];
const fal = (o: {a?: string[]; b?: string[]; c?: string[]; eol?: string} = {}) => s.allowlistTxt({a: o.a || FAL_A, b: o.b || FAL_B, c: o.c || FAL_C, eol: o.eol});
const A4 = [['INTERNET'], ['CAMERA'], ['WRITE_EXTERNAL_STORAGE', 32], ['BLUETOOTH', 30]];

function ag1(manifest: string, allowlist: string | null, o: {kind?: string; extra?: string[]; omitKind?: boolean} = {}) {
    const root = s.tmp();
    const m = s.write(root, 'AndroidManifest.xml', manifest);
    const args = ['ag1'];
    if (!o.omitKind) {
        args.push('--kind', o.kind || 'source');
    }
    args.push('--manifest', s.posix(m));
    if (allowlist !== null) {
        const a = s.write(root, 'allow.txt', allowlist);
        args.push('--allowlist', s.posix(a));
    } else {
        args.push('--allowlist', s.posix(root + '/no-such-allowlist.txt'));
    }
    args.push(...(o.extra || []));
    return s.guard(args);
}
const man = (perms: unknown[], o: Record<string, unknown> = {}) => s.manifestXml({perms, ...o});

describe('AG1 source（詳細設計 §5.3.1）', () => {
    it('UT-025 宣言＝（a）ちょうど: rc=0・ANDROID GUARD AG1 PASSED (source)', () => {
        const r = ag1(man(A4), fal());
        expect(r.rc).toBe(0);
        expect(r.out).toContain('ANDROID GUARD AG1 PASSED (source)');
    });

    it('UT-026 （a）に無い READ_CONTACTS を足す: rc=1・FAIL: AG1: 行に READ_CONTACTS・他の違反行0件', () => {
        const r = ag1(man([...A4, ['READ_CONTACTS']]), fal());
        expect(r.rc).toBe(1);
        const f = s.failLines(r, 'AG1');
        expect(f).toHaveLength(1);
        expect(f[0]).toContain('READ_CONTACTS');
    });

    it('UT-027 （a）の CAMERA を欠く: rc=1・出力に CAMERA（欠落側も違反。完全一致）', () => {
        const r = ag1(man(A4.filter((p) => p[0] !== 'CAMERA')), fal());
        expect(r.rc).toBe(1);
        expect(r.out).toContain('CAMERA');
    });

    it('UT-028 （c）の FOREGROUND_SERVICE_MICROPHONE を宣言: FAIL 行がちょうど1行（二重計上しない）・FAILED (1 violation(s))', () => {
        const r = ag1(man([...A4, ['FOREGROUND_SERVICE_MICROPHONE']]), fal());
        expect(r.rc).toBe(1);
        const f = s.failLines(r);
        expect(f).toHaveLength(1);
        expect(f[0]).toContain('FOREGROUND_SERVICE_MICROPHONE');
        expect(r.out).toContain('ANDROID GUARD AG1 FAILED (1 violation(s))');
    });

    it('UT-029 FOREGROUND_SERVICE_MICROPHONE に tools:node="remove"（他は（a）どおり）: rc=0（宣言していない扱い）', () => {
        const r = ag1(man(A4, {removedPerms: ['FOREGROUND_SERVICE_MICROPHONE']}), fal());
        expect(r.rc).toBe(0);
    });

    it('UT-030 （a）の CAMERA に tools:node="remove": rc=1（宣言していない扱いのため欠落）・出力に CAMERA', () => {
        const r = ag1(man(A4.filter((p) => p[0] !== 'CAMERA'), {removedPerms: ['CAMERA']}), fal());
        expect(r.rc).toBe(1);
        expect(r.out).toContain('CAMERA');
    });

    it('UT-031 属性の順序違い・tools:ignore・宣言が複数行にまたがる形: rc=0', () => {
        const xml = [
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
            '    <uses-permission android:maxSdkVersion="32" android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:ignore="ScopedStorage" />',
            '    <uses-permission',
            '        android:name="android.permission.BLUETOOTH"',
            '        android:maxSdkVersion="30" />',
            '    <uses-permission android:name="android.permission.INTERNET" />',
            '    <uses-permission android:name="android.permission.CAMERA" />',
            '    <application android:name=".MainApplication" />',
            '</manifest>',
            '',
        ].join('\n');
        expect(ag1(xml, fal()).rc).toBe(0);
    });

    it('UT-032 WRITE_EXTERNAL_STORAGE の maxSdkVersion: "33"・属性なしは rc=1、"32" は rc=0', () => {
        const mk = (max: number | undefined) => man([['INTERNET'], ['CAMERA'], max === undefined ? ['WRITE_EXTERNAL_STORAGE'] : ['WRITE_EXTERNAL_STORAGE', max], ['BLUETOOTH', 30]]);
        expect(ag1(mk(33), fal()).rc).toBe(1);
        expect(ag1(mk(undefined), fal()).rc).toBe(1);
        expect(ag1(mk(32), fal()).rc).toBe(0);
    });

    it('UT-033 BLUETOOTH の maxSdkVersion が "31": rc=1・出力に BLUETOOTH（maxSdk=30 と不一致）', () => {
        const r = ag1(man([['INTERNET'], ['CAMERA'], ['WRITE_EXTERNAL_STORAGE', 32], ['BLUETOOTH', 31]]), fal());
        expect(r.rc).toBe(1);
        expect(r.out).toContain('BLUETOOTH');
    });

    it('UT-034 uses-permission-sdk-23 で WRITE_EXTERNAL_STORAGE(maxSdk 32) を宣言: rc=0（宣言として数える）', () => {
        const xml = man([['INTERNET'], ['CAMERA'], ['BLUETOOTH', 30]], {rawTop: ['    <uses-permission-sdk-23 android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />']});
        expect(ag1(xml, fal()).rc).toBe(0);
    });

    it('UT-035 XMLコメント内の宣言（READ_CONTACTS）: rc=0（コメントは宣言ではない。§5.1 がコメントを除去してから解析）', () => {
        const xml = man(A4, {rawTop: ['    <!-- <uses-permission android:name="android.permission.READ_CONTACTS"/> -->', '    <!--', '      <uses-permission android:name="android.permission.READ_SMS"/>', '    -->']});
        const r = ag1(xml, fal());
        expect(r.rc).toBe(0);
        expect(r.out).toContain('PASSED');
    });

    it('UT-036 許可リストが存在しない／0バイト／コメントと空行だけ／（b）（c）だけ: 4通りとも rc=1（fail-closed）・許可リストのパス', () => {
        const cases: Array<[string, string | null]> = [
            ['no-file', null], ['zero', ''], ['comments', '# only comments\n\n# x\n'], ['no-a', fal({a: []})],
        ];
        for (const [label, txt] of cases) {
            const r = ag1(man(A4), txt);
            expect([label, r.rc]).toEqual([label, 1]);
            expect(r.out).toMatch(/allow/i);
        }
    });

    it('UT-037 許可リストに不明な区分 X の行: rc=1（解析不能は違反）', () => {
        expect(ag1(man(A4), fal() + 'X android.permission.FOO\n').rc).toBe(1);
    });

    it('UT-038 許可リストを CRLF・行頭空白・行末コメント付きで書く: rc=0（CR除去・# 以降無視・空行無視）', () => {
        const txt = fal({a: FAL_A.map((l, i) => (i === 0 ? '   ' + l + '   # 説明' : l + ' # 説明')), eol: '\r\n'}).replace(/\r\n/g, '\r\n\r\n');
        expect(ag1(man(A4), txt).rc).toBe(0);
    });

    it('UT-039 {APPLICATION_ID} の置換: 既定の application-id なら rc=0、--application-id com.example.X では rc=1', () => {
        const merged = man([...A4, ['WAKE_LOCK'], ['com.metarchitect.Weaver.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']]);
        expect(ag1(merged, fal(), {kind: 'merged'}).rc).toBe(0);
        expect(ag1(merged, fal(), {kind: 'merged', extra: ['--application-id', 'com.example.X']}).rc).toBe(1);
    });
});

describe('AG1 merged（詳細設計 §5.3.1 ④⑤⑥）', () => {
    const MERGED_OK = [...A4, ['WAKE_LOCK'], ['com.metarchitect.Weaver.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']];

    it('UT-040 宣言＝（a）∪（b）ちょうど・maxSdk が保たれる: rc=0・PASSED (merged)', () => {
        const r = ag1(man(MERGED_OK), fal(), {kind: 'merged'});
        expect(r.rc).toBe(0);
        expect(r.out).toContain('ANDROID GUARD AG1 PASSED (merged)');
    });

    it('UT-041 merged の4通り（WAKE_LOCK 欠落／INTERNET 欠落／超過／WRITE_EXTERNAL の maxSdk 消失）: rc=1・対応する名前が出力に出る', () => {
        const without = (name: string) => MERGED_OK.filter((p) => p[0] !== name);
        const cases: Array<[unknown[], string]> = [
            [without('WAKE_LOCK'), 'WAKE_LOCK'],
            [without('INTERNET'), 'INTERNET'],
            [[...MERGED_OK, ['READ_SMS']], 'READ_SMS'],
            [MERGED_OK.map((p) => (p[0] === 'WRITE_EXTERNAL_STORAGE' ? ['WRITE_EXTERNAL_STORAGE'] : p)), 'WRITE_EXTERNAL_STORAGE'],
        ];
        for (const [perms, name] of cases) {
            const r = ag1(man(perms), fal(), {kind: 'merged'});
            expect([name, r.rc]).toEqual([name, 1]);
            expect(r.out).toContain(name);
        }
    });

    it('UT-042 （b）が B-PENDING・マージ後に（a）に無い USE_BIOMETRIC: --allow-pending なしは rc=1、ありは rc=0。どちらも NOTE: candidate (b) permission', () => {
        const pending = fal({b: ['B-PENDING']});
        const merged = man([...A4, ['USE_BIOMETRIC']]);
        const no = ag1(merged, pending, {kind: 'merged'});
        const yes = ag1(merged, pending, {kind: 'merged', extra: ['--allow-pending']});
        expect(no.rc).toBe(1);
        expect(yes.rc).toBe(0);
        for (const r of [no, yes]) {
            expect(r.out).toContain('NOTE: AG1: candidate (b) permission: android.permission.USE_BIOMETRIC');
        }
    });

    it('UT-043 PENDING でも（c）禁止の宣言・（a）の欠落は見逃さない: 2通りとも rc=1', () => {
        const pending = fal({b: ['B-PENDING']});
        const withC = ag1(man([...A4, ['FOREGROUND_SERVICE_MICROPHONE']]), pending, {kind: 'merged', extra: ['--allow-pending']});
        const noCam = ag1(man(A4.filter((p) => p[0] !== 'CAMERA')), pending, {kind: 'merged', extra: ['--allow-pending']});
        expect(withC.rc).toBe(1);
        expect(noCam.rc).toBe(1);
    });

    it('UT-044 foregroundServiceType: dataSync のみ rc=0。microphone と複合（dataSync|microphone）は rc=1・サービス名と種別が出力に出る', () => {
        const mk = (type: string) => man(MERGED_OK, {serviceType: type});
        expect(ag1(mk('dataSync'), fal(), {kind: 'merged'}).rc).toBe(0);
        for (const t of ['microphone', 'dataSync|microphone']) {
            const r = ag1(mk(t), fal(), {kind: 'merged'});
            expect([t, r.rc]).toEqual([t, 1]);
            expect(r.out).toContain('NotificationDismissService');
            expect(r.out).toContain('microphone');
        }
    });

    it('UT-045 mediaProjection・specialUse のサービスは rc=1。foregroundServiceType の無いサービスは rc=0（検査対象外）', () => {
        for (const t of ['mediaProjection', 'specialUse']) {
            expect([t, ag1(man(MERGED_OK, {serviceType: t}), fal(), {kind: 'merged'}).rc]).toEqual([t, 1]);
        }
        expect(ag1(man(MERGED_OK), fal(), {kind: 'merged'}).rc).toBe(0);
    });

    it('UT-046 --kind が foo／省略: どちらも rc=2（使い方の誤り）', () => {
        expect(ag1(man(A4), fal(), {kind: 'foo'}).rc).toBe(2);
        expect(ag1(man(A4), fal(), {omitKind: true}).rc).toBe(2);
    });

    it('UT-047【基】作成予定の許可リスト（実ファイル）×基点コミットのマニフェスト: rc=1・FAIL 行はちょうど1行で FOREGROUND_SERVICE_MICROPHONE だけ', () => {
        expect(s.exists(s.ALLOWLIST_REL)).toBe(true);
        const root = s.tmp();
        const m = s.write(root, 'AndroidManifest.xml', s.gitShow(s.BASE_SHA, 'android/app/src/main/AndroidManifest.xml'));
        const r = s.guard(['ag1', '--kind', 'source', '--manifest', s.posix(m), '--allowlist', s.posix(s.abs(s.ALLOWLIST_REL))]);
        expect(r.rc).toBe(1);
        const f = s.failLines(r);
        expect(f).toHaveLength(1);
        expect(f[0]).toContain('FOREGROUND_SERVICE_MICROPHONE');
    });
});

describe('B切替（精密位置 ACCESS_FINE_LOCATION だけを外す。詳細設計 §6.1・基本設計 §4.5.5）', () => {
    const A_LOC = [...FAL_A, 'A android.permission.ACCESS_FINE_LOCATION', 'A android.permission.ACCESS_WIFI_STATE', 'A android.permission.RECORD_AUDIO', 'A android.permission.BLUETOOTH_CONNECT'];
    const A_NOLOC = A_LOC.filter((l) => !l.includes('ACCESS_FINE_LOCATION'));
    const P_LOC = [...A4, ['ACCESS_FINE_LOCATION'], ['ACCESS_WIFI_STATE'], ['RECORD_AUDIO'], ['BLUETOOTH_CONNECT']];
    const P_NOLOC = P_LOC.filter((p) => p[0] !== 'ACCESS_FINE_LOCATION');

    it('UT-325 17件版: リストから ACCESS_FINE_LOCATION の1行だけを削除・宣言も削除 → rc=0。差分は削除1行・追加0行（区分Cへ移さない）', () => {
        const before = fal({a: A_LOC});
        const after = fal({a: A_NOLOC});
        const r = ag1(man(P_NOLOC), after);
        expect(r.rc).toBe(0);
        const bl = before.split('\n');
        const al = after.split('\n');
        const removed = bl.filter((l: string) => !al.includes(l));
        const added = al.filter((l: string) => !bl.includes(l));
        expect(removed).toEqual(['A android.permission.ACCESS_FINE_LOCATION']);
        expect(added).toHaveLength(0);
        expect(al.filter((l: string) => l.startsWith('A ')).length).toBe(bl.filter((l: string) => l.startsWith('A ')).length - 1);
        expect(after).not.toMatch(/^C .*ACCESS_FINE_LOCATION/m);
        expect(after).not.toContain('ACCESS_COARSE_LOCATION');
    });

    it('UT-326 途中状態・巻き込み: ①リスト17件・宣言が残る ②リスト18件・宣言を削除 ③リスト17件・ACCESS_COARSE_LOCATION を宣言 → 3通りとも rc=1', () => {
        const r1 = ag1(man(P_LOC), fal({a: A_NOLOC}));
        const r2 = ag1(man(P_NOLOC), fal({a: A_LOC}));
        const r3 = ag1(man([...P_NOLOC, ['ACCESS_COARSE_LOCATION']]), fal({a: A_NOLOC}));
        expect([r1.rc, r2.rc, r3.rc]).toEqual([1, 1, 1]);
        expect(r1.out).toContain('ACCESS_FINE_LOCATION');
        expect(r2.out).toContain('ACCESS_FINE_LOCATION');
        expect(r3.out).toContain('ACCESS_COARSE_LOCATION');
    });

    it('UT-327 ライブラリが ACCESS_FINE_LOCATION を足す場合: ①source に tools:node="remove" 付き（17件）→rc=0 ②merged に無い→rc=0 ③merged に残る→rc=1', () => {
        const list = fal({a: A_NOLOC});
        const r1 = ag1(man(P_NOLOC, {removedPerms: ['ACCESS_FINE_LOCATION']}), list);
        const base = [...P_NOLOC, ['WAKE_LOCK'], ['com.metarchitect.Weaver.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']];
        const r2 = ag1(man(base), list, {kind: 'merged'});
        const r3 = ag1(man([...base, ['ACCESS_FINE_LOCATION']]), list, {kind: 'merged'});
        expect(r1.rc).toBe(0);
        expect(r2.rc).toBe(0);
        expect(r3.rc).toBe(1);
        expect(r3.out).toContain('ACCESS_FINE_LOCATION');
    });
});

describe('post が ag1 へ --allow-pending を渡す条件（詳細設計 §5.2・D-K79R0-24）', () => {
    it('UT-333 （b）B-PENDING＋マージ後に USE_BIOMETRIC: post --signing unsigned は rc=0＋NOTE、--signing signed は rc=1（--allow-pending を渡さない）', () => {
        const pendingAllow = s.allowlistTxt({b: ['B-PENDING']});
        const manifestWithBio = s.manifestXml({perms: [...s.A18, ['USE_BIOMETRIC']], pkg: 'com.metarchitect.Weaver'}).replace('<manifest ', '<manifest ').replace(/(<manifest[^>]*>)/, '$1\n    <uses-sdk android:minSdkVersion="30" android:targetSdkVersion="36" />');
        const mk = (signed: boolean) => {
            const d = s.extractDir({manifestXml: manifestWithBio, signed, certTxt: signed ? s.certTxt() : s.certTxt({unsigned: true})});
            const al = s.write(d, 'allow.txt', pendingAllow);
            return {d, al};
        };
        const u = mk(false);
        const ru = s.guard(['post', '--dir', s.posix(u.d), '--mode', 'confirm', '--signing', 'unsigned', '--run-number', '1', '--app-version', '2.45.0', '--allowlist', s.posix(u.al), '--cleartext', 'forbid']);
        expect(ru.out).toContain('NOTE: AG1: candidate (b) permission: android.permission.USE_BIOMETRIC');
        expect(ru.rc).toBe(0);
        const g = mk(true);
        const rs = s.guard(['post', '--dir', s.posix(g.d), '--mode', 'confirm', '--signing', 'signed', '--run-number', '1', '--app-version', '2.45.0', '--allowlist', s.posix(g.al), '--expected-sha256', s.SHA_OK_PLAIN, '--cleartext', 'forbid']);
        expect(rs.rc).toBe(1);
        expect(s.failLines(rs, 'AG1').length).toBeGreaterThanOrEqual(1);
    });
});
