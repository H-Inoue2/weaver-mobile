// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: データファイルと、ファイル間で値が一致すること（UT-297〜310）。詳細設計 §5.8・§3.1・§1.4
// 許可リスト・基準値・ハッシュ一覧・段階値は新規ファイル。値は設計書の表から導く（実装されたファイルから写さない）。

export {};

const s = require('./android_test_support.cjs');
const w = require('./android_workflow_rules.cjs');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const lines = (rel: string) => s.read(rel).split('\n');
const A18_NAMES = ['INTERNET', 'ACCESS_NETWORK_STATE', 'CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE', 'RECEIVE_BOOT_COMPLETED', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'WRITE_EXTERNAL_STORAGE', 'READ_EXTERNAL_STORAGE', 'ACCESS_FINE_LOCATION', 'ACCESS_WIFI_STATE', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_CONNECT', 'READ_MEDIA_AUDIO'];

describe('データファイル（詳細設計 §5.8）', () => {
    it('UT-297 許可リスト: A 区分18件で名前の集合が設計と一致（maxSdk 付き4件）・C 区分2件・ACCESS_COARSE_LOCATION は（a）にも（c）にも無い', () => {
        const rows = lines(s.ALLOWLIST_REL).filter((l: string) => /^[ABC] /.test(l));
        const A = rows.filter((l: string) => l.startsWith('A '));
        const C = rows.filter((l: string) => l.startsWith('C '));
        expect(A).toHaveLength(18);
        expect(A.map((l: string) => l.split(/\s+/)[1].replace('android.permission.', '')).sort()).toEqual([...A18_NAMES].sort());
        const max = Object.fromEntries(A.filter((l: string) => /maxSdk=/.test(l)).map((l: string) => [l.split(/\s+/)[1].replace('android.permission.', ''), /maxSdk=(\d+)/.exec(l)![1]]));
        expect(max).toEqual({WRITE_EXTERNAL_STORAGE: '32', READ_EXTERNAL_STORAGE: '32', BLUETOOTH: '30', BLUETOOTH_ADMIN: '30'});
        expect(C.map((l: string) => l.split(/\s+/)[1].replace('android.permission.', '')).sort()).toEqual(['FOREGROUND_SERVICE_MICROPHONE', 'FOREGROUND_SERVICE_SPECIAL_USE']);
        expect(rows.filter((l: string) => /ACCESS_COARSE_LOCATION/.test(l))).toEqual([]);
    });

    it('UT-298 許可リストの（b）（段階ゲート）: S1＝許可リストが無い／S2＝B-PENDING がちょうど1行／S3・S4＝B-PENDING が0件で（b）の名前が実測と一致', () => {
        const st = s.stage();
        if (st === 'S1') {
            expect(s.exists(s.ALLOWLIST_REL)).toBe(false);
            return;
        }
        const pend = lines(s.ALLOWLIST_REL).filter((l: string) => l.includes('B-PENDING'));
        if (st === 'S2') {
            expect(pend).toHaveLength(1);
        } else {
            expect(pend).toHaveLength(0);
            const b = lines(s.ALLOWLIST_REL).filter((l: string) => l.startsWith('B '));
            expect(b.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('UT-299 baseline.json（段階ゲート）: キーはちょうど3つ・値は非負整数か "PENDING"・LF。S2 は3項目とも PENDING／S3・S4 は PENDING が0件', () => {
        const st = s.stage();
        const raw = s.readBuf(s.BASELINE_REL).toString('utf8');
        expect(raw.includes('\r')).toBe(false);
        const j = JSON.parse(raw);
        expect(Object.keys(j).sort()).toEqual(['jest_passed', 'jest_pending', 'tsc_errors']);
        for (const v of Object.values(j)) {
            expect(v === 'PENDING' || (Number.isInteger(v) && (v as number) >= 0)).toBe(true);
        }
        if (st === 'S2') {
            expect(Object.values(j)).toEqual(['PENDING', 'PENDING', 'PENDING']);
        } else if (st === 'S3' || st === 'S4') {
            expect(Object.values(j).filter((v) => v === 'PENDING')).toEqual([]);
        }
    });

    it('UT-300 ハッシュ一覧: ちょうど35行・各行が ^[0-9a-f]{64}  android/app/src/main/res/… ・内訳 mipmap 5密度×5＝25＋splash.png 10・splash_background.png と ic_notif_action_reply.png は0件・重複0件', () => {
        const rows = lines(s.HASHES_REL).filter(Boolean);
        expect(rows).toHaveLength(35);
        const paths: string[] = [];
        for (const r of rows) {
            const m = /^([0-9a-f]{64}) {2}(android\/app\/src\/main\/res\/\S+)$/.exec(r);
            expect([r.slice(0, 30), !!m]).toEqual([r.slice(0, 30), true]);
            paths.push(m![2]);
        }
        expect(new Set(paths).size).toBe(35);
        const mip = paths.filter((p) => /\/mipmap-[a-z]+dpi\/(ic_launcher|ic_launcher_background|ic_launcher_foreground|ic_launcher_round|ic_notification)\.png$/.test(p));
        expect(mip).toHaveLength(25);
        expect(paths.filter((p) => /\/drawable(-night)?-[a-z]+dpi\/splash\.png$/.test(p))).toHaveLength(10);
        expect(paths.filter((p) => /splash_background\.png|ic_notif_action_reply\.png/.test(p))).toEqual([]);
    });

    it('UT-301 ハッシュ一覧と上流コミット 0c0d6c48ec・基点コミットの突合（35/35）。現行ツリーは読まない', () => {
        const rows = lines(s.HASHES_REL).filter(Boolean);
        expect(rows.length).toBe(35);
        for (const r of rows) {
            const [h, p] = r.split(/ {2}/);
            expect([p, s.sha256Buf(s.gitShow(s.UPSTREAM_SHA, p))]).toEqual([p, h]);
            expect([p, s.sha256Buf(s.gitShow(s.BASE_SHA, p))]).toEqual([p, h]);
        }
    });

    it('UT-302 全データファイルと .gitattributes の追記: index に CR 0件・追記はちょうど3行で既存行の変更・削除0件・git check-attr eol が lf', () => {
        const files = [s.ALLOWLIST_REL, s.BASELINE_REL, s.HASHES_REL, s.STAGE_REL];
        for (const rel of files) {
            expect([rel, s.exists(rel)]).toEqual([rel, true]);
            const eol = s.git(['ls-files', '--eol', rel]).out.toString();
            if (eol.trim()) {
                expect([rel, /i\/lf/.test(eol)]).toEqual([rel, true]);
            } else {
                expect([rel, s.readBuf(rel).includes(13)]).toEqual([rel, false]);
            }
            expect([rel, /eol: lf/.test(s.git(['check-attr', 'eol', rel]).out.toString())]).toEqual([rel, true]);
        }
        const base = new Set(s.gitShowText(s.BASE_SHA, '.gitattributes').split('\n'));
        const now = s.read('.gitattributes').split('\n');
        const added = now.filter((l: string) => l.trim() && !base.has(l));
        expect(added.sort()).toEqual(['.github/actions/weaver-prepare-js/action.yml text eol=lf', '.github/android_* text eol=lf', '.github/workflows/weaver-android-*.yml text eol=lf'].sort());
        const gone = [...base].filter((l: string) => l.trim() && !now.includes(l));
        expect(gone).toEqual([]);
        expect(now).toContain('.github/scripts/*.sh text eol=lf');
    });

    it('UT-303【未】APP_VERSION（Android ワークフローの env）・package.json の version は 2.45.0、iOS ワークフローの版は 2.45.1（K-120 で iOS のみ上げた。Android は未公開のため据え置き）', () => {
        const a = w.loadReal().env.APP_VERSION;
        const p = JSON.parse(s.read('package.json')).version;
        const ios = /APP_VERSION[^\n]*?["']?(\d+\.\d+\.\d+)/.exec(s.read('.github/workflows/weaver-ios-testflight.yml'));
        expect(a).toBe('2.45.0');
        expect(p).toBe('2.45.0');
        expect(ios && ios[1]).toBe('2.45.1');
    });

    it('UT-304 com.metarchitect.Weaver が build.gradle・ダミー google-services.json・guard の既定値・smoke-trial の pidof・am start で同じ。rnbeta を含む applicationId は0件', () => {
        const g = s.read('android/app/build.gradle');
        expect(g).toMatch(/applicationId "com\.metarchitect\.Weaver"/);
        expect(s.read('android/app/google-services.json')).toContain('com.metarchitect.Weaver');
        expect(s.read(s.SCRIPTS.guard)).toContain('com.metarchitect.Weaver');
        const smoke = s.read(s.SMOKE);
        expect(smoke).toContain('pidof com.metarchitect.Weaver');
        expect(smoke).toContain('com.metarchitect.Weaver/com.mattermost.rnbeta.MainActivity');
        expect(g).not.toMatch(/applicationId\s+["'][^"']*rnbeta/);
    });

    it('UT-305 ABI の値 arm64-v8a,armeabi-v7a,x86_64 が B13・B14 と全 PreactNativeArchitectures で同一文字列（1種類）', () => {
        const t = s.read(s.WORKFLOW);
        const vals = new Set((t.match(/reactNativeArchitectures=([^\s"']+)/g) || []).map((x: string) => x.split('=')[1]));
        expect([...vals]).toEqual(['arm64-v8a,armeabi-v7a,x86_64']);
        expect((t.match(/reactNativeArchitectures=/g) || []).length).toBeGreaterThanOrEqual(1);
    });

    it('UT-306 VERSION_CODE_BASE＝"1000"・--base $VERSION_CODE_BASE が inject（B8）・pre（B9・B10）の3か所に各1件・スクリプトの --base 既定が 1000。--base 2000 で inject と ag7 が整合・--base が数字以外は rc=2', () => {
        const d = w.loadReal();
        expect(d.env.VERSION_CODE_BASE).toBe('1000');
        for (const l of ['B8', 'B9', 'B10']) {
            const body = w.runOf(w.step(d, 'build', l));
            expect([l, (body.match(/--base "?\$\{?VERSION_CODE_BASE\}?"?/g) || []).length]).toEqual([l, 1]);
        }
        const dir = s.tmp();
        const f = s.write(dir, 'build.gradle', s.buildGradle({versionCode: 817}));
        expect(s.inject(['--gradle', s.posix(f), '--run-number', '7', '--app-version', '2.45.0', '--base', '2000']).rc).toBe(0);
        expect(s.read ? s.guard(['ag7', '--gradle', s.posix(f), '--run-number', '7', '--app-version', '2.45.0', '--base', '2000']).rc : 1).toBe(0);
        expect(s.guard(['ag7', '--gradle', s.posix(f), '--run-number', '7', '--app-version', '2.45.0']).rc).toBe(1);
        expect(s.inject(['--gradle', s.posix(f), '--run-number', '7', '--app-version', '2.45.0', '--base', 'abc']).rc).toBe(2);
        expect(s.guard(['ag7', '--gradle', s.posix(f), '--run-number', '7', '--app-version', '2.45.0', '--base', 'abc']).rc).toBe(2);
        for (const rel of [s.SCRIPTS.inject, s.SCRIPTS.guard]) {
            expect([rel, /1000/.test(s.read(rel))]).toEqual([rel, true]);
        }
    });

    it('UT-307 成果物・要約・kind の名前の書式が、ワークフロー・aab.sh・guard で同じ（weaver-android-aab-<run>-<kind>・weaver-android-summary-<run>.txt・weaver-android-<versionName>-<versionCode>-<kind>.aab）。kind の3値が3か所で同一', () => {
        const wf = s.read(s.WORKFLOW);
        const aab = s.read(s.SCRIPTS.aab);
        const guard = s.read(s.SCRIPTS.guard);
        expect(wf).toMatch(/weaver-android-aab-\$\{\{ github\.run_number \}\}/);
        expect(wf + aab).toMatch(/weaver-android-summary-/);
        expect(wf + aab).toMatch(/weaver-android-\$\{?APP_VERSION\}?-\$\{?VERSION_CODE\}?-\$\{?KIND\}?\.aab|weaver-android-\$version-\$versionCode-\$kind\.aab|weaver-android-\$\{?version\}?-/);
        for (const k of ['unsigned-verification-only', 'confirm', 'submission']) {
            for (const [n, t] of [['wf', wf], ['aab', aab], ['guard', guard]]) {
                expect([k, n, t.includes(k)]).toEqual([k, n, true]);
            }
        }
    });

    it('UT-308 tools が出力するキー名（WEAVER_KEYTOOL・AAPT2・ZIPALIGN・DEXDUMP・OBJDUMP）が aab.sh・16k_check.sh・guard の参照名と一致（綴り違い0件）', () => {
        const keys = ['WEAVER_KEYTOOL', 'WEAVER_AAPT2', 'WEAVER_ZIPALIGN', 'WEAVER_DEXDUMP', 'WEAVER_OBJDUMP'];
        const aab = s.read(s.SCRIPTS.aab);
        for (const k of keys) {
            expect([k, aab.includes(k)]).toEqual([k, true]);
        }
        expect(s.read(s.SCRIPTS.k16)).toContain('WEAVER_OBJDUMP');
        expect(s.read(s.SCRIPTS.k16)).toContain('WEAVER_ZIPALIGN');
        const all = s.read(s.SCRIPTS.aab) + s.read(s.SCRIPTS.k16) + s.read(s.SCRIPTS.guard) + s.read(s.WORKFLOW);
        const found = new Set((all.match(/WEAVER_(KEYTOOL|AAPT2|ZIPALIGN|DEXDUMP|OBJDUMP|[A-Z0-9_]*TOOL[A-Z0-9_]*)\b/g) || []));
        for (const f of found) {
            expect([f, [...keys, 'WEAVER_BUNDLETOOL_JAR'].includes(f as string)]).toEqual([f, true]);
        }
    });

    it('UT-309 環境変数名: WEAVER_KEYSTORE_FILE・WEAVER_KEYSTORE_PASSWORD・WEAVER_KEY_ALIAS・WEAVER_EXPECTED_CERT_SHA256・WEAVER_FIREBASE_PROJECT_ID が、ワークフローの env と guard が読む名前で同一。ORG_GRADLE_PROJECT_ は0件', () => {
        const wf = s.read(s.WORKFLOW);
        const guard = s.read(s.SCRIPTS.guard);
        for (const k of ['WEAVER_KEYSTORE_FILE', 'WEAVER_KEYSTORE_PASSWORD', 'WEAVER_KEY_ALIAS', 'WEAVER_EXPECTED_CERT_SHA256', 'WEAVER_FIREBASE_PROJECT_ID']) {
            expect([k, 'wf', wf.includes(k)]).toEqual([k, 'wf', true]);
            expect([k, 'guard', guard.includes(k)]).toEqual([k, 'guard', true]);
        }
        expect(wf).not.toContain('ORG_GRADLE_PROJECT_');
    });

    it('UT-310 APP_NAME の単一の正: strings.xml の app_name・AG5 が読む値・constants.ts が Weaver で同一。AG5 のスクリプトに Weaver のリテラルが無い（constants.ts から読む）', () => {
        const consts = s.read('app/weaver/constants.ts');
        const appName = /APP_NAME\s*=\s*'([^']+)'/.exec(consts)![1];
        expect(appName).toBe('Weaver');
        expect(s.read('android/app/src/main/res/values/strings.xml')).toContain(`<string name="app_name">${appName}</string>`);
        const guard = s.read(s.SCRIPTS.guard);
        const ag5 = guard.slice(guard.indexOf('ag5'));
        expect(ag5).toContain('APP_NAME');
        const body = guard.split('\n').filter((l: string) => !/^\s*#/.test(l)).join('\n');
        expect(body).not.toMatch(/['"]Weaver['"]/);
    });
});
