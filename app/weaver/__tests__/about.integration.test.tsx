// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// 結合テスト（IT-02・IT-03・IT-04・IT-07）: About 画面（C-1・C-3）。Weaver の差し込み後の画面全体を描画する。
// 帰属表記・既存表示の不変（IT-01・IT-05・IT-06）は about.regression.integration.test.tsx。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import About from '@screens/settings/about/about';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import {tryOpenURL} from '@utils/url';

import {WEAVER_LOGO} from '../images';

const support = require('./weaver_test_support.cjs');

jest.mock('expo-application', () => ({
    applicationId: 'com.met-architect.Weaver',
    nativeApplicationVersion: '2.45.0',
    nativeBuildVersion: '7',
}));
jest.mock('@actions/remote/license', () => ({getLicenseLoadMetric: jest.fn(() => Promise.resolve(null))}));
jest.mock('@utils/url', () => ({tryOpenURL: jest.fn()}));
jest.mock('@screens/navigation', () => ({navigateBack: jest.fn()}));
jest.mock('@hooks/android_back_handler', () => ({__esModule: true, default: jest.fn()}));
jest.mock('@hooks/device', () => ({
    ...jest.requireActual('@hooks/device'),
    useIsTablet: jest.fn(() => (global as unknown as Record<string, unknown>).__weaverTablet === true),
}));
jest.mock('../constants', () => require('./weaver_test_support.cjs').constantsMockModule(jest.requireActual('../constants')));

const g = global as unknown as Record<string, unknown>;

const PRIVACY = 'https://weaver.example/privacy';
const TERMS = 'https://weaver.example/terms';

type R = ReturnType<typeof renderWithIntlAndTheme>;
const textOf = (r: R, id: string) => support.nodeText(support.findByTestId(r.toJSON(), id)[0]);
const renderAbout = (config: Record<string, unknown> = {}, license?: Partial<ClientLicense>) => renderWithIntlAndTheme(
    <About
        config={support.makeAboutConfig(config) as ClientConfig}
        license={license as ClientLicense}
    />,
);

describe('About 画面（Weaver 差し込み後）', () => {
    beforeEach(() => {
        Object.keys(support.constOverrides).forEach((k) => delete support.constOverrides[k]);
        support.constOverrides.PRIVACY_POLICY_URL = PRIVACY;
        support.constOverrides.TERMS_OF_SERVICE_URL = TERMS;
        g.__weaverTablet = false;
    });

    it('IT-02 エディション3種（Team／Enterprise未ライセンス／ライセンス済み）: いずれも about.title=Weaver。Licensed to は3つ目だけ', () => {
        const team = renderAbout({BuildEnterpriseReady: 'false'});
        const ent = renderAbout({BuildEnterpriseReady: 'true'}, {IsLicensed: 'false'});
        const lic = renderAbout({BuildEnterpriseReady: 'true'}, {IsLicensed: 'true', Company: 'ACME', SkuShortName: 'enterprise'});
        for (const r of [team, ent, lic]) {
            expect(textOf(r, 'about.title').trim()).toBe('Weaver');
        }
        expect(team.queryByTestId('about.licensee')).toBeNull();
        expect(ent.queryByTestId('about.licensee')).toBeNull();
        expect(textOf(lic, 'about.licensee')).toBe('Licensed to: ACME');
    });

    it.each(['', 'https://server.example/p'])('IT-03 サーバー設定 TermsOfServiceLink・PrivacyPolicyLink=%p: リンクは常に出て、タップ先は定数の値（サーバー値では呼ばれない）', (serverValue) => {
        const r = renderAbout({TermsOfServiceLink: serverValue, PrivacyPolicyLink: serverValue});
        expect(r.queryByTestId('about.terms_of_service')).not.toBeNull();
        expect(r.queryByTestId('about.privacy_policy')).not.toBeNull();
        fireEvent.press(r.getByTestId('about.privacy_policy'));
        fireEvent.press(r.getByTestId('about.terms_of_service'));
        const urls = (tryOpenURL as jest.Mock).mock.calls.map((c) => c[0]);
        expect(urls).toContain(PRIVACY);
        expect(urls).toContain(TERMS);
        expect(urls).not.toContain('https://server.example/p');
    });

    it.each([
        ['Team', {BuildEnterpriseReady: 'false'}, undefined],
        ['Enterprise', {BuildEnterpriseReady: 'true'}, {IsLicensed: 'false'}],
    ])('IT-04 %s: about.learn_more.url・text が無く、Mattermost 社の宣伝文が出ない', (_name, config, license) => {
        const r = renderAbout(config as Record<string, unknown>, license as Partial<ClientLicense> | undefined);
        expect(r.queryByTestId('about.learn_more.url')).toBeNull();
        expect(r.queryByTestId('about.learn_more.text')).toBeNull();
        const all: string = support.textNodes(r.toJSON()).join('\n');
        expect(all).not.toMatch(/Join the Mattermost community|Learn more about/);
        expect(tryOpenURL).not.toHaveBeenCalledWith('https://mattermost.com');
    });

    it('IT-07 useIsTablet=true で描画: 例外なし。about.logo が画像で描画される', () => {
        g.__weaverTablet = true;
        let r: R | undefined;
        expect(() => {
            r = renderAbout();
        }).not.toThrow();
        expect((r as R).UNSAFE_root.findAll((n) => Boolean(n.props) && n.props.source === WEAVER_LOGO).length).toBeGreaterThan(0);
        expect(support.findByTestId((r as R).toJSON(), 'about.logo').length).toBeGreaterThan(0);
    });
});
