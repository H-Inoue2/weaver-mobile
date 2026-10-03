// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {Sso} from '@constants';

// SSO の戻りURL（ログイン後、サーバーがアプリへ返すURL）かどうかを判定する。
// 戻りURLは SSO 画面の Linking リスナー（または認証セッションの結果）が処理する。深いリンクの経路
// （parseAndHandleDeepLink・「リンクが無効」のアラート・起動ルートの決定）へ渡してはならない。
//
// true にするもの:
//  - スキーム付き: mmauth:// と mmauthbeta:// で始まるもの。Weaver の AuthUrlScheme（config.json）が
//    これらと違う値に変わった場合も、その値で始まるものは true（Sso の定数を併用）。
//    mmauth:// は、端末の公式アプリが開いた場合の保険として true にする。
//  - スキームなし（expo-router が先頭のスキームを落として渡す形）: callback・/callback・//callback で始まり、
//    直後が末尾か ? # / のもの（callbackx のような別の語は false）。
// 正当な深いリンクは、スキームとホスト（サーバー名）を持つので、これらと衝突しない。
const SCHEMES = ['mmauth://', 'mmauthbeta://'];
const SCHEMELESS = /^\/{0,2}callback(?:$|[?#/])/;

export function isSsoCallbackUrl(url: string): boolean {
    if (!url) {
        return false;
    }

    const schemes = [...SCHEMES, Sso.REDIRECT_URL_SCHEME, Sso.REDIRECT_URL_SCHEME_DEV].filter(Boolean);
    if (schemes.some((scheme) => url.startsWith(scheme))) {
        return true;
    }

    return SCHEMELESS.test(url);
}
