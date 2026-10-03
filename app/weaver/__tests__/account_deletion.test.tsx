// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループJ（UT-90〜UT-100, UT-102, UT-240）: app/weaver/screens/account_deletion.tsx（C-5 の案内画面）
// testID は文言キーから "weaver." を除いたもの（詳細設計 §3.0 描画規約）。
// 実際の描画上、SettingContainer の root は `account_deletion.screen`／`.scroll_view`（SettingContainer が testID に接尾辞を付ける）。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {navigateBack} from '@screens/navigation';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import {tryOpenURL} from '@utils/url';
import {onOpenLinkError} from '@utils/url/links';

import AccountDeletionScreen from '../screens/account_deletion';

const support = require('./weaver_test_support.cjs');
const {KEYS, JA, EN} = require('./expected_messages.cjs') as {KEYS: string[]; JA: Record<string, string>; EN: Record<string, string>};

jest.mock('@utils/url', () => ({tryOpenURL: jest.fn()}));
jest.mock('@utils/url/links', () => ({onOpenLinkError: jest.fn()}));
jest.mock('@screens/navigation', () => ({navigateBack: jest.fn(), navigateToSettingsScreen: jest.fn()}));
jest.mock('@hooks/android_back_handler', () => ({__esModule: true, default: jest.fn()}));
jest.mock('../constants', () => require('./weaver_test_support.cjs').constantsMockModule(jest.requireActual('../constants')));

const SUPPORT = 'https://support.example/weaver';
const DETAIL = 'https://weaver.example/account-deletion';
const PRIVACY = 'https://weaver.example/privacy';

const TEXT_KEYS = KEYS.filter((k) => k.startsWith('weaver.account_deletion.') &&
    !['support_button', 'link.detail', 'link.privacy'].some((s) => k.endsWith(s)));
const tid = (key: string) => key.replace(/^weaver\./, '');

const setUrls = (supportUrl: string, detail: string, privacy: string) => {
    support.constOverrides.SUPPORT_URL = supportUrl;
    support.constOverrides.ACCOUNT_DELETION_URL = detail;
    support.constOverrides.PRIVACY_POLICY_URL = privacy;
};
type R = ReturnType<typeof renderWithIntlAndTheme>;
const textOf = (r: R, id: string): string | undefined => {
    const n = support.findByTestId(r.toJSON(), id)[0];
    return n === undefined ? undefined : support.nodeText(n);
};
const mockTry = tryOpenURL as jest.Mock;

describe('AccountDeletionScreen', () => {
    beforeEach(() => {
        Object.keys(support.constOverrides).forEach((k) => delete support.constOverrides[k]);
        setUrls(SUPPORT, DETAIL, PRIVACY);
    });

    it('UT-90 ja: 各 testID の文字が messages の ja 値と完全一致。ボタン・表題・リンクも', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>, {locale: 'ja'});
        expect(TEXT_KEYS).toHaveLength(13);
        for (const key of TEXT_KEYS) {
            expect({id: tid(key), text: textOf(r, tid(key))}).toEqual({id: tid(key), text: JA[key]});
        }
        expect(textOf(r, 'account_deletion.support_button')).toBe('サポート窓口を開く');
        expect(textOf(r, 'account_deletion.title')).toBe('アカウントの削除について');
        expect(textOf(r, 'account_deletion.link.detail')).toBe('詳細');
        expect(textOf(r, 'account_deletion.link.privacy')).toBe('プライバシーポリシー');
        expect(r.queryByTestId('account_deletion.screen')).not.toBeNull();
    });

    it('UT-91 en: 同じ testID の文字が en 値と完全一致', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>);
        for (const key of TEXT_KEYS) {
            expect({id: tid(key), text: textOf(r, tid(key))}).toEqual({id: tid(key), text: EN[key]});
        }
        expect(textOf(r, 'account_deletion.support_button')).toBe('Open the support page');
        expect(textOf(r, 'account_deletion.link.detail')).toBe('Details');
        expect(textOf(r, 'account_deletion.link.privacy')).toBe('Privacy policy');
    });

    it('UT-92 ACCOUNT_DELETION_URL・PRIVACY_POLICY_URL が空: link.detail・link.privacy が無い。他は表示される', () => {
        setUrls(SUPPORT, '', '');
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>);
        expect(r.queryByTestId('account_deletion.link.detail')).toBeNull();
        expect(r.queryByTestId('account_deletion.link.privacy')).toBeNull();
        expect(r.queryByTestId('account_deletion.lead')).not.toBeNull();
        expect(r.queryByTestId('account_deletion.support_button')).not.toBeNull();
        expect(r.queryByTestId('account_deletion.device.body')).not.toBeNull();
    });

    it('UT-93 link.detail・link.privacy を押すと tryOpenURL が1回ずつ、第1引数は各定数の値、第2引数は関数', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>);
        fireEvent.press(r.getByTestId('account_deletion.link.detail'));
        expect(mockTry).toHaveBeenCalledTimes(1);
        expect(mockTry.mock.calls[0][0]).toBe(DETAIL);
        expect(typeof mockTry.mock.calls[0][1]).toBe('function');
        fireEvent.press(r.getByTestId('account_deletion.link.privacy'));
        expect(mockTry).toHaveBeenCalledTimes(2);
        expect(mockTry.mock.calls[1][0]).toBe(PRIVACY);
        expect(typeof mockTry.mock.calls[1][1]).toBe('function');
    });

    it('UT-94 SUPPORT_URL が空: support_button が無い。how.step2（下のボタン）は存在する', () => {
        setUrls('', DETAIL, PRIVACY);
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>, {locale: 'ja'});
        expect(r.queryByTestId('account_deletion.support_button')).toBeNull();
        expect(textOf(r, 'account_deletion.how.step2')).toContain('Weaverサポートへご連絡ください（下のボタン）。');
    });

    it('UT-95 ボタンを押すと tryOpenURL が1回、第1引数は SUPPORT_URL、第2引数は関数', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>);
        fireEvent.press(r.getByTestId('account_deletion.support_button'));
        expect(mockTry).toHaveBeenCalledTimes(1);
        expect(mockTry.mock.calls[0][0]).toBe(SUPPORT);
        expect(typeof mockTry.mock.calls[0][1]).toBe('function');
    });

    it('UT-96 ボタンの tryOpenURL の第2引数を呼ぶと onOpenLinkError が呼ばれる', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>);
        fireEvent.press(r.getByTestId('account_deletion.support_button'));
        mockTry.mock.calls[0][1]();
        expect(onOpenLinkError).toHaveBeenCalledTimes(1);
        expect((onOpenLinkError as jest.Mock).mock.calls[0][0]).toEqual(expect.objectContaining({formatMessage: expect.any(Function)}));
    });

    it('UT-97 ロケール fr は英語で表示', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>, {locale: 'fr'});
        expect(textOf(r, 'account_deletion.how.title')).toBe('How to request deletion');
        expect(textOf(r, 'account_deletion.title')).toBe('About account deletion');
    });

    it('UT-98 通信なし: ソースが @actions/・@database を import せず、描画中に fetch が呼ばれない', () => {
        const src: string = support.read('app/weaver/screens/account_deletion.tsx');
        expect(src).not.toMatch(/from\s+['"]@actions\//);
        expect(src).not.toMatch(/from\s+['"]@database/);
        const g = global as unknown as Record<string, unknown>;
        const original = g.fetch;
        const spy = jest.fn();
        g.fetch = spy;
        try {
            renderWithIntlAndTheme(<AccountDeletionScreen/>);
        } finally {
            g.fetch = original;
        }
        expect(spy).not.toHaveBeenCalled();
    });

    it('UT-99 Android の戻る: useAndroidHardwareBackHandler(account_deletion, navigateBack) が登録される', () => {
        renderWithIntlAndTheme(<AccountDeletionScreen/>);
        expect(useAndroidHardwareBackHandler).toHaveBeenCalledWith('account_deletion', navigateBack);
    });

    it('UT-100 データベース・サーバー接続の無い状態（DatabaseProvider なし）で例外なく描画できる', () => {
        expect(() => renderWithIntlAndTheme(<AccountDeletionScreen/>)).not.toThrow();
    });

    it.each(['ja', 'en'])('UT-102 画面の全表示テキスト（%s）: Mattermost・GitLab・【】・⟦⟧ を含まない（device.body の穴埋めを削除）', (locale) => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>, {locale});
        const all: string = support.textNodes(r.toJSON()).join('\n');
        expect(all).not.toMatch(/mattermost/i);
        expect(all).not.toMatch(/gitlab/i);
        expect(all).not.toMatch(/[【】]/);
        expect(all).not.toMatch(/[⟦⟧]/);
        expect(textOf(r, 'account_deletion.device.body')).not.toMatch(/[⟦⟧]/);
    });

    it('UT-240 表示順（運用設計 §7.1 の並び）: 表題・導入・依頼方法の見出し・手順1・手順2・注1・注2・処理内容・端末データ・詳細・プライバシー', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionScreen/>);
        const ids: string[] = support.allTestIds(r.toJSON());
        const order = ['title', 'lead', 'how.title', 'how.step1', 'how.step2', 'how.note1', 'how.note2', 'data.title', 'data.account', 'data.posts', 'data.workflow', 'device.title', 'device.body', 'link.detail', 'link.privacy'].map((x) => `account_deletion.${x}`);
        const positions = order.map((id) => ids.indexOf(id));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });
});
