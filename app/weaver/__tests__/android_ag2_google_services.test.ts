// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG2 google-services.json（UT-048〜065・342・354）。詳細設計 §5.3.2・§3.4・§4.5
// 目印 .github/android_firebase_real の有無×DUMMY の有無×署名モードの表（切替規則）を1つずつ確かめる。
// 実キー形式の値はテスト用の偽の値（秘密ではない）。resources.txt の書式は測定ラン（§12.4の44）で確定するまで暫定。

export {};

const s = require('./android_test_support.cjs');

jest.setTimeout(180000);
afterAll(() => s.cleanup());

const FPID = s.REAL.projectId;

function ag2(json: string | null, o: {mark?: boolean | 'dir' | string; mode?: string; signing?: string; fpid?: string | null; env?: Record<string, string>; raw?: string} = {}) {
    const root = s.tmp();
    if (json !== null) {
        s.write(root, 'android/app/google-services.json', o.raw !== undefined ? o.raw : json);
    }
    if (o.mark === true) {
        s.write(root, '.github/android_firebase_real', '');
    } else if (typeof o.mark === 'string' && o.mark !== 'dir') {
        s.write(root, '.github/android_firebase_real', o.mark);
    } else if (o.mark === 'dir') {
        s.write(root, '.github/android_firebase_real/inner.txt', 'x');
    } else {
        s.write(root, '.github/placeholder', '');
    }
    const args = ['ag2', '--root', s.posix(root), '--mode', o.mode || 'confirm', '--signing', o.signing || 'unsigned', '--google-services', s.posix(root + '/android/app/google-services.json')];
    if (o.fpid !== null) {
        args.push('--firebase-project-id', o.fpid === undefined ? FPID : o.fpid);
    }
    return s.guard(args, {env: o.env});
}
const dummyJson = () => s.googleServices();
const realJson = (over: Record<string, unknown> = {}) => s.googleServices({...s.REAL, ...over});

describe('AG2 google-services.json（pre）', () => {
    it('UT-048 目印なし・ダミー（DUMMY）・confirm×unsigned: rc=0・WARN: AG2: dummy google-services.json (unsigned verification only) がちょうど1行', () => {
        const r = ag2(dummyJson());
        expect(r.rc).toBe(0);
        expect(r.out.split('\n').filter((l: string) => l === 'WARN: AG2: dummy google-services.json (unsigned verification only)')).toHaveLength(1);
    });

    it('UT-049 目印なし・ダミー・submission×unsigned: rc=1（提出用は署名なしでもダミーを許さない）', () => {
        const r = ag2(dummyJson(), {mode: 'submission'});
        expect(r.rc).toBe(1);
        expect(s.failLines(r, 'AG2').length).toBeGreaterThanOrEqual(1);
    });

    it('UT-050 目印なし・ダミー・--signing signed: rc=1（§4.5表の（なし・あり）で signed は違反）', () => {
        expect(ag2(dummyJson(), {signing: 'signed'}).rc).toBe(1);
    });

    it('UT-051 目印あり・ダミーのまま（confirm／submission）: 2通りとも rc=1・メッセージに DUMMY', () => {
        for (const mode of ['confirm', 'submission']) {
            const r = ag2(dummyJson(), {mark: true, mode});
            expect([mode, r.rc]).toEqual([mode, 1]);
            expect(r.out).toContain('DUMMY');
        }
    });

    it('UT-052 目印なし・DUMMY を含まない実キー形式（目印の付け忘れ）: rc=1（切替漏れ。署名なし・確認用でも通さない）', () => {
        expect(ag2(realJson()).rc).toBe(1);
    });

    it('UT-053 目印あり・実キー・--firebase-project-id が project_id と一致: rc=0・WARN 行0件', () => {
        const r = ag2(realJson(), {mark: true});
        expect(r.rc).toBe(0);
        expect(s.warnLines(r)).toHaveLength(0);
        expect(r.out).toContain('ANDROID GUARD AG2 PASSED');
    });

    it('UT-054 実キーで --firebase-project-id が空・省略: 2通りとも rc=1（登録値が空なら違反）', () => {
        expect(ag2(realJson(), {mark: true, fpid: ''}).rc).toBe(1);
        expect(ag2(realJson(), {mark: true, fpid: null, env: {WEAVER_FIREBASE_PROJECT_ID: ''}}).rc).toBe(1);
    });

    it('UT-055 project_id が --firebase-project-id と1文字違い／大文字小文字違い: 2通りとも rc=1（完全一致）', () => {
        expect(ag2(realJson(), {mark: true, fpid: 'weaver-test-pro'}).rc).toBe(1);
        expect(ag2(realJson(), {mark: true, fpid: 'Weaver-Test-Proj'}).rc).toBe(1);
    });

    it('UT-056 実キーの project_id が Mattermost 社（api-7231322553409637977-752355）で、同じ値を渡しても rc=1', () => {
        const mm = 'api-7231322553409637977-752355';
        expect(ag2(realJson({projectId: mm}), {mark: true, fpid: mm}).rc).toBe(1);
    });

    it('UT-057 実キーで project_id・mobilesdk_app_id・current_key のどれか1つを空に: 3通りとも rc=1・空にした項目名が出力に出る', () => {
        const cases: Array<[Record<string, unknown>, string]> = [
            [{projectId: ''}, 'project_id'], [{appId: ''}, 'mobilesdk_app_id'], [{key: ''}, 'current_key'],
        ];
        for (const [over, name] of cases) {
            const r = ag2(realJson(over), {mark: true, fpid: over.projectId === '' ? '' : FPID});
            expect([name, r.rc]).toEqual([name, 1]);
            expect(r.out).toContain(name);
        }
    });

    it('UT-058 Weaver 1件＋com.mattermost.rn 1件: 全モード・全署名の4通りとも rc=1・出力に com.mattermost', () => {
        const two = (gs: Record<string, unknown>) => {
            const base = JSON.parse(gs.base as string);
            base.client.push({client_info: {mobilesdk_app_id: '1:1:android:x', android_client_info: {package_name: 'com.mattermost.rn'}}, api_key: [{current_key: 'k'}]});
            return JSON.stringify(base);
        };
        const combos: Array<[string, string, boolean, string]> = [
            ['confirm', 'unsigned', false, dummyJson()], ['submission', 'unsigned', false, dummyJson()],
            ['confirm', 'signed', true, realJson()], ['submission', 'signed', true, realJson()],
        ];
        for (const [mode, signing, mark, json] of combos) {
            const r = ag2(two({base: json}), {mode, signing, mark});
            expect([mode, signing, r.rc]).toEqual([mode, signing, 1]);
            expect(r.out).toContain('com.mattermost');
        }
    });

    it('UT-059【基】基点コミットの google-services.json（com.mattermost.rn と rnbeta の2件）: rc=1・出力に com.mattermost とWeaverクライアント0件の旨', () => {
        const root = s.tmp();
        const f = s.write(root, 'gs.json', s.gitShow(s.BASE_SHA, 'android/app/google-services.json'));
        const r = s.guard(['ag2', '--root', s.posix(root), '--mode', 'confirm', '--signing', 'unsigned', '--google-services', s.posix(f), '--firebase-project-id', FPID]);
        expect(r.rc).toBe(1);
        expect(r.out).toContain('com.mattermost');
        expect(r.out).toMatch(/com\.metarchitect\.Weaver|0/);
    });

    it('UT-060 Weaver クライアントが0件／2件: どちらも rc=1', () => {
        const wc = JSON.parse(dummyJson()).client[0];
        const mk = (clients: unknown[]) => s.googleServices({clients});
        expect(ag2(mk([])).rc).toBe(1);
        expect(ag2(mk([wc, wc])).rc).toBe(1);
    });

    it('UT-061 JSONとして壊れた／0バイト／存在しない／配列／client キー無し: 5通りとも rc=1（検査できないを成功にしない）', () => {
        const cases: Array<[string, string | null]> = [['broken', '{'], ['empty', ''], ['missing', null], ['array', '[]'], ['noclient', '{"project_info":{}}']];
        for (const [label, raw] of cases) {
            const r = ag2(raw === null ? null : 'x', {raw: raw === null ? undefined : raw});
            expect([label, r.rc]).toEqual([label, 1]);
        }
    });

    it('UT-062 目印あり・実キーのどの文字列値に DUMMY が混ざっても rc=1（6通り）', () => {
        const fields: Array<[string, Record<string, unknown>]> = [
            ['project_id', {projectId: 'weaver-DUMMY-proj'}], ['project_number', {projectNumber: '12DUMMY34'}],
            ['mobilesdk_app_id', {appId: '1:1:android:DUMMYabc'}], ['current_key', {key: 'AIzaDUMMYKEY'}],
            ['client_id', {clientId: 'DUMMY.apps.googleusercontent.com'}], ['storage_bucket', {bucket: 'DUMMY.appspot.com'}],
        ];
        for (const [label, over] of fields) {
            const pid = (over.projectId as string) || FPID;
            const r = ag2(realJson(over), {mark: true, fpid: pid});
            expect([label, r.rc]).toEqual([label, 1]);
        }
    });

    it('UT-063 目印あり・実キーで小文字 dummy だけを含む値: rc=0（大文字小文字を区別。設計どおり＝実キー検査が補う）', () => {
        const r = ag2(realJson({bucket: 'dummy-bucket.appspot.com', clientId: 'dummy.apps.googleusercontent.com'}), {mark: true});
        expect(r.rc).toBe(0);
    });

    it('UT-064 目印が空ファイル／1KB／ディレクトリ（ダミーJSON・unsigned・confirm）: 空・1KBは rc=1、ディレクトリは「なし」扱いで rc=0＋WARN', () => {
        expect(ag2(dummyJson(), {mark: true}).rc).toBe(1);
        expect(ag2(dummyJson(), {mark: 'x'.repeat(1024)}).rc).toBe(1);
        const d = ag2(dummyJson(), {mark: 'dir'});
        expect(d.rc).toBe(0);
        expect(s.warnLines(d, 'AG2').length).toBeGreaterThanOrEqual(1);
    });

    it('UT-065【現】作成予定のダミー google-services.json（S1後）の中身が設計 §3.4 のとおり', () => {
        const text = s.read('android/app/google-services.json');
        const j = JSON.parse(text);
        expect(j.project_info.project_number).toBe('000000000000');
        expect(j.project_info.project_id).toBe('DUMMY-weaver-unsigned-verification');
        expect(j.client).toHaveLength(1);
        const c = j.client[0];
        expect(c.client_info.android_client_info.package_name).toBe('com.metarchitect.Weaver');
        expect(c.client_info.mobilesdk_app_id).toBe('1:000000000000:android:DUMMY0000000000000000');
        expect(c.oauth_client[0]).toEqual({client_id: 'DUMMY-client-id', client_type: 3});
        expect(c.api_key[0].current_key).toBe('DUMMY-NOT-A-REAL-API-KEY');
        expect(j.configuration_version).toBe('1');
        expect(text).not.toContain('com.mattermost');
        expect(text).not.toContain('7231322553409637977');
    });

    it('UT-342 目印なし・小文字 dummy だけを含む値（DUMMY は0件）・confirm×unsigned: rc=1（切替漏れ。ダミーと判定されず WARN で通らない）', () => {
        const r = ag2(realJson({bucket: 'dummy-bucket.appspot.com'}));
        expect(r.rc).toBe(1);
        expect(r.out).not.toContain('WARN: AG2: dummy');
    });
});

describe('AG2 --phase post（AAB 内の Google サービスの値。inspect の I8。詳細設計 §5.3.2）', () => {
    const post = (resources: string, o: {mark?: boolean; mode?: string; signing?: string; fpid?: string} = {}) => {
        const d = s.extractDir({resources});
        const root = s.tmp();
        s.write(root, '.github/placeholder', '');
        if (o.mark) {
            s.write(root, '.github/android_firebase_real', '');
        }
        return s.guard(['ag2', '--phase', 'post', '--dir', s.posix(d), '--root', s.posix(root), '--mode', o.mode || 'confirm', '--signing', o.signing || 'unsigned', '--firebase-project-id', o.fpid === undefined ? FPID : o.fpid]);
    };
    const res = (pid: string, appId: string) => `string/project_id: ${pid}\nstring/google_app_id: ${appId}\n`;
    const DUMMY = res('DUMMY-weaver-unsigned-verification', '1:000000000000:android:DUMMY0000000000000000');
    const REALV = res(FPID, s.REAL.appId);

    it('UT-354 ダミー・目印なし・confirm×unsigned は rc=0＋WARN。提出用・署名あり・目印ありダミー・切替漏れ・不一致・Mattermost・空・com.mattermost系は rc=1', () => {
        const ok = post(DUMMY);
        expect(ok.rc).toBe(0);
        expect(s.warnLines(ok, 'AG2').length).toBeGreaterThanOrEqual(1);
        expect(post(DUMMY, {mode: 'submission'}).rc).toBe(1);
        expect(post(DUMMY, {mark: true}).rc).toBe(1);
        expect(post(REALV).rc).toBe(1);
        const real = post(REALV, {mark: true});
        expect(real.rc).toBe(0);
        expect(post(res('other-proj', s.REAL.appId), {mark: true}).rc).toBe(1);
        expect(post(res('api-7231322553409637977-752355', s.REAL.appId), {mark: true, fpid: 'api-7231322553409637977-752355'}).rc).toBe(1);
        expect(post('', {mark: true}).rc).toBe(1);
        const mm = post(res('com.mattermost.x', '1:1:android:com.mattermost.rn'), {mark: true});
        expect(mm.rc).toBe(1);
        expect(mm.out).toContain('com.mattermost');
    });
});
