// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループL（UT-107・UT-108・UT-241・UT-242。UT-111・UT-112 の静的検査は upstream_checks.test.ts）: 通知設定画面のリンク（C-10）
// NOTIFICATION_HELP_URL が空 → 「Troubleshooting docs」ボタンを出さず、本文を weaver.notification_notice.body_no_docs に差し替える。
// 値あり → ボタンあり。押すと tryOpenURL(値) が1引数で呼ばれ、uid・sid・utm_ は付かない。本文は従来のまま。
// UT-109（10.3 未満は null）・UT-110（テスト通知の送信）の回帰は、既存の send_test_notification_notice.test.tsx が担う（EX-1 の追随後も残す）。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import {renderWithEverything} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';
import {tryOpenURL} from '@utils/url';

import SendTestNotificationNotice from '../../screens/settings/notifications/send_test_notification_notice/send_test_notification_notice';

import type Database from '@nozbe/watermelondb/Database';

const support = require('./weaver_test_support.cjs');
const {JA, EN} = require('./expected_messages.cjs') as {JA: Record<string, string>; EN: Record<string, string>};

jest.mock('@utils/url', () => ({tryOpenURL: jest.fn()}));
jest.mock('@actions/remote/notifications', () => ({sendTestNotification: jest.fn()}));
jest.mock('@utils/log', () => ({logError: jest.fn(), logInfo: jest.fn()}));
jest.mock('../constants', () => require('./weaver_test_support.cjs').constantsMockModule(jest.requireActual('../constants')));

const ORIGINAL_BODY = 'Not receiving notifications? Start by sending a test notification to all your devices to check if they’re working as expected. If issues persist, explore ways to solve them with troubleshooting steps.';
const HELP = 'https://help.example.com/notify';
const props = {serverVersion: '10.3.0', telemetryId: 'someId', userId: 'someUserId', isCloud: true};

describe('SendTestNotificationNotice（C-10）', () => {
    let database: Database;

    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase();
        database = server.database;
    });

    beforeEach(() => {
        Object.keys(support.constOverrides).forEach((k) => delete support.constOverrides[k]);
    });

    it('UT-107 NOTIFICATION_HELP_URL が空: Troubleshooting docs が無い。送信ボタンと見出しはある', () => {
        support.constOverrides.NOTIFICATION_HELP_URL = '';
        const r = renderWithEverything(<SendTestNotificationNotice {...props}/>, {database});
        expect(r.queryByText('Troubleshooting docs')).toBeNull();
        expect(r.queryByText('Send a test notification')).not.toBeNull();
        expect(r.queryByText('Troubleshooting notifications')).not.toBeNull();
    });

    it('UT-108 値あり: ボタンがあり、押すと tryOpenURL が値と完全一致の1引数で1回。uid・sid・utm_ を含まない', () => {
        support.constOverrides.NOTIFICATION_HELP_URL = HELP;
        const r = renderWithEverything(<SendTestNotificationNotice {...props}/>, {database});
        fireEvent.press(r.getByText('Troubleshooting docs'));
        expect(tryOpenURL).toHaveBeenCalledTimes(1);
        expect(tryOpenURL).toHaveBeenCalledWith(HELP);
        const url = (tryOpenURL as jest.Mock).mock.calls[0][0] as string;
        expect(url).not.toMatch(/uid=|sid=|utm_|someUserId|someId/);
    });

    it('UT-241 空のとき本文は body_no_docs（en）に差し替わり、手順（troubleshooting steps）に言及しない', () => {
        support.constOverrides.NOTIFICATION_HELP_URL = '';
        const r = renderWithEverything(<SendTestNotificationNotice {...props}/>, {database});
        expect(r.queryByText(EN['weaver.notification_notice.body_no_docs'])).not.toBeNull();
        expect(r.queryByText(ORIGINAL_BODY)).toBeNull();
        expect(r.queryByText(/troubleshooting steps/)).toBeNull();
    });

    it('UT-242 空のとき ja では body_no_docs（ja）。値ありのときは従来の本文のまま（body_no_docs は出ない）', () => {
        support.constOverrides.NOTIFICATION_HELP_URL = '';
        const ja = renderWithEverything(<SendTestNotificationNotice {...props}/>, {database, locale: 'ja'});
        expect(ja.queryByText(JA['weaver.notification_notice.body_no_docs'])).not.toBeNull();

        support.constOverrides.NOTIFICATION_HELP_URL = HELP;
        const en = renderWithEverything(<SendTestNotificationNotice {...props}/>, {database});
        expect(en.queryByText(ORIGINAL_BODY)).not.toBeNull();
        expect(en.queryByText(EN['weaver.notification_notice.body_no_docs'])).toBeNull();
    });
});
