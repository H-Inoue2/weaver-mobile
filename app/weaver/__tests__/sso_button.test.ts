// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループC（UT-38〜UT-42）: app/weaver/components/sso_button.ts
// getWeaverSsoText(locale: string): string ＝ getWeaverMessage(locale, 'weaver.sso_login')（詳細設計 §3.0）

import {getWeaverSsoText} from '../components/sso_button';

describe('sso_button.ts: getWeaverSsoText', () => {
    it('UT-38 ja', () => {
        expect(getWeaverSsoText('ja')).toBe('Weaverでログイン');
    });
    it('UT-39 en', () => {
        expect(getWeaverSsoText('en')).toBe('Log in with Weaver');
    });
    it.each(['de', 'zh-TW'])('UT-40 %s は英語', (loc) => {
        expect(getWeaverSsoText(loc)).toBe('Log in with Weaver');
    });
    it('UT-41 空文字は英語', () => {
        expect(getWeaverSsoText('')).toBe('Log in with Weaver');
    });
    it('UT-42 ja-JP は英語（アプリの言語一覧が ja のみ。サブタグ付きは英語＝詳細設計 §3.0）', () => {
        expect(getWeaverSsoText('ja-JP')).toBe('Log in with Weaver');
    });
});
