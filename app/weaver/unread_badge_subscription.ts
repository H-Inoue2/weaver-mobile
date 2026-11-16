// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {Q} from '@nozbe/watermelondb';
import {map as map$, type Subscription} from 'rxjs';
import {combineLatestWith} from 'rxjs/operators';

import {General} from '@constants';
import {MM_TABLES} from '@constants/database';
import DatabaseManager from '@database/manager';
import {observeAllMyChannelNotifyProps} from '@queries/servers/channel';
import {observeUnreadsAndMentions} from '@queries/servers/thread';

import {sumServerBadge, type BadgeChannel} from './unread_badge';

import type ChannelModel from '@typings/database/models/servers/channel';
import type MyChannelModel from '@typings/database/models/servers/my_channel';

const {SERVER: {CHANNEL, MY_CHANNEL}} = MM_TABLES;

export type WeaverBadgeState = {
    mentions: number;
    unread: boolean;
};

type WeaverBadgeObserver = (serverUrl: string, state: WeaverBadgeState) => void;

// K-172: ホームタブとアイコン専用の購読（端末DB→サーバー1つ分の合計）。
// 共有の購読 subscribeUnreadAndMentionsByServer（サーバー一覧のボタンも使う）は変えず、これを別に持つ。
// message_count だけが増える新着でも作り直すため、message_count も観測する（SF-10）。削除済みのチャンネルは除く（B5）。
export const subscribeWeaverBadgeByServer = (serverUrl: string, observer: WeaverBadgeObserver) => {
    const server = DatabaseManager.serverDatabases[serverUrl];
    let subscription: Subscription | undefined;

    if (server?.database) {
        const {database} = server;
        const dmGmIds = database.get<ChannelModel>(CHANNEL).
            query(Q.where('type', Q.oneOf([General.DM_CHANNEL, General.GM_CHANNEL]))).
            observe().
            pipe(map$((channels) => new Set(channels.map((c) => c.id))));

        subscription = database.get<MyChannelModel>(MY_CHANNEL).
            query(Q.on(CHANNEL, Q.where('delete_at', Q.eq(0)))).
            observeWithColumns(['mentions_count', 'is_unread', 'message_count', 'last_viewed_at']).
            pipe(
                combineLatestWith(observeAllMyChannelNotifyProps(database)),
                combineLatestWith(dmGmIds),
                combineLatestWith(observeUnreadsAndMentions(database, {includeDmGm: true})),
                map$(([[[myChannels, settings], dm], {mentions}]) => {
                    let unread = false;
                    const channels: BadgeChannel[] = myChannels.map((mc) => {
                        const notifyProps = settings?.[mc.id];
                        const isMuted = notifyProps?.mark_unread === 'mention';
                        unread = unread || (mc.isUnread && !isMuted);
                        return {
                            isDmGm: dm.has(mc.id),
                            isMuted,
                            isUnread: mc.isUnread,
                            messageCount: mc.messageCount,
                            mentionsCount: mc.mentionsCount,
                            notifyProps,
                            lastViewedAt: mc.lastViewedAt,
                        };
                    });
                    return {mentions: sumServerBadge(channels, mentions), unread};
                }),
            ).
            subscribe(observer.bind(undefined, serverUrl));
    }

    return subscription;
};
