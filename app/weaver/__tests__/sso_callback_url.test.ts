// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループV（UT-278〜280）: SSO 戻りURLの判定（実機T2b・ビルド9で、ログイン直後に「リンクが無効」のアラートが出た不具合）
// 期待する新規モジュール（プログラマーが作る。名前・署名はここが正）:
//   app/weaver/sso_callback_url.ts
//     export function isSsoCallbackUrl(url: string): boolean;
//   true にするもの:
//     ・スキーム付き: mmauth:// と mmauthbeta:// で始まるもの（後ろは何でもよい。既存 +native-intent.test.ts の `${scheme}some/path` と同じ）
//     ・スキーム無し（expo-router が先頭のスキームを落として渡す形）: `callback`・`/callback`・`//callback` で始まり、直後が末尾か ? # / のもの
//   false にするもの: https://…（パスが /callback でも）・mailto:…・weaver://…・空文字・callback で始まる別の語（callbackx）
// 方針: SSO の戻りURLは SSO 画面の Linking リスナーが処理する。深いリンクの経路（parseAndHandleDeepLink・アラート・起動ルート）へ渡さない。

import {isSsoCallbackUrl} from '../sso_callback_url';

describe('isSsoCallbackUrl', () => {
    it.each([
        'mmauthbeta://callback?login_code=x&state=y&srv=z',
        'mmauth://callback?login_code=x&state=y&srv=z',
        'mmauthbeta://callback',
        'mmauth://some/path',
    ])('UT-278 スキーム付きの SSO 戻りURL %s は true', (url) => {
        expect(isSsoCallbackUrl(url)).toBe(true);
    });

    it.each([
        'callback?login_code=x&state=y&srv=z',
        '/callback?login_code=x&state=y&srv=z',
        '//callback?login_code=x&state=y&srv=z',
        'callback',
        '/callback#frag',
    ])('UT-279 スキームを落とした形 %s も true', (url) => {
        expect(isSsoCallbackUrl(url)).toBe(true);
    });

    it.each([
        'https://community.example.com/team/channels/town-square',
        'https://example.com/callback?x=1',
        'mailto:someone@example.com',
        'weaver://server.example.com',
        'mattermost://server.example.com/team/channels/c',
        '',
        'callbackx?login_code=x',
        '/team/channels/town-square',
    ])('UT-280 通常のURL・別の語 %p は false', (url) => {
        expect(isSsoCallbackUrl(url)).toBe(false);
    });
});
