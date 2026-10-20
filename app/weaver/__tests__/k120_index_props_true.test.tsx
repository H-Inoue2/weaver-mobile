// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-120（「通知を受け取れません」警告を表示の入口で止める）: 定数 SHOW_PUSH_PROXY_WARNING が true のときの index.ts の props（K120-UT-01f〜01i・02h〜02j・03o）。
// jest.mock で定数だけ true に差し替える（小関数は実物）。index.ts が定数を「明示的に渡している」こと（N-01・P-01）の検出が目的。
// false 側と同じファイルに混在させない（jest.mock はファイル単位で巻き上げられ、ファクトリは1つだけ）。false 側は k120_index_props.test.tsx。
// 期待結果の正は K120_詳細設計.md §2.2・§2.3、K120_単体テスト設計.md §1.5。
// 内側の部品（header.tsx・server_item.tsx）を mock し、最後に渡された props を見る（allow_download_logs.test.tsx の型）。実描画・警告文言は結合テスト（K120-IT）が受ける。

import React from 'react';
import {of as of$, type Observable} from 'rxjs';

import {SYSTEM_IDENTIFIERS} from '@constants/database';
import DatabaseManager from '@database/manager';
import HeaderInner from '@screens/home/channel_list/categories_list/header/header';
import HeaderIndex from '@screens/home/channel_list/categories_list/header/index';
import ServerItemIndex from '@screens/home/channel_list/servers/servers_list/server_item';
import ServerItemInner from '@screens/home/channel_list/servers/servers_list/server_item/server_item';
import {act, renderWithEverything, waitFor} from '@test/intl-test-helper';

import type ServerDataOperator from '@database/operator/server_data_operator';
import type {Database} from '@nozbe/watermelondb';

jest.mock('../push_proxy_warning', () => ({__esModule: true, ...jest.requireActual('../push_proxy_warning'), SHOW_PUSH_PROXY_WARNING: true}));
jest.mock('@screens/home/channel_list/categories_list/header/header', () => ({__esModule: true, default: jest.fn(() => null)}));
jest.mock('@screens/home/channel_list/servers/servers_list/server_item/server_item', () => ({__esModule: true, default: jest.fn(() => null)}));

const lastProps = (component: unknown): Record<string, unknown> | undefined => {
    const calls = (component as jest.Mock).mock.calls;
    return calls.length ? calls[calls.length - 1][0] : undefined;
};

describe('K-120 index.ts が渡す pushProxyStatus（SHOW_PUSH_PROXY_WARNING=true を mock）', () => {
    const serverUrl = 'https://k120-props.example.com';
    const noDbUrl = 'https://k120-no-db.example.com';
    let database: Database;
    let operator: ServerDataOperator;

    const setStatus = async (value: string) => {
        await operator.handleSystem({systems: [{id: SYSTEM_IDENTIFIERS.PUSH_VERIFICATION_STATUS, value}], prepareRecordsOnly: false});
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

    // ---- header index ----
    it.each([
        ['01f', 'not_available', 'not_available'],
        ['01g', 'unknown', 'unknown'],
        ['01h', 'foo', 'foo'],
    ])('K120-UT-%s header index／DB が "%s": 内側へ渡る pushProxyStatus は "%s"（true は素通し。index.ts が定数を明示的に渡している）', async (_id, stored, expected) => {
        await setStatus(stored);
        renderHeader();
        await waitFor(() => expect(lastProps(HeaderInner)).toBeDefined());
        expect(lastProps(HeaderInner)?.pushProxyStatus).toBe(expected);
    });

    it('K120-UT-01i header index／DB が verified で開始→not_available に更新: verified から not_available へ追従する（購読が生きている）', async () => {
        await setStatus('verified');
        renderHeader();
        await waitFor(() => expect(lastProps(HeaderInner)?.pushProxyStatus).toBe('verified'));
        await act(async () => {
            await setStatus('not_available');
        });
        await waitFor(() => expect(lastProps(HeaderInner)?.pushProxyStatus).toBe('not_available'));
    });

    // ---- server_item index ----
    it.each([
        ['02h', 'not_available'],
        ['02j', 'unknown'],
    ])('K120-UT-%s server_item index／serverDatabase あり・DB が "%s": pushProxyStatus はそのまま', async (_id, stored) => {
        await setStatus(stored);
        renderServerItem(serverUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(lastProps(ServerItemInner)?.pushProxyStatus).toBe(stored);
    });

    it('K120-UT-02i server_item index／serverDatabase なし: pushProxyStatus は unknown（true では従来どおりの「DB 無し」経路。条件式を包んだ副作用がない）', async () => {
        renderServerItem(noDbUrl);
        await waitFor(() => expect(lastProps(ServerItemInner)).toBeDefined());
        expect(lastProps(ServerItemInner)?.pushProxyStatus).toBe('unknown');
    });

    // ---- P-01 の実証（詳細設計 §2.3 の表） ----
    it('K120-UT-03o 同じ mock の下で: ①exports の差し替えは見える ②show 省略の既定値は差し替わらず verified ③show=true の直渡しは素通し', () => {
        const mod = require('../push_proxy_warning');
        expect(mod.SHOW_PUSH_PROXY_WARNING).toBe(true);
        const collect = (out$: Observable<string>): string[] => {
            const values: string[] = [];
            out$.subscribe((v) => values.push(v));
            return values;
        };
        expect(collect(mod.observeDisplayedPushProxyStatus(of$('not_available')))).toEqual(['verified']);
        expect(collect(mod.observeDisplayedPushProxyStatus(of$('not_available'), true))).toEqual(['not_available']);
    });
});
