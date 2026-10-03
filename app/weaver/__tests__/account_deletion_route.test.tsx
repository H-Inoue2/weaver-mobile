// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループJ（UT-101）: app/routes/(modals)/(settings)/account_deletion.tsx（about ルートと同型）
// headerTitle を usePropsFromParams で読み、useNavigationHeader({showWhenPushed: true, headerOptions: {headerTitle, ...}}) に渡して案内画面を描画する。

import React from 'react';

import {useNavigationHeader} from '@hooks/navigation_header';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import AccountDeletionRoute from '../../routes/(modals)/(settings)/account_deletion';

jest.mock('@hooks/navigation_header', () => ({
    useNavigationHeader: jest.fn(),
    getHeaderOptions: jest.fn(() => ({})),
}));
jest.mock('@hooks/props_from_params', () => ({usePropsFromParams: jest.fn(() => ({headerTitle: 'X'}))}));
jest.mock('../screens/account_deletion', () => {
    const mockReact = require('react');
    const {Text: MockText} = require('react-native');
    return {__esModule: true, default: () => mockReact.createElement(MockText, {testID: 'mock.account_deletion_screen'}, 'screen')};
});

describe('account_deletion ルート', () => {
    it('UT-101 headerTitle=X で描画: useNavigationHeader が showWhenPushed=true・headerOptions.headerTitle=X で呼ばれ、案内画面本体が描画される', () => {
        const r = renderWithIntlAndTheme(<AccountDeletionRoute/>);
        expect(useNavigationHeader).toHaveBeenCalledWith(expect.objectContaining({
            showWhenPushed: true,
            headerOptions: expect.objectContaining({headerTitle: 'X'}),
        }));
        expect(r.queryByTestId('mock.account_deletion_screen')).not.toBeNull();
    });
});
