// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// 対象: K-39（Weaver専用モバイルアプリの自社ビルド）多重防御ガード（欠落①・②・③）
// 設計根拠: .claude/outputs/mobile/WM-10_詳細設計書_Weaverモバイルアプリ_v1.0.md
//   §2.3（不変条件）・§2.6（欠落③）・§2.7（状態遷移の網羅表）・§6（試験項目対応）
//
// 工程8（単体テスト・Red確認）: `determineRoute` はこのテスト作成時点では
// `app/init/launch.ts` から export されていない（WM-10 §3.4 で export 化を指示）。
// したがって本ファイルは実装前に import エラー（undefined 呼び出し）で失敗する。

import {DeviceEventEmitter} from 'react-native';

import {DeepLink, Events, Launch, PushNotification} from '@constants';
import DatabaseManager from '@database/manager';
import {getActiveServerUrl, getServerCredentials} from '@init/credentials';
import {getAllServers} from '@queries/app/servers';
import {handleDeepLink} from '@utils/deep_link';

import {determineRoute} from './launch';

import type {LaunchProps} from '@typings/launch';

jest.mock('@init/credentials');
jest.mock('@queries/app/servers');
jest.mock('@queries/app/global');
jest.mock('@queries/servers/preference');
jest.mock('@queries/servers/team');
jest.mock('@store/ephemeral_store');
jest.mock('@utils/deep_link');
jest.mock('@actions/remote/entry');
jest.mock('@actions/remote/thread');
jest.mock('@actions/remote/channel');
jest.mock('@actions/local/post');

const OTHER_CUSTOMER_URL = 'https://other-customer.example.com';
const TARGET_HOST = 'new-host.example.com';

describe('determineRoute — 多重防御ガード（K-39/WM-10 §2.3・§2.6）', () => {
    beforeEach(() => {
        jest.mocked(getAllServers).mockResolvedValue([]);
        jest.mocked(getServerCredentials).mockResolvedValue(null);
        DatabaseManager.searchUrl = jest.fn().mockReturnValue(undefined);
        DatabaseManager.getServerDatabaseAndOperator = jest.fn().mockReturnValue({database: {}, operator: {}});
        DatabaseManager.getServerUrlFromIdentifier = jest.fn().mockResolvedValue(undefined);
    });

    // WM-10 §6 #17／§2.7 表 #2: 対象未登録・他サーバーなし（新規インストール）
    it('#17: Server型・未登録・アクティブサーバーなし → 対象ホストが生き残り、アクティブサーバーへは絶対にフォールバックしない', async () => {
        jest.mocked(getActiveServerUrl).mockResolvedValue(undefined);
        const props: LaunchProps = {
            launchType: Launch.DeepLink,
            coldStart: true,
            extra: {type: DeepLink.Server, url: 'weaver://' + TARGET_HOST, data: {serverUrl: TARGET_HOST}},
        };

        const result = await determineRoute(props);

        expect(result.params.serverUrl).toBeUndefined();
        expect(result.params.extra.data.serverUrl).toBe(TARGET_HOST);
    });

    // WM-10 §6 #18（最重要）／§2.7 表 #3: 対象未登録・別顧客サーバーがアクティブ（欠落①の核心）
    it('#18: Server型・未登録・別顧客サーバーがアクティブ → params.serverUrlが別顧客URLに絶対にならない', async () => {
        jest.mocked(getActiveServerUrl).mockResolvedValue(OTHER_CUSTOMER_URL);
        const props: LaunchProps = {
            launchType: Launch.DeepLink,
            coldStart: true,
            extra: {type: DeepLink.Server, url: 'weaver://' + TARGET_HOST, data: {serverUrl: TARGET_HOST}},
        };

        const result = await determineRoute(props);

        expect(result.params.serverUrl).not.toBe(OTHER_CUSTOMER_URL);
        expect(result.params.serverUrl).toBeUndefined();
        expect(result.params.extra.data.serverUrl).toBe(TARGET_HOST);
    });

    // WM-10 §6 #21／§2.7 表 #6: Channel型・未登録・別顧客サーバーがアクティブ（欠落②の核心）
    it('#21: Channel型・未登録・別顧客サーバーがアクティブ → params.serverUrlが別顧客URLに絶対にならない', async () => {
        jest.mocked(getActiveServerUrl).mockResolvedValue(OTHER_CUSTOMER_URL);
        const props: LaunchProps = {
            launchType: Launch.DeepLink,
            coldStart: true,
            extra: {
                type: DeepLink.Channel,
                url: 'weaver://' + TARGET_HOST + '/t/channels/c',
                data: {serverUrl: TARGET_HOST, teamName: 't', channelName: 'c'},
            },
        };

        const result = await determineRoute(props);

        expect(result.params.serverUrl).not.toBe(OTHER_CUSTOMER_URL);
        expect(result.params.serverUrl).toBeUndefined();
        expect(result.params.extra.data.serverUrl).toBe(TARGET_HOST);
    });

    // WM-10 §6 #19／§2.7 表 #13: プッシュ通知・対象未解決・別顧客サーバーがアクティブ（欠落③の核心）
    it('#19: 通知タップ・対象サーバー解決失敗・別顧客サーバーがアクティブ → params.serverUrlが別顧客URLに絶対にならない', async () => {
        jest.mocked(getActiveServerUrl).mockResolvedValue(OTHER_CUSTOMER_URL);
        const props: LaunchProps = {
            launchType: Launch.Notification,
            coldStart: true,
            launchError: true,
            serverUrl: undefined,
            extra: {payload: {server_id: 'unknown-id'}} as unknown as NotificationWithData,
        };

        const result = await determineRoute(props);

        expect(result.params.serverUrl).not.toBe(OTHER_CUSTOMER_URL);
        expect(result.params.serverUrl).toBeUndefined();
    });

    // WM-10 §6 #19-b（新規）／§2.7 表 #12: 通知・対象未解決・他サーバーなし（修正前後で挙動差なしの回帰）
    it('#19-b: 通知タップ・対象サーバー解決失敗・アクティブサーバーなし → 修正前後で挙動差がない（params.serverUrlはundefinedのまま）', async () => {
        jest.mocked(getActiveServerUrl).mockResolvedValue(undefined);
        const props: LaunchProps = {
            launchType: Launch.Notification,
            coldStart: true,
            launchError: true,
            serverUrl: undefined,
            extra: {payload: {server_id: 'unknown-id'}} as unknown as NotificationWithData,
        };

        const result = await determineRoute(props);

        expect(result.params.serverUrl).toBeUndefined();
    });

    // WM-10 §6 MagicLink回帰（K-39/D-8の維持確認）: ガード対象外であることの確認
    it('MagicLink型・ログイン失敗 → 既存どおりgetActiveServerUrl()の値が採用される（ガード対象外）', async () => {
        jest.mocked(handleDeepLink).mockResolvedValue({error: true} as unknown as Awaited<ReturnType<typeof handleDeepLink>>);
        jest.mocked(getActiveServerUrl).mockResolvedValue('https://server-1.com');
        const props: LaunchProps = {
            launchType: Launch.DeepLink,
            coldStart: true,
            extra: {type: DeepLink.MagicLink, url: 'weaver://' + TARGET_HOST, data: {serverUrl: TARGET_HOST, teamName: 't', token: 'tok'}},
        };

        const result = await determineRoute(props);

        expect(result.params.serverUrl).toBe('https://server-1.com');
    });

    // WM-10 §6 セッション期限切れ通知の回帰（欠落③の副作用が無いことの確認）
    it('セッション期限切れ通知（解決成功済み） → SESSION_EXPIREDが対象サーバーで発火し、Launch.Normalへ遷移する', async () => {
        const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');
        const props: LaunchProps = {
            launchType: Launch.Notification,
            coldStart: true,
            serverUrl: 'https://server-1.com',
            extra: {payload: {type: PushNotification.NOTIFICATION_TYPE.SESSION}} as unknown as NotificationWithData,
        };

        const result = await determineRoute(props);

        expect(emitSpy).toHaveBeenCalledWith(Events.SESSION_EXPIRED, 'https://server-1.com');
        expect(result.params.launchType).toBe(Launch.Normal);
    });
});
