// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループG（UT-66〜UT-68, UT-70）: ログイン画面の差し込み sso_options.tsx（C-2）
// gitlab 互換のボタンは「Log in with Weaver」「Weaverでログイン」＋Weaverアイコン。GitLab の文字・画像は出さない。

import React from 'react';

import {Preferences, Sso} from '@constants';
import SsoOptions from '@screens/login/sso_options';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import {WEAVER_SSO_ICON} from '../images';

const support = require('./weaver_test_support.cjs');

const theme = Preferences.THEMES.denim;

const renderSso = (ssoOptions: SsoWithOptions, locale = 'en') => renderWithIntlAndTheme(
    <SsoOptions
        goToSso={jest.fn()}
        ssoOnly={false}
        ssoOptions={ssoOptions}
        theme={theme}
    />,
    {locale},
);

describe('sso_options.tsx（C-2）', () => {
    it('UT-66 gitlab（en）: ボタン文字は Log in with Weaver。画面に GitLab が無い', () => {
        const r = renderSso({[Sso.GITLAB]: {enabled: true}});
        expect(r.getByText('Log in with Weaver')).toBeTruthy();
        expect(r.queryByText(/GitLab/i)).toBeNull();
        expect(support.textNodes(r.toJSON()).join('|')).not.toMatch(/gitlab/i);
    });

    it('UT-67 gitlab（ja）: ボタン文字は Weaverでログイン', () => {
        const r = renderSso({[Sso.GITLAB]: {enabled: true}}, 'ja');
        expect(r.getByText('Weaverでログイン')).toBeTruthy();
    });

    it('UT-68 ボタンの画像は WEAVER_SSO_ICON。ソースに Icon_Gitlab と GitLab のリテラルが無い', () => {
        const r = renderSso({[Sso.GITLAB]: {enabled: true}});
        expect(r.UNSAFE_root.findAll((n) => Boolean(n.props) && n.props.source === WEAVER_SSO_ICON).length).toBeGreaterThan(0);
        const src: string = support.stripComments(support.read('app/screens/login/sso_options.tsx'));
        expect(src).not.toContain('Icon_Gitlab');
        expect(src).not.toMatch(/['"]GitLab['"]/);
    });

    it('UT-70 gitlab と google を同時に有効: 文字の順は Log in with Weaver, Google。行並び（row）の既存挙動のまま', () => {
        const r = renderSso({[Sso.GITLAB]: {enabled: true}, [Sso.GOOGLE]: {enabled: true}});
        expect(support.textNodes(r.toJSON())).toEqual(['Log in with Weaver', 'Google']);
        expect(r.UNSAFE_root.findAll((n) => Boolean(n.props) && support.flattenStyle(n.props.style).flexDirection === 'row').length).toBeGreaterThan(0);
    });
});
