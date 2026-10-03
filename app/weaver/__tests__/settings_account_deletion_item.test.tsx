// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループI（UT-79〜UT-82）: app/weaver/components/settings_account_deletion_item.tsx（C-5 の導線）
// SettingItem(optionName='about'・label・icon='account-outline')。headerTitle は label と同じ文字列。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import SettingItem from '@components/settings/item';
import {Screens} from '@constants';
import {navigateToSettingsScreen} from '@screens/navigation';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import WeaverSettingsAccountDeletionItem from '../components/settings_account_deletion_item';

const support = require('./weaver_test_support.cjs');

jest.mock('@screens/navigation', () => ({navigateToSettingsScreen: jest.fn(), navigateBack: jest.fn()}));

// 本物の SettingItem を包んで、渡された props を記録する
jest.mock('@components/settings/item', () => {
    const actual = jest.requireActual('@components/settings/item');
    const mockReact = require('react');
    return {
        __esModule: true,
        default: jest.fn((props: object) => mockReact.createElement(actual.default, props)),
    };
});

describe('WeaverSettingsAccountDeletionItem', () => {
    it('UT-79 ja: testID settings.account_deletion.option・ラベルはアカウントの削除について', () => {
        const r = renderWithIntlAndTheme(<WeaverSettingsAccountDeletionItem/>, {locale: 'ja'});
        expect(r.getByTestId('settings.account_deletion.option')).toBeTruthy();
        expect(support.nodeText(support.findByTestId(r.toJSON(), 'settings.account_deletion.option.label')[0])).toBe('アカウントの削除について');
    });

    it('UT-80 en: ラベルは About account deletion', () => {
        const r = renderWithIntlAndTheme(<WeaverSettingsAccountDeletionItem/>);
        expect(support.nodeText(support.findByTestId(r.toJSON(), 'settings.account_deletion.option.label')[0])).toBe('About account deletion');
    });

    it.each([['ja', 'アカウントの削除について'], ['en', 'About account deletion']])('UT-81 %s: 押すと navigateToSettingsScreen(account_deletion, {headerTitle: ラベル}) が1回', (locale, label) => {
        const r = renderWithIntlAndTheme(<WeaverSettingsAccountDeletionItem/>, {locale});
        fireEvent.press(r.getByTestId('settings.account_deletion.option'));
        expect(navigateToSettingsScreen).toHaveBeenCalledTimes(1);
        expect(navigateToSettingsScreen).toHaveBeenCalledWith('account_deletion', {headerTitle: label});
        expect((Screens as Record<string, unknown>).ACCOUNT_DELETION).toBe('account_deletion');
    });

    it('UT-82 SettingItem に icon=account-outline・optionName=about が渡される', () => {
        renderWithIntlAndTheme(<WeaverSettingsAccountDeletionItem/>);
        const calls = (SettingItem as unknown as jest.Mock).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0][0]).toEqual(expect.objectContaining({icon: 'account-outline', optionName: 'about', testID: 'settings.account_deletion.option'}));
    });
});
