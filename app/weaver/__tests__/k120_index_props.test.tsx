// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-120（「通知を受け取れません」警告を表示の入口で止める）: index.ts が内側の部品へ渡す pushProxyStatus の値（K120-UT-01a〜01d・02a〜02g・04a・04b）。
// 定数 SHOW_PUSH_PROXY_WARNING は既定の false のまま（mock しない）。true 側は k120_index_props_true.test.tsx（jest.mock はファイル単位のため別ファイル）。
// 期待結果の正は K120_詳細設計.md §2.2・§3・§8.1、K120_単体テスト設計.md §1.4。
// 内側の部品（header.tsx・server_item.tsx）を mock し、最後に渡された props を見る（allow_download_logs.test.tsx の型）。実描画・警告文言は結合テスト（K120-IT）が受ける。

import React from 'react';
import {of as of$} from 'rxjs';

import {MM_TABLES, SYSTEM_IDENTIFIERS} from '@constants/database';
import DatabaseManager from '@database/manager';
import HeaderInner from '@screens/home/channel_list/categories_list/header/header';
import HeaderIndex from '@screens/home/channel_list/categories_list/header/index';
import ServerItemIndex from '@screens/home/channel_list/servers/servers_list/server_item';
import ServerItemInner from '@screens/home/channel_list/servers/servers_list/server_item/server_item';
import {act, renderWithEverything, waitFor} from '@test/intl-test-helper';

import type ServerDataOperator from '@database/operator/server_data_operator';
import type {Database} from '@nozbe/watermelondb';

jest.mock('@screens/home/channel_list/categories_list/header/header', () => ({__esModule: true, default: jest.fn(() => null)}));
jest.mock('@screens/home/channel_list/servers/servers_list/server_item/server_item', () => ({__esModule: true, default: jest.fn(() => null)}));

const lastProps = (component: unknown): Record<string, unknown> | undefined => {
    const calls = (component as jest.Mock).mock.calls;
    return calls.length ? calls[calls.length - 1][0] : undefined;
};

describe('K-120 index.ts が渡す pushProxyStatus（SHOW_PUSH_PROXY_WARNING=false の既定）', () => {
    const serverUrl = 'https://k120-props.example.com';
    const noDbUrl = 'https://k120-no-db.example.com';
    let database: Database;
    let operator: ServerDataOperator;

    const setStatus = async (value: string) => {
        await operator.handleSystem({systems: [{id: SYSTEM_IDENTIFIERS.PUSH_VERIFICATION_STATUS, value}], prepareRecordsOnly: false});
    };
    const storedStatus = async (): Promise<string> => {
        const rec: {value: string} = await database.get(MM_TABLES.SERVER.SYSTEM).find(SYSTEM_IDENTIFIERS.PUSH_VERIFICATION_STATUS);
        return rec.value;
    };

    // 偽の ServersModel（url と observe だけ）。observe() は自身を流す
    const fakeServer = (url: string) => {
        const server: {url: string; observe: () => unknown} = {url, observe: () => of$(server)};
        return server;
    };
    const ServerItem = ServerItemIndex as unknown as React.ComponentType<Record<string, unknown>>;
    const renderServerItem = (url: string, server = fakeServer(url)) => {
        renderWithEverything(<ServerItem {...{server, highlight: false, isActive: false}}/>, {database, serverUrl});
        return server;
    };
    const renderHeader = () => renderWithEverything(<HeaderIndex/>, {database, serverUrl});

    beforeEach(async () => {
        await DatabaseManager.init([serverUrl]);
        const dbAndOp = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        database = dbAndOp.database;
        operator = dbAndOp.operator;
    });

    afterEach(() => {
        DatabaseManager.destroyServerDatabase(serverUrl);
        jest.clearAllMocks();
    });

    // ---- header index（ホーム。K120-UT-01） ----
    it.each([
        ['01a', 'not_available'],
        ['01b', 'unknown'],
        ['01c', 'foo'],
    ])('K120-UT-%s header index／DB の検証状態が "%s": 内側へ渡る pushProxyStatus は verified', async (_id, stored) => {
        await setStatus(stored);
        renderHeader();
        await waitFor(() => expect(lastProps(HeaderInner)).toBeDefined());
        expect(lastProps(HeaderInner)?.pushProxyStatus).toBe('verified');
    });

    it('K120-UT-01d header index／DB が not_available→unknown→verified→not_available と変わっても、最後の props は常に verified で例外なし', async () => {
        await setStatus('not_available');
        renderHeader();
        await waitFor(() => expect(lastProps(HeaderInner)).toBeDefined());
        expect(lastProps(HeaderInner)?.pushProxyStatus).toBe('verified');
        for (const next of ['unknown', 'verified', 'not_available']) {
            // eslint-disable-next-line no-await-in-loop
            await act(async () => {
                await setStatus(next);
            });
            expect([next, lastProps(HeaderInner)?.pushProxyStatus]).toEqual([next, 'verified']);
        }
    });

    // ---- server_item index（サーバー一覧。K120-UT-02） ----
    it.each([
        ['02a', 'not_available'],
        ['02b', 'unknown'],
        ['02e', 'foo'],
    ])('K120-UT-%s server_item index／serverDatabase あり・DB が "%s": pushProxyStatus は verified', async (_id, stored) => {
        await setStatus(stored);
        renderServerItem(serverUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(lastProps(ServerItemInner)?.pushProxyStatus).toBe('verified');
    });

    it('K120-UT-02c server_item index／serverDatabase なし（未初期化の URL）: pushProxyStatus は verified（unknown ではない＝条件式の全体を包む）', async () => {
        renderServerItem(noDbUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(DatabaseManager.serverDatabases[noDbUrl]).toBeUndefined();
        expect(lastProps(ServerItemInner)?.pushProxyStatus).toBe('verified');
    });

    it('K120-UT-02d server_item index／serverDatabase あり・検証状態の行なし: pushProxyStatus は verified（observePushVerificationStatus が出す unknown が漏れない）', async () => {
        renderServerItem(serverUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(lastProps(ServerItemInner)?.pushProxyStatus).toBe('verified');
    });

    it('K120-UT-02f server_item index／highlight=false・not_available: tutorialWatched は false、server は渡した偽サーバーと同一（pushProxyStatus 以外の props が壊れていない）', async () => {
        await setStatus('not_available');
        const server = renderServerItem(serverUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(lastProps(ServerItemInner)?.tutorialWatched).toBe(false);
        expect(lastProps(ServerItemInner)?.server).toBe(server);
    });

    it('K120-UT-02g server_item index／DB が not_available→unknown に更新されても pushProxyStatus は verified で例外なし', async () => {
        await setStatus('not_available');
        renderServerItem(serverUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        await act(async () => {
            await setStatus('unknown');
        });
        expect(lastProps(ServerItemInner)?.pushProxyStatus).toBe('verified');
    });

    // ---- 記録を変えない（K120-UT-04。FR-04） ----
    it('K120-UT-04a header index を描画しても DB の検証状態は not_available のまま、database.write は0回', async () => {
        await setStatus('not_available');
        const spy = jest.spyOn(database, 'write');
        renderHeader();
        await waitFor(() => expect(lastProps(HeaderInner)).toBeDefined());
        expect(await storedStatus()).toBe('not_available');
        expect(spy).toHaveBeenCalledTimes(0);
    });

    it('K120-UT-04b server_item index を描画しても DB の検証状態は not_available のまま、database.write は0回', async () => {
        await setStatus('not_available');
        const spy = jest.spyOn(database, 'write');
        renderServerItem(serverUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(await storedStatus()).toBe('not_available');
        expect(spy).toHaveBeenCalledTimes(0);
    });
});
