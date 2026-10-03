// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループU（UT-272〜UT-277）: SSO の戻り先スキーム（K-39 実機テスト T2b の不合格への対応）
// 事実（実機）: 戻り先 mmauth:// を、端末にあった公式 Mattermost アプリが開いてしまい、Weaver に戻らなかった。
// Weaver の applicationId（com.met-architect.Weaver）は isBetaApp が偽のため、SSO は Sso.REDIRECT_URL_SCHEME（config.json の AuthUrlScheme）を使う。
// 方針: AuthUrlScheme を mmauthbeta:// にする（Weaver が登録済みで、公式の通常版アプリ［mmauth］と衝突しない。サーバーは両方を許可済み）。
// 不変条件: SSO が使うスキームは、必ず Weaver 自身の Info.plist（iOS）・AndroidManifest.xml（Android）に登録されている。公式アプリのスキームを使わない。
// 注意: UT-273 は dist/assets（node scripts/generate-assets.js で assets/base から生成）を読む。生成し直してから実行すること。

import {Sso} from '@constants';

const support = require('./weaver_test_support.cjs');

const cfg = (): Record<string, string> => JSON.parse(support.read('assets/base/config.json'));
const nameOf = (scheme: string) => scheme.replace(/:\/\/$/, '');
const iosSchemes = (): string[] => {
    const text: string = support.read('ios/Mattermost/Info.plist');
    const m = /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text);
    return m ? [...m[1].matchAll(/<string>([^<]*)<\/string>/g)].map((x) => x[1]) : [];
};
const androidSchemes = (): string[] => [...support.read('android/app/src/main/AndroidManifest.xml').matchAll(/android:scheme=\"([^\"]*)\"/g)].map((x) => x[1]);
const OFFICIAL_SCHEMES = ['mmauth', 'mattermost'];

describe('SSO の戻り先スキーム', () => {
    it('UT-272 assets/base/config.json の AuthUrlScheme は mmauthbeta://（AuthUrlSchemeDev も mmauthbeta:// のまま）', () => {
        expect(cfg().AuthUrlScheme).toBe('mmauthbeta://');
        expect(cfg().AuthUrlSchemeDev).toBe('mmauthbeta://');
    });

    it('UT-273 実行時の Sso.REDIRECT_URL_SCHEME（dist の config 経由）が mmauthbeta://', () => {
        expect((Sso as Record<string, unknown>).REDIRECT_URL_SCHEME).toBe('mmauthbeta://');
    });

    it('UT-274 SSO が使うスキーム（AuthUrlScheme・AuthUrlSchemeDev）は、すべて ios/Mattermost/Info.plist の CFBundleURLSchemes に登録されている', () => {
        const registered = iosSchemes();
        expect(registered.length).toBeGreaterThan(0);
        for (const s of [cfg().AuthUrlScheme, cfg().AuthUrlSchemeDev]) {
            expect({scheme: nameOf(s), registered: registered.includes(nameOf(s))}).toEqual({scheme: nameOf(s), registered: true});
        }
    });

    it('UT-275 同じスキームが Android の AndroidManifest.xml の android:scheme にも登録されている', () => {
        const registered = androidSchemes();
        expect(registered.length).toBeGreaterThan(0);
        for (const s of [cfg().AuthUrlScheme, cfg().AuthUrlSchemeDev]) {
            expect({scheme: nameOf(s), registered: registered.includes(nameOf(s))}).toEqual({scheme: nameOf(s), registered: true});
        }
    });

    it('UT-276 AuthUrlScheme は公式 Mattermost アプリが使うスキーム（mmauth・mattermost）ではない（同じ端末に公式アプリがあっても戻り先を奪われない）', () => {
        expect(OFFICIAL_SCHEMES).not.toContain(nameOf(cfg().AuthUrlScheme));
    });

    it('UT-277 前提: Weaver の CFBundleIdentifier に rnbeta が含まれない（＝isBetaApp が偽で、SSO は AuthUrlScheme を使う）', () => {
        const text: string = support.read('ios/Mattermost/Info.plist');
        const m = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]*)<\/string>/.exec(text);
        expect(m && m[1]).toBe('com.met-architect.Weaver');
        expect(m && m[1]).not.toContain('rnbeta');
    });
});
