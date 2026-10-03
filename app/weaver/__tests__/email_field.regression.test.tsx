// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループH（回帰・実装前から通る）: UT-76・UT-77
// email_field.tsx の差し込み（C-8）が、他の認証サービスと「サービス表に無い場合」の表示を壊していないことの確認。
// Weaver の新規モジュールを import しない。

import React from 'react';

import {Preferences} from '@constants';
import EmailField from '@screens/edit_profile/components/email_field';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

const support = require('./weaver_test_support.cjs');

const renderEmail = (authService: string, locale = 'en') => renderWithIntlAndTheme(
    <EmailField
        authService={authService}
        email='user@example.com'
        fieldRef={React.createRef<never>()}
        onChange={jest.fn()}
        onFocusNextField={jest.fn()}
        isDisabled={false}
        label='Email'
        theme={Preferences.THEMES.denim}
        isTablet={false}
    />,
    {locale},
);

const description = (r: ReturnType<typeof renderEmail>) => support.nodeText(support.findByTestId(r.toJSON(), 'edit_profile_form.email.input.description')[0]);

describe('email_field.tsx の回帰', () => {
    it.each([
        ['google', 'Login occurs through Google Apps.'],
        ['office365', 'Login occurs through Entra ID.'],
        ['ldap', 'Login occurs through AD/LDAP.'],
        ['saml', 'Login occurs through SAML.'],
    ])('UT-76 %s の説明に「%s」を含む（従来どおり）', (service, expected) => {
        expect(description(renderEmail(service))).toContain(expected);
    });

    it.each(['', 'unknown'])('UT-77 authService=%p は web client の説明（サービス表に無い場合）', (service) => {
        expect(description(renderEmail(service))).toBe('Email must be updated using a web client or desktop application.');
    });
});
