// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループM（UT-113〜UT-119, UT-121）: 「問題を報告」の既定の宛先（C-11）
// 既定のリンク ＝ SUPPORT_URL（有償・無償で同じ。空なら空文字で Mattermost 社の URL に戻らない）。
// 件名の既定 ＝ APP_NAME（siteName が空・未指定のとき）。DEFAULT_REPORT_A_PROBLEM_EMAIL は export 名を維持し値を REPORT_A_PROBLEM_EMAIL に。
// UT-120（siteName='My Site' の従来動作）と UT-122 の静的検査は、既存の share_logs.test.ts と upstream_checks.test.ts が担う。

import TurboLogger from '@mattermost/react-native-turbo-log';
import Share from 'react-native-share';

import {getDefaultReportAProblemLink, shareLogs, emailLogs} from '@utils/share_logs';

const support = require('./weaver_test_support.cjs');

jest.mock('react-native-share', () => ({
    open: jest.fn(),
    shareSingle: jest.fn(),
    Social: {EMAIL: 'email'},
}));
jest.mock('react-native/Libraries/Alert/Alert', () => ({alert: jest.fn()}));
jest.mock('../constants', () => require('./weaver_test_support.cjs').constantsMockModule(jest.requireActual('../constants')));

const metadata = {
    currentUserId: 'user1',
    currentTeamId: 'team1',
    serverVersion: '1.0.0',
    appVersion: '2.0.0',
    appPlatform: 'ios',
    deviceModel: 'iPhone 14',
};
const SUBJECT = 'Problem with Weaver mobile app';

describe('share_logs.ts（C-11）', () => {
    beforeEach(() => {
        Object.keys(support.constOverrides).forEach((k) => delete support.constOverrides[k]);
        jest.mocked(TurboLogger.getLogPaths).mockResolvedValue([]);
    });

    it.each([true, false])('UT-113・114 SUPPORT_URL を設定して getDefaultReportAProblemLink(%s) は SUPPORT_URL（有償・無償で同じ）', (licensed) => {
        support.constOverrides.SUPPORT_URL = 'https://support.example/s';
        expect(getDefaultReportAProblemLink(licensed)).toBe('https://support.example/s');
    });

    it.each([true, false])('UT-115 SUPPORT_URL が空: getDefaultReportAProblemLink(%s) は空文字（Mattermost 社の URL に戻らない）', (licensed) => {
        support.constOverrides.SUPPORT_URL = '';
        expect(getDefaultReportAProblemLink(licensed)).toBe('');
    });

    it.each([undefined, ''])('UT-116・117 shareLogs: siteName=%p の件名は Problem with Weaver mobile app', async (siteName) => {
        await shareLogs(metadata, siteName, 'support@example.com');
        expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({subject: SUBJECT}));
    });

    it.each([undefined, ''])('UT-118・119 emailLogs: siteName=%p の件名は Problem with Weaver mobile app', async (siteName) => {
        await emailLogs(metadata, siteName, 'support@example.com');
        expect(Share.shareSingle).toHaveBeenCalledWith(expect.objectContaining({subject: SUBJECT}));
    });

    it('UT-121 DEFAULT_REPORT_A_PROBLEM_EMAIL は export 名を維持し、値は REPORT_A_PROBLEM_EMAIL（mock 値 support@example.com）', () => {
        support.constOverrides.REPORT_A_PROBLEM_EMAIL = 'support@example.com';
        let mod: Record<string, unknown> = {};
        jest.isolateModules(() => {
            mod = require('@constants/report_a_problem');
        });
        expect(mod.DEFAULT_REPORT_A_PROBLEM_EMAIL).toBe('support@example.com');
    });
});
