// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループI（UT-83〜UT-86）: 設定画面 settings.tsx の差し込み（C-5）
// About の直下に削除案内の項目。help は削除案内の後。既存4項目の遷移は不変。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import {Screens} from '@constants';
import {navigateToSettingsScreen} from '@screens/navigation';
import Settings from '@screens/settings/settings';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

const support = require('./weaver_test_support.cjs');

jest.mock('@screens/navigation', () => ({navigateToSettingsScreen: jest.fn(), navigateBack: jest.fn()}));
jest.mock('@actions/remote/command', () => ({handleGotoLocation: jest.fn()}));
jest.mock('@hooks/android_back_handler', () => ({__esModule: true, default: jest.fn()}));
jest.mock('@screens/settings/report_problem', () => ({__esModule: true, default: () => null}));

const optionIds = (r: ReturnType<typeof renderWithIntlAndTheme>): string[] => {
    const ids: string[] = support.allTestIds(r.toJSON()).filter((id: string) => (/^settings\.[a-z_]+\.option$/).test(id));
    return ids.filter((id, i) => ids.indexOf(id) === i);
};

const renderSettings = (props: Partial<React.ComponentProps<typeof Settings>> = {}) => renderWithIntlAndTheme(
    <Settings
        helpLink=''
        showHelp={false}
        siteName='MySite'
        {...props}
    />,
);

describe('settings.tsx（C-5）', () => {
    it('UT-83 showHelp=false: 項目の並びは About の直下に account_deletion', () => {
        expect(optionIds(renderSettings())).toEqual([
            'settings.notifications.option',
            'settings.display.option',
            'settings.advanced_settings.option',
            'settings.about.option',
            'settings.account_deletion.option',
        ]);
    });

    it('UT-84 showHelp=true: help は削除案内の後', () => {
        expect(optionIds(renderSettings({showHelp: true, helpLink: 'https://help.example'}))).toEqual([
            'settings.notifications.option',
            'settings.display.option',
            'settings.advanced_settings.option',
            'settings.about.option',
            'settings.account_deletion.option',
            'settings.help.option',
        ]);
    });

    it('UT-85 既存4項目を押すと従来の画面IDで navigateToSettingsScreen が呼ばれる', () => {
        const r = renderSettings();
        const nav = navigateToSettingsScreen as jest.Mock;
        fireEvent.press(r.getByTestId('settings.notifications.option'));
        expect(nav).toHaveBeenLastCalledWith(Screens.SETTINGS_NOTIFICATION);
        fireEvent.press(r.getByTestId('settings.display.option'));
        expect(nav).toHaveBeenLastCalledWith(Screens.SETTINGS_DISPLAY);
        fireEvent.press(r.getByTestId('settings.about.option'));
        expect(nav).toHaveBeenLastCalledWith(Screens.ABOUT, {headerTitle: 'About MySite'});
        fireEvent.press(r.getByTestId('settings.advanced_settings.option'));
        expect(nav).toHaveBeenLastCalledWith(Screens.SETTINGS_ADVANCED);
        expect(nav).toHaveBeenCalledTimes(4);
    });

    it('UT-86 siteName が空文字でも削除案内の項目は表示される（全員に表示）', () => {
        const r = renderSettings({siteName: ''});
        expect(r.queryByTestId('settings.account_deletion.option')).not.toBeNull();
    });
});
