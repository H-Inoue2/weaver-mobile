// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 結合 IT-03・IT-04・単体 UT-S01（ホームタブの数字とアイコン〔setBadgeCount〕。実DB→上流の home.tsx の購読→表示）。
// 設計: K172_結合総合テスト設計 v0.4 IT-03・IT-04・規則表 R・合計 C、K172_詳細設計書 v0.4 §5.1・§5.2。
// 期待は合計 C の値（実装から写していない）。タブの数字＝Home の Badge の value（メンション数。点は -1）、
// アイコン＝Notifications.ios.setBadgeCount の最後の引数（アプリが前面でなくなったとき〔経路④〕に呼ばれる）。
// スレッドのメンション数は、既存の observeUnreadsAndMentions（詳細設計 §5.2 が使うと明記）の戻りを差し替えて与える（スレッド・投稿の仕込みを避けるため）。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import RNUtils from '@mattermost/rnutils/src';
import {act, waitFor} from '@testing-library/react-native';
import React from 'react';
import {Notifications} from 'react-native-notifications';
import {of as of$} from 'rxjs';

import Badge from '@components/badge';
import {Preferences} from '@constants';
import DatabaseManager from '@database/manager';
import {subscribeUnreadAndMentionsByServer} from '@database/subscription/unreads';
import * as threadQueries from '@queries/servers/thread';
import Home from '@screens/home/tab_bar/home';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import type ServerDataOperator from '@database/operator/server_data_operator';
import type {Database} from '@nozbe/watermelondb';

jest.mock('@hooks/device', () => ({
    ...jest.requireActual('@hooks/device'),
    useAppState: () => (global as unknown as {k172AppState: string}).k172AppState,
}));

const {seedChannel, setCounts} = require('./k172_db_seed.cjs');

const g = global as unknown as {k172AppState: string; k172Thread: number};
const SERVER = 'https://appv1.mattermost.com';
const setBadge = () => jest.mocked(Notifications.ios.setBadgeCount);

describe('IT-03・IT-04・UT-S01 ホームタブとアイコンの合計', () => {
    let database: Database;
    let operator: ServerDataOperator;
    let userId: string;
    let teamId: string;
    let screen: ReturnType<typeof renderWithIntlAndTheme>;

    beforeEach(async () => {
        g.k172AppState = 'active';
        g.k172Thread = 0;
        jest.spyOn(threadQueries, 'observeUnreadsAndMentions').mockImplementation(() => of$({unreads: false, mentions: g.k172Thread}));
        jest.mocked(RNUtils.getDeliveredNotifications).mockResolvedValue([]);
        const server = await TestHelper.setupServerDatabase(SERVER);
        database = server.database;
        operator = server.operator;
        userId = TestHelper.basicUser!.id;
        teamId = TestHelper.basicTeam!.id;
        await DatabaseManager.setActiveServerDatabase(SERVER);
    });

    afterEach(async () => {
        screen?.unmount();
        await DatabaseManager.deleteServerDatabase(SERVER);
    });

    const seed = (spec: Record<string, unknown>) => seedChannel({database, operator, helper: TestHelper, userId, teamId}, spec);
    // eslint-disable-next-line new-cap
    const tabValue = () => screen.UNSAFE_getByType(Badge).props.value;
    const mount = () => {
        screen = renderWithIntlAndTheme(
            <Home
                isFocused={false}
                theme={Preferences.THEMES.denim}
            />,
        );
    };

    // アプリが前面でなくなった（経路④）。以後、合計が変わるたびに setBadgeCount が呼ばれる
    const leaveForeground = async () => {
        g.k172AppState = 'background';
        screen.rerender(
            <Home
                isFocused={false}
                theme={Preferences.THEMES.denim}
            />,
        );
    };

    // タブの数字とアイコンの値が、同じ値になること（FR-32・D-18）
    const expectBoth = async (tab: number, icon: number) => {
        await waitFor(() => {
            expect(tabValue()).toBe(tab);
            expect(setBadge()).toHaveBeenLastCalledWith(icon);
        });
    };

    it('IT-03 C-2 DM 3（R-8）＋通常 7（R-1）＋スレッドのメンション 2→タブ12・アイコン12', async () => {
        await seed({id: 'dm', type: 'D', name: `${userId}__o`, isUnread: true, messageCount: 7, mentionsCount: 3});
        await seed({id: 'n1', isUnread: true, messageCount: 7, mentionsCount: 0});
        g.k172Thread = 2;
        mount();
        await waitFor(() => expect(tabValue()).toBe(12));
        await leaveForeground();

        await expectBoth(12, 12);
    });

    it('IT-03 C-4 手動未読だけ（R-4。件数0・メンション0）→タブは点（-1）・アイコン0', async () => {
        await seed({id: 'r4', isUnread: true, messageCount: 0, mentionsCount: 0});
        mount();
        await waitFor(() => expect(tabValue()).toBe(-1));
        await leaveForeground();

        await waitFor(() => expect(setBadge()).toHaveBeenLastCalledWith(0));
        expect(tabValue()).toBe(-1);
    });

    it('IT-03 C-5（B7）push=mention の通常チャンネル・未読7・メンション1→タブ1・アイコン1（普通の未読7は入れない）', async () => {
        await seed({id: 'r9', isUnread: true, messageCount: 7, mentionsCount: 1, notifyProps: {push: 'mention'}});
        mount();
        await waitFor(() => expect(tabValue()).toBe(1));
        await leaveForeground();

        await expectBoth(1, 1);
    });

    it('IT-03⑤⑥ 既に未読でメンションの無いチャンネルで message_count だけが3→4に増える→合計が更新される（SF-10）。7件を既読にする→0に減る（FR-34）', async () => {
        await seed({id: 'n1', isUnread: true, messageCount: 3, mentionsCount: 0});
        mount();
        await waitFor(() => expect(tabValue()).toBe(3));
        await leaveForeground();
        await expectBoth(3, 3);

        await act(async () => {
            await setCounts(database, operator, 'n1', {messageCount: 4});
        });
        await expectBoth(4, 4);

        await act(async () => {
            await setCounts(database, operator, 'n1', {isUnread: false, mentionsCount: 0});
        });
        await waitFor(() => expect(setBadge()).toHaveBeenLastCalledWith(0));
        expect(tabValue()).toBe(0);
    });

    it('UT-S01 メンション5・未読の MyChannel が削除済み（Channel.delete_at>0）のチャンネルに紐づく→合計に入らない（B5）', async () => {
        await seed({id: 'gone', isUnread: true, messageCount: 7, mentionsCount: 5, deleteAt: 1700000000000});
        await seed({id: 'alive', isUnread: true, messageCount: 2, mentionsCount: 0});
        mount();
        await waitFor(() => expect(tabValue()).toBe(2));
        await leaveForeground();

        await expectBoth(2, 2);
    });

    it('UT-S02 一度も開いていない（last_viewed_at 0）未読14件・メンション0のチャンネル（B8）→合計に入らない＝タブ・アイコンとも、開いた行の2だけ。購読が last_viewed_at を渡している配線の確認', async () => {
        await seed({id: 'never', isUnread: true, messageCount: 14, mentionsCount: 0, lastViewedAt: 0});
        await seed({id: 'opened', isUnread: true, messageCount: 2, mentionsCount: 0});
        mount();
        await waitFor(() => expect(tabValue()).toBe(2));
        await leaveForeground();

        await expectBoth(2, 2);
    });

    it('UT-S03 一度も開いていない未読14件のチャンネルを開く（last_viewed_at だけが0→正に変わる。件数・未読は不変）→合計が再計算され、点（-1）・0から14に増える（購読が last_viewed_at を観測している確認）', async () => {
        await seed({id: 'never', isUnread: true, messageCount: 14, mentionsCount: 0, lastViewedAt: 0});
        mount();
        await waitFor(() => expect(tabValue()).toBe(-1));
        await leaveForeground();
        await waitFor(() => expect(setBadge()).toHaveBeenLastCalledWith(0));

        await act(async () => {
            await setCounts(database, operator, 'never', {lastViewedAt: 1700000000000});
        });

        await expectBoth(14, 14);
    });

    it('IT-03⑧ 回帰（FR-36）R-1 の状態で、サーバー一覧のボタンが使う共有の購読は、メンション0のまま（件数7を数えない）', async () => {
        await seed({id: 'r1', isUnread: true, messageCount: 7, mentionsCount: 0});
        const seen: number[] = [];
        const sub = subscribeUnreadAndMentionsByServer(SERVER, (_url, {myChannels, threadMentionCount}) => {
            seen.push(myChannels.reduce((a, m) => a + m.mentionsCount, 0) + threadMentionCount);
        });
        await waitFor(() => expect(seen.length).toBeGreaterThan(0));
        sub?.unsubscribe();

        expect(seen.every((n) => n === 0)).toBe(true);
    });

    describe('IT-04 updateBadge の条件の読み替え（経路④）', () => {
        it('① 合計0・配信済みの通知2件→setBadgeCount を呼ばない（現行どおり）', async () => {
            jest.mocked(RNUtils.getDeliveredNotifications).mockResolvedValueOnce([{}, {}] as never);
            mount();
            await leaveForeground();
            await act(async () => {
                await new Promise((r) => setTimeout(r, 80));
            });

            expect(setBadge()).not.toHaveBeenCalled();
        });

        it('② 合計7・メンション0・配信済みの通知2件→setBadgeCount(7) を呼ぶ（通常チャンネルの未読もアイコンに出る）', async () => {
            await seed({id: 'n1', isUnread: true, messageCount: 7, mentionsCount: 0});
            jest.mocked(RNUtils.getDeliveredNotifications).mockResolvedValue([{}, {}] as never);
            mount();
            await waitFor(() => expect(tabValue()).toBe(7));
            await leaveForeground();

            await waitFor(() => expect(setBadge()).toHaveBeenLastCalledWith(7));
        });

        it('③ 合計0・通知なし→setBadgeCount(0)', async () => {
            mount();
            await leaveForeground();

            await waitFor(() => expect(setBadge()).toHaveBeenLastCalledWith(0));
        });
    });
});
