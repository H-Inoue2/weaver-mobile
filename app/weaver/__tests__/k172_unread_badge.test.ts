// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 単体テスト UT-A（一覧の数字）・UT-B（アイコン・タブの項）・UT-C（合計）・UT-D（新着の件数）。
// 設計: K172_単体テスト設計 v0.3 §2、K172_詳細設計書 v0.4 §3〜§5、結合総合テスト設計 §2 の規則表 R・合計 C。
// 呼び口（引数の形）は詳細設計 §4.1 の「解析済みオブジェクト」。§4.2・合計の引数は設計に形が無い（Q-U01 の残り）ため、
// このファイルの末尾の型で仮置きした（実装時にそろえる）。期待値は論理値＝規則表の値で、実装から写していない。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import {getBadgeTermForChannel, getChannelBadgeCount, getNextMessageCount, sumServerBadge} from '../unread_badge';

type Ch = {
    isDmGm: boolean;
    isMuted: boolean;
    isUnread: boolean;
    messageCount: number;
    mentionsCount: number;
    notifyProps?: Record<string, string | undefined>;
    lastViewedAt?: number;
};

const normal = (over: Partial<Ch> = {}): Ch => ({isDmGm: false, isMuted: false, isUnread: true, messageCount: 7, mentionsCount: 0, ...over});
const muted = (over: Partial<Ch> = {}): Ch => normal({isMuted: true, notifyProps: {mark_unread: 'mention'}, ...over});
const dm = (over: Partial<Ch> = {}): Ch => normal({isDmGm: true, ...over});

describe('UT-A getChannelBadgeCount（一覧の数字。規則表 R の「一覧の数字」）', () => {
    it.each([
        ['UT-A01 通常・未読・7/2（R-2）→件数とメンションの大きい方', normal({mentionsCount: 2}), 7],
        ['UT-A02 通常・未読・3/5（R-5）→メンションの方が大きい', normal({messageCount: 3, mentionsCount: 5}), 5],
        ['UT-A03 通常・既読（is_unread=false）・7/2→メンションだけ（既読後も件数は残る）', normal({isUnread: false, mentionsCount: 2}), 2],
        ['UT-A04 通常・ミュート・未読・7/2（R-7）→メンションだけ（現行）', muted({mentionsCount: 2}), 2],
        ['UT-A05 DM・未読・7/3（R-8。GM も同じ分岐）→メンションだけ', dm({mentionsCount: 3}), 3],
        ['UT-A07 通常・未読・14/2・一度も開いていない（lastViewedAt 0。R-10）→一覧は変えない＝14（B8 は一覧に効かない）', normal({messageCount: 14, mentionsCount: 2, lastViewedAt: 0}), 14],
    ])('%s', (_name, ch, expected) => {
        expect(getChannelBadgeCount(ch)).toBe(expected);
    });
});

describe('UT-B getBadgeTermForChannel（アイコン・タブの項。§5.1）', () => {
    it.each([
        ['UT-B01 通常・ミュート・未読・7/2（R-7）→0（現行どおり合計から除外）', muted({mentionsCount: 2}), 0],
        ['UT-B02 DM・ミュート・未読・7/3→0（判定の順: ミュートが DM より先）', dm({isMuted: true, notifyProps: {mark_unread: 'mention'}, mentionsCount: 3}), 0],
        ['UT-B03 DM・ミュートなし・未読・7/3（R-8）→メンションだけ', dm({mentionsCount: 3}), 3],
        ['UT-B04 通常・push なし・未読・7/2→大きい方（足し算しない）', normal({mentionsCount: 2}), 7],
        ['UT-B05 通常・push なし・未読・3/5→大きい方', normal({messageCount: 3, mentionsCount: 5}), 5],
        ['UT-B08 通常・push なし・既読・7/1→メンションだけ', normal({isUnread: false, mentionsCount: 1}), 1],
        ['UT-B09 通常・未読・14/2・lastViewedAt 0（R-10。一度も開いていない）→メンションだけ（B8。「＜0」で判定する誤りを見つける）', normal({messageCount: 14, mentionsCount: 2, lastViewedAt: 0}), 2],
        ['UT-B10 通常・未読・14/2・lastViewedAt -3（WebSocket の新着で負になる実際の値。「＝0」で判定する誤りを見つける）→メンションだけ', normal({messageCount: 14, mentionsCount: 2, lastViewedAt: -3}), 2],
        ['UT-B11 通常・未読・14/2・lastViewedAt 1（開いた行。落とさない）→大きい方', normal({messageCount: 14, mentionsCount: 2, lastViewedAt: 1}), 14],
    ])('%s', (_name, ch, expected) => {
        expect(getBadgeTermForChannel(ch)).toBe(expected);
    });

    it.each(['mention', 'none'])('UT-B06 通常・未読・7/1・push=%s（R-9。B7）→メンションだけ', (push) => {
        expect(getBadgeTermForChannel(normal({mentionsCount: 1, notifyProps: {push}}))).toBe(1);
    });

    it.each([
        ['all', {push: 'all'}],
        ['キーなし', {}],
    ])('UT-B07 通常・未読・7/1・push が %s（B7 でない）→大きい方', (_name, notifyProps) => {
        expect(getBadgeTermForChannel(normal({mentionsCount: 1, notifyProps}))).toBe(7);
    });
});

describe('UT-C sumServerBadge（合計 C）', () => {
    it('UT-C01 DM 3（R-8）＋通常 7（R-1）＋スレッドのメンション 2（C-2）→12', () => {
        expect(sumServerBadge([dm({mentionsCount: 3}), normal()], 2)).toBe(12);
    });
    it('UT-C02 チャンネル0件・スレッドのメンション 0→0', () => {
        expect(sumServerBadge([], 0)).toBe(0);
    });
});

describe('UT-D getNextMessageCount（WebSocket の新着後の件数。§4.2）', () => {
    it.each([
        ['UT-D01 見えている・既読・30→31（現行のまま。D-07: 値は ST-04 の実測後に確定）', {isVisible: true, isUnread: false, messageCount: 30}, 31],
        ['UT-D02 見えていない・既読・30（既読後の最初の新着）→1（既読前の件数を引き継がない）', {isVisible: false, isUnread: false, messageCount: 30}, 1],
        ['UT-D03 見えていない・未読（手動未読を含む）・3→4（積み増し）', {isVisible: false, isUnread: true, messageCount: 3}, 4],
    ])('%s', (_name, input, expected) => {
        expect(getNextMessageCount(input)).toBe(expected);
    });
});
