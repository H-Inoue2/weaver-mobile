// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172: チャンネル一覧の数字・ホームタブとアイコンの合計の規則（純粋関数。端末DBは読まない）。
// 規則の正は詳細設計 §4・§5（規則表 R・合計 C）。Swift 側（Database+Mentions.swift の getChannelMentions）の SQL も同じ規則に従う。

export type BadgeChannel = {
    isDmGm: boolean;
    isMuted: boolean;
    isUnread: boolean;
    messageCount: number;
    mentionsCount: number;
    notifyProps?: {push?: string; mark_unread?: string};
};

// 一覧の数字（1行）。通常チャンネルで未読なら、件数とメンションの大きい方。それ以外はメンションだけ（現行）。
export const getChannelBadgeCount = (ch: BadgeChannel): number => {
    if (!ch.isDmGm && !ch.isMuted && ch.isUnread) {
        return Math.max(ch.messageCount, ch.mentionsCount);
    }
    return ch.mentionsCount;
};

// ホームタブ・アイコンの項（1チャンネル分）。ミュートは合計から除く（現行）。push が明示の mention・none の通常チャンネルは、普通の未読を数えない（B7）。
export const getBadgeTermForChannel = (ch: BadgeChannel): number => {
    if (ch.isMuted) {
        return 0;
    }
    if (ch.isDmGm) {
        return ch.mentionsCount;
    }
    const push = ch.notifyProps?.push;
    if (ch.isUnread && push !== 'mention' && push !== 'none') {
        return Math.max(ch.messageCount, ch.mentionsCount);
    }
    return ch.mentionsCount;
};

// サーバー1つ分の合計＝全チャンネルの項の和＋スレッドのメンション数。
export const sumServerBadge = (channels: BadgeChannel[], threadMentionCount: number): number => {
    let total = threadMentionCount;
    for (const ch of channels) {
        total += getBadgeTermForChannel(ch);
    }
    return total;
};

// WebSocket の新着後の message_count。見えているチャンネル・未読のままのチャンネルは積み増し、既読の後の最初の新着は 1（既読前の件数を引き継がない）。
export const getNextMessageCount = ({isVisible, isUnread, messageCount}: {isVisible: boolean; isUnread: boolean; messageCount: number}): number => {
    if (isVisible || isUnread) {
        return messageCount + 1;
    }
    return 1;
};
