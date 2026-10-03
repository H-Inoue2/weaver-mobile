// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループW（UT-291〜293）: ログのダウンロード・添付を、アプリ側で常に無効にする（井上さんの要望。実機テスト ビルド10の指摘G）
// 期待する新規モジュール:
//   app/weaver/allow_download_logs.ts
//     export const ALLOW_DOWNLOAD_LOGS = false;   // 1行書式（constants.ts と同じ）。サーバー値（AllowDownloadLogs）と AND にする
// 差し込み（既存3ファイルの observable。サーバーが AllowDownloadLogs=true でも、渡す値が false になる）:
//   app/screens/settings/report_problem/index.ts   → prop allowDownloadLogs
//   app/screens/report_a_problem/index.ts          → prop allowDownloadLogs
//   app/components/post_draft/quick_actions/index.ts → prop showAttachLogs（添付ログの設定が true でも false）
// 以下は、内側の画面を mock して渡された props を見る。実データベース（TestHelper）に AllowDownloadLogs='true' を入れて検査する。

import {waitFor} from '@testing-library/react-native';
import React from 'react';

import QuickActionsIndex from '@components/post_draft/quick_actions';
import QuickActionsInner from '@components/post_draft/quick_actions/quick_actions';
import {Preferences} from '@constants';
import ReportProblemScreenIndex from '@screens/report_a_problem';
import ReportProblemScreenInner from '@screens/report_a_problem/report_problem';
import SettingsReportProblemIndex from '@screens/settings/report_problem';
import SettingsReportProblemInner from '@screens/settings/report_problem/report_problem';
import {renderWithEverything} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import type Database from '@nozbe/watermelondb/Database';

const support = require('./weaver_test_support.cjs');

jest.mock('@screens/settings/report_problem/report_problem', () => ({__esModule: true, default: jest.fn(() => null)}));
jest.mock('@screens/report_a_problem/report_problem', () => ({__esModule: true, default: jest.fn(() => null)}));
jest.mock('@components/post_draft/quick_actions/quick_actions', () => ({__esModule: true, default: jest.fn(() => null)}));
jest.mock('@agents/queries/agents', () => {
    const {of} = require('rxjs');
    return {observeIsAgentsEnabled: jest.fn(() => of(false))};
});

const lastProps = (component: unknown): Record<string, unknown> | undefined => {
    const calls = (component as jest.Mock).mock.calls;
    return calls.length ? calls[calls.length - 1][0] : undefined;
};

describe('ログのダウンロード・添付の無効化（サーバーが true でも false）', () => {
    let database: Database;
    const serverUrl = 'https://allow-logs.example.com';

    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase(serverUrl);
        database = server.database;
        await server.operator.handleConfigs({
            configs: [{id: 'AllowDownloadLogs', value: 'true'}],
            configsToDelete: [],
            prepareRecordsOnly: false,
        });
        await server.operator.handlePreferences({
            preferences: [{category: Preferences.CATEGORIES.ADVANCED_SETTINGS, name: Preferences.ATTACH_APP_LOGS, user_id: 'user1', value: 'true'}],
            prepareRecordsOnly: false,
        });
    });

    it('UT-291 設定→問題を報告（settings/report_problem）: サーバー true でも allowDownloadLogs は false', async () => {
        renderWithEverything(<SettingsReportProblemIndex/>, {database, serverUrl});
        await waitFor(() => expect(lastProps(SettingsReportProblemInner)).toBeDefined());
        expect(lastProps(SettingsReportProblemInner)?.allowDownloadLogs).toBe(false);
    });

    it('UT-292 問題を報告の画面（report_a_problem）: サーバー true でも allowDownloadLogs は false', async () => {
        renderWithEverything(<ReportProblemScreenIndex/>, {database, serverUrl});
        await waitFor(() => expect(lastProps(ReportProblemScreenInner)).toBeDefined());
        expect(lastProps(ReportProblemScreenInner)?.allowDownloadLogs).toBe(false);
    });

    it('UT-293 メッセージ入力のクイック操作（quick_actions）: サーバー true・添付ログの設定 true でも showAttachLogs は false', async () => {
        renderWithEverything(<QuickActionsIndex/>, {database, serverUrl});
        await waitFor(() => expect(lastProps(QuickActionsInner)).toBeDefined());
        expect(lastProps(QuickActionsInner)?.showAttachLogs).toBe(false);
    });

    it('UT-294 定数 ALLOW_DOWNLOAD_LOGS は false で、1行書式（export const ALLOW_DOWNLOAD_LOGS = false;）', () => {
        const src: string = support.read('app/weaver/allow_download_logs.ts');
        expect(src.split('\n')).toContain('export const ALLOW_DOWNLOAD_LOGS = false;');
    });
});
