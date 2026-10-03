// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// 結合テスト（IT-08）: 設定の項目 → ルート → 案内画面の導線（IT-09 は workflow_guard_step.test.ts）

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import {useNavigationHeader} from '@hooks/navigation_header';
import {navigateToSettingsScreen} from '@screens/navigation';
import Settings from '@screens/settings/settings';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import AccountDeletionRoute from '../../routes/(modals)/(settings)/account_deletion';

const support = require('./weaver_test_support.cjs');

jest.mock('@screens/navigation', () => ({navigateToSettingsScreen: jest.fn(), navigateBack: jest.fn()}));
jest.mock('@actions/remote/command', () => ({handleGotoLocation: jest.fn()}));
jest.mock('@hooks/android_back_handler', () => ({__esModule: true, default: jest.fn()}));
jest.mock('@screens/settings/report_problem', () => ({__esModule: true, default: () => null}));
jest.mock('@hooks/navigation_header', () => ({useNavigationHeader: jest.fn(), getHeaderOptions: jest.fn(() => ({}))}));
jest.mock('@hooks/props_from_params', () => ({usePropsFromParams: jest.fn(() => (global as unknown as Record<string, unknown>).__weaverRouteParams || {})}));

describe('導線の結合（IT-08）', () => {
    it('IT-08 Settings の項目を押す → 受け取った引数でルートを描画 → ヘッダーが同じ headerTitle、本文に ja の導入文が出る', () => {
        const settings = renderWithIntlAndTheme(
            <Settings
                helpLink=''
                showHelp={false}
                siteName='MySite'
            />,
            {locale: 'ja'},
        );
        fireEvent.press(settings.getByTestId('settings.account_deletion.option'));
        const nav = navigateToSettingsScreen as jest.Mock;
        expect(nav).toHaveBeenCalledTimes(1);
        const [screen, params] = nav.mock.calls[0];
        expect(screen).toBe('account_deletion');
        expect(params).toEqual({headerTitle: 'アカウントの削除について'});

        (global as unknown as Record<string, unknown>).__weaverRouteParams = params;
        const route = renderWithIntlAndTheme(<AccountDeletionRoute/>, {locale: 'ja'});
        expect(useNavigationHeader).toHaveBeenCalledWith(expect.objectContaining({
            showWhenPushed: true,
            headerOptions: expect.objectContaining({headerTitle: 'アカウントの削除について'}),
        }));
        const lead: string = support.nodeText(support.findByTestId(route.toJSON(), 'account_deletion.lead')[0]);
        expect(lead.split('\n')[0]).toBe('このアプリのアカウントは、ご所属の組織のWeaver（Redmine）アカウントです。');
    });
});
