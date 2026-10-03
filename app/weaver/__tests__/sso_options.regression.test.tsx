// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループG（回帰・実装前から通る）: UT-69・UT-71・UT-72・UT-73
// sso_options.tsx の差し込み（C-2）が、他のSSO・無効時・押下・接続先を壊していないことの確認。
// Weaver の新規モジュールを import しない（実装前でも実行でき、G区分として記録するため）。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import {Preferences, Sso} from '@constants';
import SsoOptions from '@screens/login/sso_options';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

const support = require('./weaver_test_support.cjs');

const theme = Preferences.THEMES.denim;

const renderSso = (ssoOptions: SsoWithOptions, goToSso = jest.fn(), locale = 'en') => ({
    goToSso,
    ...renderWithIntlAndTheme(
        <SsoOptions
            goToSso={goToSso}
            ssoOnly={false}
            ssoOptions={ssoOptions}
            theme={theme}
        />,
        {locale},
    ),
});

describe('sso_options.tsx の回帰', () => {
    it.each<[string, string]>([
        [Sso.GOOGLE, 'Google'],
        [Sso.OFFICE365, 'Entra ID'],
        [Sso.OPENID, 'Open ID'],
        [Sso.SAML, 'SAML'],
    ])('UT-69 %s のボタン文字は %s（従来どおり）', (type, label) => {
        const r = renderSso({[type]: {enabled: true}});
        expect(r.getByText(label)).toBeTruthy();
    });

    it('UT-71 gitlab: enabled=false のとき gitlab のボタンが無い', () => {
        const r = renderSso({[Sso.GITLAB]: {enabled: false}, [Sso.GOOGLE]: {enabled: true}});
        expect(support.textNodes(r.toJSON())).toEqual(['Google']);
    });

    it('UT-72 gitlab のボタンを押すと goToSso(\'gitlab\') が1回呼ばれる（接続先の種別は変えない）', () => {
        const r = renderSso({[Sso.GITLAB]: {enabled: true}});
        const texts: string[] = support.textNodes(r.toJSON());
        expect(texts).toHaveLength(1);
        fireEvent.press(r.getByText(texts[0]));
        expect(r.goToSso).toHaveBeenCalledTimes(1);
        expect(r.goToSso).toHaveBeenCalledWith(Sso.GITLAB);
    });

    it('UT-73 sso/index.tsx に /oauth/gitlab/mobile_login が残っている（サーバーの接続先を変えていない）', () => {
        expect(support.read('app/screens/sso/index.tsx')).toContain('/oauth/gitlab/mobile_login');
    });
});
