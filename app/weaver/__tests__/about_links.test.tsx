// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループE（UT-51〜UT-61）: app/weaver/components/about_links.tsx（C-1）
// ラベルは既存キー mobile.tos_link／mobile.privacy_link（22言語に訳あり）。タップは tryOpenURL(url, onError)。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import {tryOpenURL} from '@utils/url';
import {onOpenLinkError} from '@utils/url/links';

import WeaverAboutLinks from '../components/about_links';

const support = require('./weaver_test_support.cjs');

jest.mock('@utils/url', () => ({tryOpenURL: jest.fn()}));
jest.mock('@utils/url/links', () => ({onOpenLinkError: jest.fn()}));
jest.mock('../constants', () => require('./weaver_test_support.cjs').constantsMockModule(jest.requireActual('../constants')));

const PRIVACY = 'https://weaver.example/privacy';
const TERMS = 'https://weaver.example/terms';

const setUrls = (privacy: string, terms: string) => {
    support.constOverrides.PRIVACY_POLICY_URL = privacy;
    support.constOverrides.TERMS_OF_SERVICE_URL = terms;
};
const texts = (r: ReturnType<typeof renderWithIntlAndTheme>): string[] => support.textNodes(r.toJSON());
const mockTry = tryOpenURL as jest.Mock;

describe('WeaverAboutLinks', () => {
    beforeEach(() => {
        Object.keys(support.constOverrides).forEach((k) => delete support.constOverrides[k]);
    });

    it('UT-51 両方に値（en）: 規約・区切り・プライバシーの順', () => {
        setUrls(PRIVACY, TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        expect(r.getByTestId('about.terms_of_service')).toHaveTextContent('Terms of Service');
        expect(r.getByTestId('about.privacy_policy')).toHaveTextContent('Privacy Policy');
        const t = texts(r);
        expect(t.filter((x) => x === ' - ')).toHaveLength(1);
        expect(t.filter((x) => x !== ' - ')).toEqual(['Terms of Service', 'Privacy Policy']);
        expect(t.indexOf('Terms of Service')).toBeLessThan(t.indexOf(' - '));
        expect(t.indexOf(' - ')).toBeLessThan(t.indexOf('Privacy Policy'));
    });

    it('UT-52 両方に値（ja）', () => {
        setUrls(PRIVACY, TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>, {locale: 'ja'});
        expect(r.getByTestId('about.terms_of_service')).toHaveTextContent('利用規約');
        expect(r.getByTestId('about.privacy_policy')).toHaveTextContent('プライバシーポリシー');
    });

    it('UT-53 PRIVACY_POLICY_URL のみ: プライバシーだけ。区切りなし', () => {
        setUrls(PRIVACY, '');
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        expect(r.getByTestId('about.privacy_policy')).toBeTruthy();
        expect(r.queryByTestId('about.terms_of_service')).toBeNull();
        expect(texts(r)).not.toContain(' - ');
    });

    it('UT-54 TERMS_OF_SERVICE_URL のみ: 規約だけ。区切りなし', () => {
        setUrls('', TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        expect(r.getByTestId('about.terms_of_service')).toBeTruthy();
        expect(r.queryByTestId('about.privacy_policy')).toBeNull();
        expect(texts(r)).not.toContain(' - ');
    });

    it('UT-55 両方空: 何も描画しない', () => {
        setUrls('', '');
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        expect(r.toJSON()).toBeNull();
    });

    it('UT-56 プライバシーをタップ: tryOpenURL(定数の値, 関数) が1回', () => {
        setUrls(PRIVACY, TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        fireEvent.press(r.getByTestId('about.privacy_policy'));
        expect(mockTry).toHaveBeenCalledTimes(1);
        expect(mockTry.mock.calls[0][0]).toBe(PRIVACY);
        expect(typeof mockTry.mock.calls[0][1]).toBe('function');
    });

    it('UT-57 規約をタップ: tryOpenURL(定数の値, 関数) が1回', () => {
        setUrls(PRIVACY, TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        fireEvent.press(r.getByTestId('about.terms_of_service'));
        expect(mockTry).toHaveBeenCalledTimes(1);
        expect(mockTry.mock.calls[0][0]).toBe(TERMS);
        expect(typeof mockTry.mock.calls[0][1]).toBe('function');
    });

    it('UT-58 失敗時の処理（第2引数）を呼ぶと onOpenLinkError が intl つきで1回呼ばれる', () => {
        setUrls(PRIVACY, TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        fireEvent.press(r.getByTestId('about.privacy_policy'));
        mockTry.mock.calls[0][1]();
        expect(onOpenLinkError).toHaveBeenCalledTimes(1);
        expect((onOpenLinkError as jest.Mock).mock.calls[0][0]).toEqual(expect.objectContaining({formatMessage: expect.any(Function)}));
    });

    it('UT-59 サーバー設定に依存しない（ソース静的。コメントを除く）', () => {
        const src: string = support.stripComments(support.read('app/weaver/components/about_links.tsx'));
        expect(src).not.toMatch(/TermsOfServiceLink|PrivacyPolicyLink|ClientConfig|@constants\/about_links/);
        expect(src).not.toMatch(/\bconfig\b/);
    });

    it('UT-60 フォールバック禁止（ソース静的。コメントを除き mattermost が0件）', () => {
        const src: string = support.codeOnly(support.read('app/weaver/components/about_links.tsx'));
        expect(src).not.toMatch(/mattermost/i);
    });

    it('UT-61 連打（usePreventDoubleTap の維持）: 続けて2回押しても tryOpenURL は1回', () => {
        setUrls(PRIVACY, TERMS);
        const r = renderWithIntlAndTheme(<WeaverAboutLinks/>);
        fireEvent.press(r.getByTestId('about.privacy_policy'));
        fireEvent.press(r.getByTestId('about.privacy_policy'));
        expect(mockTry).toHaveBeenCalledTimes(1);
    });
});
