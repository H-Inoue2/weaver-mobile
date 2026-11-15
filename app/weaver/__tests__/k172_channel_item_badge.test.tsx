// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 結合 IT-01（一覧の数字。実DB→上流の ChannelItem の enhancer→表示）。配線の代表行だけ（判定の分岐は単体 UT-A）。
// 設計: K172_結合総合テスト設計 v0.4 IT-01・規則表 R、K172_詳細設計書 v0.4 §4.1。
// 期待は規則表 R の値（実装から写していない）。R-4 は「数字なし・太字あり」、行そのものが無い MyChannel は 0（UT-A06。呼び出し側の責務）。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import {act} from '@testing-library/react-native';
import React from 'react';

import ChannelItem from '@components/channel_item';
import DatabaseManager from '@database/manager';
import {renderWithEverything} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import type ServerDataOperator from '@database/operator/server_data_operator';
import type {Database} from '@nozbe/watermelondb';
import type ChannelModel from '@typings/database/models/servers/channel';

const {seedChannel, setCounts} = require('./k172_db_seed.cjs');
const support = require('./weaver_test_support.cjs');

const SERVER = 'https://appv1.mattermost.com';

describe('IT-01 一覧の数字（実DB→ChannelItem）', () => {
    let database: Database;
    let operator: ServerDataOperator;
    let userId: string;
    let teamId: string;

    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase(SERVER);
        database = server.database;
        operator = server.operator;
        userId = TestHelper.basicUser!.id;
        teamId = TestHelper.basicTeam!.id;
    });

    afterAll(async () => {
        await DatabaseManager.deleteServerDatabase(SERVER);
    });

    const render = async (id: string) => {
        const channel = await database.get<ChannelModel>('Channel').find(id);
        return renderWithEverything(
            <ChannelItem
                channel={channel}
                shouldHighlightState={true}
                testID='k172'
                onPress={() => undefined}
            />,
            {database, serverUrl: SERVER},
        );
    };
    const badge = (screen: Awaited<ReturnType<typeof render>>, name: string): string | null => {
        const node = screen.queryByTestId(`k172.${name}.badge`);
        return node ? String(node.props.children) : null;
    };
    const isBold = (screen: Awaited<ReturnType<typeof render>>, name: string): boolean => {
        const style = support.flattenStyle(screen.getByTestId(`k172.${name}.display_name`).props.style);
        return /SemiBold|600|bold/i.test(`${style.fontFamily}${style.fontWeight}`);
    };
    const seed = (spec: Record<string, unknown>) => seedChannel({database, operator, helper: TestHelper, userId, teamId}, spec);

    it('IT-01① R-1 通常・未読・件数7・メンション0→「7」・太字', async () => {
        await seed({id: 'r1', isUnread: true, messageCount: 7, mentionsCount: 0});
        const screen = await render('r1');

        expect(badge(screen, 'r1')).toBe('7');
        expect(isBold(screen, 'r1')).toBe(true);
    });

    it('IT-01④ R-7 ミュート・未読・7/2→薄い「2」（isMuted の変化が描画へ届く）', async () => {
        await seed({id: 'r7', isUnread: true, messageCount: 7, mentionsCount: 2, notifyProps: {mark_unread: 'mention'}});
        const screen = await render('r7');

        expect(badge(screen, 'r7')).toBe('2');
    });

    it('IT-01⑤ R-8 DM・未読・7/3→「3」（channel.type が判定に渡る）', async () => {
        await seed({id: 'r8', type: 'D', name: `${userId}__other`, isUnread: true, messageCount: 7, mentionsCount: 3});
        const screen = await render('r8');

        expect(badge(screen, `${userId}__other`)).toBe('3');
    });

    it('IT-01⑥ R-4 通常・手動未読（件数0・メンション0）→数字なし・太字あり', async () => {
        await seed({id: 'r4', isUnread: true, messageCount: 0, mentionsCount: 0});
        const screen = await render('r4');

        expect(badge(screen, 'r4')).toBeNull();
        expect(isBold(screen, 'r4')).toBe(true);
    });

    it('IT-01⑦ R-9（B7）通常・push=mention・未読・7/1→一覧は「7」（アイコンの項と違い push で分けない）', async () => {
        await seed({id: 'r9', isUnread: true, messageCount: 7, mentionsCount: 1, notifyProps: {push: 'mention'}});
        const screen = await render('r9');

        expect(badge(screen, 'r9')).toBe('7');
    });

    it('IT-01⑧ 表示中に件数が変わる（既読→新着で 7 になる）と、同じ画面の数字が更新される（購読の配線）', async () => {
        await seed({id: 'live', isUnread: false, messageCount: 0, mentionsCount: 0});
        const screen = await render('live');
        expect(badge(screen, 'live')).toBeNull();

        await act(async () => {
            await setCounts(database, operator, 'live', {isUnread: true, messageCount: 7, mentionsCount: 0});
        });

        expect(badge(screen, 'live')).toBe('7');
    });

    it('UT-A06 MyChannel の行が無いチャンネル→数字なし（0）で例外を出さない（行の無い呼び出しは呼び出し側が 0 にする）', async () => {
        const channel = TestHelper.fakeChannel({id: 'nomember', name: 'nomember', display_name: 'nomember', type: 'O', team_id: teamId});
        await operator.handleChannel({channels: [channel], prepareRecordsOnly: false});
        const screen = await render('nomember');

        expect(badge(screen, 'nomember')).toBeNull();
    });
});
