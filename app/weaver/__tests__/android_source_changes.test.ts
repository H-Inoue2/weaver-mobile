// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: ソース変更（UT-287〜296）と上流URL処理の固定（UT-328・329）。詳細設計 §2.2・§3.4
// 基点コミット（01fbf86bb8）との差分を行単位で見る。基点は git show で読む（現行のファイルの内容から期待を作らない）。
// 段階（S1〜S3）が進むまで変わらないファイルは「現」＝期待を満たさず失敗する。

export {};

const s = require('./android_test_support.cjs');
const {XMLParser, XMLValidator} = require('fast-xml-parser');

jest.setTimeout(120000);
afterAll(() => s.cleanup());

const MAN = 'android/app/src/main/AndroidManifest.xml';
const NSC = 'android/app/src/main/res/xml/network_security_config.xml';
const STR = 'android/app/src/main/res/values/strings.xml';

function lineDiff(a: string, b: string) {
    const cnt = new Map<string, number>();
    for (const l of a.split('\n')) {
        cnt.set(l, (cnt.get(l) || 0) + 1);
    }
    const added: string[] = [];
    for (const l of b.split('\n')) {
        const c = cnt.get(l) || 0;
        if (c > 0) {
            cnt.set(l, c - 1);
        } else {
            added.push(l);
        }
    }
    const removed: string[] = [];
    for (const [l, c] of cnt) {
        for (let i = 0; i < c; i++) {
            removed.push(l);
        }
    }
    return {added: added.filter((x) => x.trim() !== ''), removed: removed.filter((x) => x.trim() !== '')};
}
const baseText = (rel: string) => s.gitShowText(s.BASE_SHA, rel);
const diffOf = (rel: string) => lineDiff(baseText(rel), s.read(rel));

describe('ソース変更（詳細設計 §2.2）', () => {
    it('UT-287【現】build.gradle: namespace が com.mattermost.rnbeta の1件・applicationId・versionCode 817・versionName・署名ブロックは基点と同一。差分は「先頭の // Modified for Weaver (K-79)」と「namespace 行」だけ', () => {
        const now = s.read('android/app/build.gradle');
        expect((now.match(/^\s*namespace\s+["']com\.mattermost\.rnbeta["']/gm) || []).length).toBe(1);
        const d = diffOf('android/app/build.gradle');
        const addedOther = d.added.filter((l) => !/Modified for Weaver \(K-79\)/.test(l) && !/namespace/.test(l));
        const removedOther = d.removed.filter((l) => !/namespace/.test(l));
        expect(addedOther).toEqual([]);
        expect(removedOther).toEqual([]);
        expect(d.added.some((l) => /Modified for Weaver \(K-79\)/.test(l))).toBe(true);
        expect(now.split('\n').slice(0, 5).join('\n')).toContain('Modified for Weaver (K-79)');
        expect(now).toMatch(/applicationId "com\.metarchitect\.Weaver"/);
    });

    it('UT-288【現】WEAVER.md に google-services.json の変更表の行がある', () => {
        expect(s.read('WEAVER.md')).toMatch(/\|[^\n]*google-services\.json[^\n]*\|/);
    });

    it('UT-289【現】AndroidManifest.xml（S3後）と基点の差分は5点だけ（FOREGROUND_SERVICE_MICROPHONE の remove・2サービスの remove・resizeableActivity=false・usesCleartextTraffic=false・先頭のXMLコメント）', () => {
        const now = s.read(MAN);
        const d = diffOf(MAN);
        const all = d.added.join('\n');
        expect(all).toMatch(/FOREGROUND_SERVICE_MICROPHONE[^\n]*tools:node="remove"/);
        expect(all).toContain('com.mattermost.callsnative.MMCallsForegroundService');
        expect(all).toContain('com.oney.WebRTCModule.MediaProjectionService');
        expect((all.match(/tools:node="remove"/g) || []).length).toBeGreaterThanOrEqual(3);
        expect(all).toContain('android:resizeableActivity="false"');
        expect(all).toContain('android:usesCleartextTraffic="false"');
        expect(all).toMatch(/<!--/);
        for (const l of d.removed) {
            expect(l).toMatch(/usesCleartextTraffic|resizeableActivity|FOREGROUND_SERVICE_MICROPHONE|<application|android:name=|xmlns/);
        }
        expect(now).toMatch(/ACCESS_FINE_LOCATION/);
        for (const k of ['mattermost', 'mmauthbeta', 'weaver']) {
            expect(now).toContain(`android:scheme="${k}"`);
        }
        expect(now).toContain('android:launchMode="singleTask"');
        expect(now).toContain('android:taskAffinity=""');
        expect(d.added.filter((l) => /uses-permission/.test(l) && !/MICROPHONE/.test(l))).toEqual([]);
    });

    it('UT-290【現】マニフェストの構文: fast-xml-parser で構文エラー0件・xmlns:tools 宣言あり・<service> の除去2件の android:name が基点の除去分＋FQCN2件と完全一致', () => {
        const t = s.read(MAN);
        expect(XMLValidator.validate(t)).toBe(true);
        expect(t).toContain('xmlns:tools=');
        const j = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '@_'}).parse(t);
        const services = ([] as any[]).concat(j.manifest.application.service || []).filter((x: any) => x['@_tools:node'] === 'remove').map((x: any) => x['@_android:name']).sort();
        // 基点の上流マニフェストに、既に tools:node="remove" の service（NitroBackgroundTimerService）がある（D-S2-12）。期待＝基点の除去 service ＋ Weaver が足す2件
        const bj = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '@_'}).parse(baseText(MAN));
        const baseRemoved = ([] as any[]).concat(bj.manifest.application.service || []).filter((x: any) => x['@_tools:node'] === 'remove').map((x: any) => x['@_android:name']);
        expect(services).toEqual([...new Set([...baseRemoved, 'com.mattermost.callsnative.MMCallsForegroundService', 'com.oney.WebRTCModule.MediaProjectionService'])].sort());
        expect(services).toEqual(expect.arrayContaining(['com.mattermost.callsnative.MMCallsForegroundService', 'com.oney.WebRTCModule.MediaProjectionService']));
    });

    it('UT-291【現】network_security_config.xml（S3後）: 差分は base-config の cleartextTrafficPermitted が "false" と先頭コメントの2点・base-config は1つ・domain-config／debug-overrides 0件・user 証明書（src="user"）は残る', () => {
        const t = s.read(NSC);
        const b = baseText(NSC);
        expect(b).toMatch(/<base-config[^>]*cleartextTrafficPermitted="true"/);
        expect(t).toMatch(/<base-config[^>]*cleartextTrafficPermitted="false"/);
        expect((t.match(/<base-config/g) || []).length).toBe(1);
        expect(t).not.toMatch(/<domain-config|<debug-overrides/);
        expect(t).toContain('<certificates src="user" />');
        const d = diffOf(NSC);
        expect(d.added.some((l) => /<!--/.test(l))).toBe(true);
        expect(d.removed.filter((l) => !/base-config/.test(l))).toEqual([]);
    });

    it('UT-292【現】strings.xml（S3後）: app_name がちょうど1件で APP_NAME（Weaver）と一致・基点との差分は app_name の1行だけ', () => {
        const t = s.read(STR);
        expect((t.match(/<string name="app_name">/g) || []).length).toBe(1);
        const consts = s.read('app/weaver/constants.ts');
        const appName = /APP_NAME\s*=\s*'([^']+)'/.exec(consts)![1];
        expect(appName).toBe('Weaver');
        expect(t).toContain(`<string name="app_name">${appName}</string>`);
        const d = diffOf(STR);
        expect(d.added).toHaveLength(1);
        expect(d.removed).toHaveLength(1);
        expect(d.added[0]).toContain('app_name');
    });

    it('UT-293【現】.gitignore（S2で追記）: 基点からの追加は9行ちょうど・既存の *.keystore と !debug.keystore が残る・git check-ignore が7つの例を無視と判定・debug.keystore は追跡のまま', () => {
        const d = lineDiff(baseText('.gitignore'), s.read('.gitignore'));
        expect(d.removed).toEqual([]);
        expect(d.added.map((x) => x.trim()).sort()).toEqual(['*-adminsdk-*.json', '*.b64', '*.base64', '*.jks', '*.p12', '*.p8', '*.pem', '*service-account*.json', '*service_account*.json'].sort()); // v1.8: 9行（*.b64・*.base64 を追加）
        const t = s.read('.gitignore');
        expect(t).toMatch(/^\*\.keystore$/m);
        expect(t).toMatch(/^!debug\.keystore$/m);
        for (const p of ['a.jks', 'b.p12', 'c.pem', 'd.p8', 'k.b64', 'k.base64', 'x-service-account-1.json', 'y_service_account.json', 'z-adminsdk-abc.json']) {
            const r = s.git(['check-ignore', '-q', p]);
            expect([p, r.rc]).toEqual([p, 0]);
        }
        expect(s.git(['ls-files', '--error-unmatch', 'android/app/debug.keystore']).rc).toBe(0);
    });

    it('UT-294【現】WEAVER.md: 変更した上流ファイル（build.gradle・AndroidManifest.xml・strings.xml・google-services.json・weaver_release_guard.sh・.gitignore）の全てに表の行がある・「Androidのビルド」の節が weaver-android-aab.yml を含む', () => {
        const t = s.read('WEAVER.md');
        for (const f of ['build.gradle', 'AndroidManifest.xml', 'strings.xml', 'google-services.json', 'weaver_release_guard.sh', '.gitignore']) {
            expect([f, new RegExp('\\|[^\\n]*' + f.replace(/\./g, '\\.') + '[^\\n]*\\|').test(t)]).toEqual([f, true]);
        }
        expect(t).toMatch(/Android[^\n]*ビルド/);
        expect(t).toContain('weaver-android-aab.yml');
    });

    it('UT-295 変更ファイルの範囲: ios/・weaver-ios-*.yml・configure_manual_signing.rb・release_guard.test.ts の変更0件・.gitattributes は追記のみ・許可パスは android/・.github/・app/weaver/・例外の一覧だけ', () => {
        const names = new Set<string>([
            ...s.git(['diff', '--name-only', s.BASE_SHA]).out.toString().split('\n'),
            ...s.git(['ls-files', '--others', '--exclude-standard']).out.toString().split('\n'),
        ].filter(Boolean));
        const forbidden = [...names].filter((n) => /^ios\/|weaver-ios-.*\.yml$|configure_manual_signing\.rb$|release_guard\.test\.ts$/.test(n));
        expect(forbidden).toEqual([]);
        const allowedPrefix = /^(android\/|\.github\/|app\/weaver\/)/;
        // K-114（押した時点のサーバーに固定）が正当に変える上流6ファイル。理由つきで名指し許可する（ディレクトリ単位では許可しない＝K-79の検出力を保つ。新しい上流変更は、ここへ足さない限り落ちる）
        const k114Upstream = [
            'app/components/channel_actions/add_members_box/add_members_box.tsx',
            'app/components/channel_actions/info_box/index.tsx',
            'app/routes/(modals)/(channel_info)/channel_add_members.tsx',
            'app/routes/(modals)/(channel_info)/index.tsx',
            'app/screens/channel/header/header.tsx',
            'app/screens/channel_info/options/add_members/add_members.tsx',
        ];
        const exceptions = new Set(['WEAVER.md', '.gitignore', '.gitattributes', 'package.json', 'package-lock.json', ...k114Upstream]);
        const outside = [...names].filter((n) => !allowedPrefix.test(n) && !exceptions.has(n) && !/^\.claude\//.test(n));
        expect(outside).toEqual([]);
        const ga = lineDiff(baseText('.gitattributes'), s.read('.gitattributes'));
        expect(ga.removed).toEqual([]);
    });

    it('UT-296 新規の .github/scripts/weaver_android_*.sh に CR 0件（コミットされた内容＝index が LF）・git check-attr eol が lf', () => {
        const scripts = ['weaver_android_guard.sh', 'weaver_android_inject_version.sh', 'weaver_android_aab.sh', 'weaver_android_16k_check.sh'].map((n) => '.github/scripts/' + n);
        for (const rel of scripts) {
            expect([rel, s.exists(rel)]).toEqual([rel, true]);
            const eol = s.git(['ls-files', '--eol', rel]).out.toString();
            if (eol.trim()) {
                expect([rel, /i\/lf/.test(eol)]).toEqual([rel, true]);
            } else {
                expect([rel, s.readBuf(rel).includes(13)]).toEqual([rel, false]);
            }
            const ca = s.git(['check-attr', 'eol', rel]).out.toString();
            expect([rel, /eol: lf/.test(ca)]).toEqual([rel, true]);
        }
    });
});

describe('上流のサーバー URL 処理の固定（UT-328・329。変更しない＝現行で通る【既】）', () => {
    it('UT-328【既】isValidUrl と sanitizeUrl の挙動（http:// は検証エラーにならない）', () => {
        const {isValidUrl, sanitizeUrl} = require('@utils/url');
        expect(isValidUrl('http://a.example')).toBe(true);
        expect(isValidUrl('HTTP://a.example')).toBe(true);
        expect(isValidUrl('https://a.example')).toBe(true);
        expect(isValidUrl('ftp://a.example')).toBe(false);
        expect(isValidUrl('a.example')).toBe(false);
        const a = sanitizeUrl('http://a.example');
        expect(a.startsWith('https://')).toBe(true);
        expect(a).toContain('a.example');
        expect(sanitizeUrl('a.example').startsWith('https://')).toBe(true);
    });

    it('UT-329【既】Weaver 独自のエラー文言・事前検証を足していない: 3ファイルが基点と同一・app/weaver 配下に cleartext・平文・not permitted が0件・WEAVER.md の変更表に3ファイルの行なし', () => {
        for (const rel of ['app/screens/server/index.tsx', 'app/utils/url/index.ts', 'app/utils/errors.ts']) {
            expect([rel, s.sha256Buf(Buffer.from(s.read(rel)))]).toEqual([rel, s.sha256Buf(Buffer.from(s.gitShowText(s.BASE_SHA, rel)))]);
        }
        const hits = s.git(['grep', '-n', '-i', '-E', 'cleartext|平文|not permitted', '--', 'app/weaver']).out.toString().split('\n').filter((l: string) => l && !/__tests__/.test(l));
        expect(hits).toEqual([]);
        const t = s.read('WEAVER.md');
        for (const f of ['screens/server/index.tsx', 'utils/url/index.ts', 'utils/errors.ts']) {
            expect([f, t.includes(f)]).toEqual([f, false]);
        }
    });
});
