// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 結合 IT-02（既読の後の新着の数え直し。FV-01・S-19）。実DBへ、上流の本物の WebSocket 処理（handleNewPostEvent・
// handleChannelViewedEvent）と既読処理（markChannelAsViewed）を流し、一覧の表示の数字を見る。通信の関数（remote）だけを差し替える。
// 設計: K172_結合総合テスト設計 v0.4 IT-02、K172_詳細設計書 v0.4 §4.2（UT-D の関数の配線）。
// ③「新着の線まで戻らず閉じた」は、markChannelAsViewed が message_count を戻さない点で①と同じ状態になる（同じ分岐）ため①に含める。
// ⑤（見えているチャンネルの現行どおりの件数）の期待 31 は、D-07（ST-04 の実測）の後に確定する値。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import React from 'react';

import {markChannelAsViewed} from '@actions/local/channel';
import {handleChannelViewedEvent} from '@actions/websocket/channel';
import {handleNewPostEvent} from '@actions/websocket/posts';
import ChannelItem from '@components/channel_item';
import {Screens} from '@constants';
import {SYSTEM_IDENTIFIERS} from '@constants/database';
import DatabaseManager from '@database/manager';
import {NavigationStore} from '@store/navigation_store';
import {renderWithEverything} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import type ServerDataOperator from '@database/operator/server_data_operator';
import type {Database} from '@nozbe/watermelondb';
import type ChannelModel from '@typings/database/models/servers/channel';
import type MyChannelModel from '@typings/database/models/servers/my_channel';

jest.mock('@actions/remote/channel');
jest.mock('@actions/remote/post');
jest.mock('@actions/remote/preference');
jest.mock('@actions/remote/thread');
jest.mock('@actions/remote/user');
jest.mock('@init/push_notifications', () => ({
    __esModule: true,
    default: {removeChannelNotifications: jest.fn(), removeThreadNotifications: jest.fn()},
}));

const {seedChannel} = require('./k172_db_seed.cjs');
const {fetchPostAuthors} = jest.requireMock('@actions/remote/post');

const SERVER = 'https://appv1.mattermost.com';

describe('IT-02 既読の後の新着の数え直し', () => {
    let database: Database;
    let operator: ServerDataOperator;
    let userId: string;
    let teamId: string;
    let n = 0;

    beforeEach(async () => {
        const server = await TestHelper.setupServerDatabase(SERVER);
        database = server.database;
        operator = server.operator;
        userId = TestHelper.basicUser!.id;
        teamId = TestHelper.basicTeam!.id;
        fetchPostAuthors.mockResolvedValue({authors: []});
        jest.spyOn(NavigationStore, 'getScreensInStack').mockReturnValue([Screens.CHANNEL]);
    });

    afterEach(async () => {
        await DatabaseManager.deleteServerDatabase(SERVER);
    });

    const seed = (spec: Record<string, unknown>) => seedChannel({database, operator, helper: TestHelper, userId, teamId}, spec);
    const newPost = async (channelId: string) => {
        n += 1;
        const post = TestHelper.fakePost({id: `p${n}`, channel_id: channelId, user_id: 'someone_else', create_at: Date.now() + n, message: 'hi', root_id: ''});
        await handleNewPostEvent(SERVER, {data: {post: JSON.stringify(post), mentions: []}} as WebSocketMessage);
    };
    const display = async (id: string) => {
        const channel = await database.get<ChannelModel>('Channel').find(id);
        const screen = renderWithEverything(
            <ChannelItem
                channel={channel}
                shouldHighlightState={true}
                testID='k172'
                onPress={() => undefined}
            />,
            {database, serverUrl: SERVER},
        );
        const node = screen.queryByTestId(`k172.${id}.badge`);
        const text = node ? String(node.props.children) : null;
        screen.unmount();
        return text;
    };

    it('IT-02①③ 通常チャンネルで30件未読→この端末で既読（件数30は残る）→1件届く→「1」（31ではない）', async () => {
        await seed({id: 'c1', isUnread: true, messageCount: 30, mentionsCount: 0});
        await markChannelAsViewed(SERVER, 'c1');
        await newPost('c1');

        expect(await display('c1')).toBe('1');
    });

    it('IT-02② 他の端末で既読（channel_viewed）→1件届く→「1」', async () => {
        await seed({id: 'c2', isUnread: true, messageCount: 30, mentionsCount: 0});
        await handleChannelViewedEvent(SERVER, {data: {channel_id: 'c2'}});
        await newPost('c2');

        expect(await display('c2')).toBe('1');
    });

    it('IT-02④ 未読のまま3件→1件届く→「4」（積み増しは壊れない）', async () => {
        await seed({id: 'c4', isUnread: true, messageCount: 3, mentionsCount: 0});
        await newPost('c4');

        expect(await display('c4')).toBe('4');
    });

    it('IT-02⑤ 回帰: 開いて見えているチャンネル（既読30）に1件届く→件数は現行どおり 31（「新着メッセージ」の帯の件数を変えない。値は D-07 の実測後に確定）', async () => {
        await seed({id: 'c5', isUnread: true, messageCount: 30, mentionsCount: 0});
        await markChannelAsViewed(SERVER, 'c5');
        await operator.handleSystem({systems: [{id: SYSTEM_IDENTIFIERS.CURRENT_CHANNEL_ID, value: 'c5'}], prepareRecordsOnly: false});
        await newPost('c5');

        const mc = await database.get<MyChannelModel>('MyChannel').find('c5');
        expect(mc.messageCount).toBe(31);
    });
});
