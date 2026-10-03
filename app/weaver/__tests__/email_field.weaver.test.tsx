// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループH（UT-74・UT-75・UT-78）: プロフィール編集 email_field.tsx（C-8）
// gitlab 互換のユーザーには「Login occurs through Weaver.」（APP_NAME）。GitLab の文字は出さない。

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

describe('email_field.tsx（C-8）', () => {
    it('UT-74 authService=gitlab（en）: Login occurs through Weaver. を含み GitLab を含まない', () => {
        const d = description(renderEmail('gitlab'));
        expect(d).toContain('Login occurs through Weaver.');
        expect(d).not.toMatch(/gitlab/i);
    });

    it('UT-75 authService=gitlab（ja）: Weaver を含み GitLab を含まない', () => {
        const d = description(renderEmail('gitlab', 'ja'));
        expect(d).toContain('Weaver');
        expect(d).not.toMatch(/gitlab/i);
    });

    it('UT-78 ソース静的: GitLab の文字列リテラルが0件', () => {
        const src: string = support.stripComments(support.read('app/screens/edit_profile/components/email_field.tsx'));
        expect(src).not.toMatch(/['"`]GitLab['"`]/);
    });
});
