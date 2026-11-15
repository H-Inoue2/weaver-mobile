// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172: 通知の初期値（個人＝すべて、タウンスクエア＝メンションのみ）を整える処理の、判定（純粋関数）と定数。
// 判定表の正は詳細設計 §7.3。印・個人 none・個人の想定外・チーム0件は実行側（notify_defaults_runner.ts）が判定する。
// 印の名前は前倒しのデータパッチ（基本設計 §4.2）でも同じものを使う。

export const NOTIFY_DEFAULTS_PREF_CATEGORY = 'weaver_notify_init';
export const NOTIFY_DEFAULTS_PREF_NAME = 'v1';
export const NOTIFY_DEFAULTS_PREF_VALUE = '1';
export const TOWN_SQUARE_NAME = 'town-square';

export type TownSquareState = {
    teamId: string;

    // row: 自分の行がある（push はその値）／not_member: 成功した応答に行が無い（未参加）／unknown: 問い合わせの失敗（不明）
    state: 'row' | 'not_member' | 'unknown';
    push?: string;
};

export type NotifyDefaultsPlan = {
    writeTownSquareTeamIds: string[];
    personal: 'all' | null;
    mark: boolean;
    stop: boolean;
};

const stop = (): NotifyDefaultsPlan => ({writeTownSquareTeamIds: [], personal: null, mark: false, stop: true});

// 空・default・値なしは「未設定」。none・all・mention は明示（上書きしない）。それ以外は想定外（安全側で止める）。
const isUnset = (push?: string) => push === undefined || push === '' || push === 'default';
const isExplicit = (push?: string) => push === 'all' || push === 'mention' || push === 'none';

export const planNotifyDefaults = ({personalPush, towns}: {personalPush: 'mention' | 'all'; towns: TownSquareState[]}): NotifyDefaultsPlan => {
    const writeTownSquareTeamIds: string[] = [];
    for (const town of towns) {
        if (town.state === 'unknown') {
            return stop();
        }
        if (town.state === 'row') {
            if (isUnset(town.push)) {
                writeTownSquareTeamIds.push(town.teamId);
            } else if (!isExplicit(town.push)) {
                return stop();
            }
        }
    }

    return {
        writeTownSquareTeamIds,
        personal: personalPush === 'mention' ? 'all' : null,
        mark: true,
        stop: false,
    };
};
