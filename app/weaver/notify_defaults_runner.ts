// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {updateChannelNotifyProps} from '@actions/remote/channel';
import {savePreference} from '@actions/remote/preference';
import {updateMe} from '@actions/remote/user';
import NetworkManager from '@managers/network_manager';
import {logDebug} from '@utils/log';

import {
    NOTIFY_DEFAULTS_PREF_CATEGORY,
    NOTIFY_DEFAULTS_PREF_NAME,
    NOTIFY_DEFAULTS_PREF_VALUE,
    TOWN_SQUARE_NAME,
    planNotifyDefaults,
    type TownSquareState,
} from './notify_defaults';

// K-172: 通知の初期値を整える実行（詳細設計 §7.2 の S0〜S9）。危険領域。
// 読み取りはすべてサーバーへ直接問い合わせる（端末DBの同期値は使わない）。書き込みは本人の権限の既存アクションだけ。
// 順序: タウンスクエア→個人→印（印は最後）。どこかで止まったら以後は何も書かず、印も付けない（次の契機で最初からやり直す）。
// 例外は呼び出し元へ出さず、結果コードを返す。ログは段の名前だけ（利用者ID・通知設定の中身は出さない）。

type Stage = 'prefs' | 'me' | 'teams' | 'town_square' | 'plan' | 'write_ts' | 'write_me' | 'write_mark';

export type NotifyDefaultsResult = 'done' | 'skipped' | `stopped:${Stage}`;

// 同じサーバーURLで実行中のものがあれば、2本目は走らせない（同期の終わりと前面復帰がほぼ同時に来るため）。
const running = new Set<string>();

const stopped = (stage: Stage): NotifyDefaultsResult => {
    logDebug('[weaver] notify defaults stopped at', stage);
    return `stopped:${stage}`;
};

const hasError = (result: unknown) => Boolean(result && typeof result === 'object' && 'error' in result && (result as {error?: unknown}).error);

export const runNotifyDefaults = async (serverUrl: string): Promise<NotifyDefaultsResult> => {
    if (running.has(serverUrl)) {
        return 'skipped';
    }
    running.add(serverUrl);
    try {
        return await execute(serverUrl);
    } catch {
        return stopped('plan');
    } finally {
        running.delete(serverUrl);
    }
};

const execute = async (serverUrl: string): Promise<NotifyDefaultsResult> => {
    // S1 印を読む。応答に印の行があれば終了。失敗は「印なし」と読まず止める
    let client: ReturnType<typeof NetworkManager.getClient>;
    let prefs: PreferenceType[];
    try {
        client = NetworkManager.getClient(serverUrl);
        prefs = await client.getMyPreferences();
    } catch {
        return stopped('prefs');
    }
    if (prefs.some((p) => p.category === NOTIFY_DEFAULTS_PREF_CATEGORY && p.name === NOTIFY_DEFAULTS_PREF_NAME)) {
        return 'done';
    }

    // S2 本人の個人設定。none なら何も整えず印だけ（S8）。mention・all 以外は止める
    let me: UserProfile;
    try {
        me = await client.getMe();
    } catch {
        return stopped('me');
    }
    const personalPush = me.notify_props?.push;
    if (personalPush === 'none') {
        return saveMark(serverUrl, me.id);
    }
    if (personalPush !== 'mention' && personalPush !== 'all') {
        return stopped('plan');
    }

    // S3 対象のチーム（アーカイブされていない・抜けていない）。0件なら止める
    let teams: Team[];
    let members: TeamMembership[];
    try {
        [teams, members] = await Promise.all([client.getMyTeams(), client.getMyTeamMembers()]);
    } catch {
        return stopped('teams');
    }
    const leftTeamIds = new Set(members.filter((m) => m.delete_at > 0).map((m) => m.team_id));
    const targetTeams = teams.filter((t) => !(t.delete_at > 0) && !leftTeamIds.has(t.id));
    if (!targetTeams.length) {
        return stopped('teams');
    }

    // S4 チームごとのタウンスクエア。「成功した応答に行が無い」ときだけ未参加。問い合わせの失敗は不明として止める
    const towns: TownSquareState[] = [];
    const townSquareChannelIds: Record<string, string> = {};
    for (const team of targetTeams) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const channel = await client.getChannelByName(team.id, TOWN_SQUARE_NAME, false);

            // eslint-disable-next-line no-await-in-loop
            const myMembers = await client.getMyChannelMembers(team.id);
            const row = myMembers.find((m) => m.channel_id === channel.id);
            townSquareChannelIds[team.id] = channel.id;
            towns.push(row ? {teamId: team.id, state: 'row', push: row.notify_props?.push} : {teamId: team.id, state: 'not_member'});
        } catch {
            return stopped('town_square');
        }
    }

    // S5 書く内容を決める
    const plan = planNotifyDefaults({personalPush, towns});
    if (plan.stop) {
        return stopped('plan');
    }

    // S6 タウンスクエア（渡したキーだけが変わる）。個人より先
    for (const teamId of plan.writeTownSquareTeamIds) {
        // eslint-disable-next-line no-await-in-loop
        const result = await updateChannelNotifyProps(serverUrl, townSquareChannelIds[teamId], {push: 'mention'});
        if (hasError(result)) {
            return stopped('write_ts');
        }
    }

    // S7 個人（notify_props は丸ごと置き換えなので、直前に取り直した全キーに push だけを差し替える）
    if (plan.personal === 'all') {
        let fresh: UserProfile;
        try {
            fresh = await client.getMe();
        } catch {
            return stopped('write_me');
        }
        const freshPush = fresh.notify_props?.push;
        if (freshPush === 'mention') {
            const result = await updateMe(serverUrl, {notify_props: {...fresh.notify_props, push: 'all'}});
            if (hasError(result)) {
                return stopped('write_me');
            }
        } else if (freshPush !== 'all' && freshPush !== 'none') {
            // 本人が変えた（all・none）なら書かずに印へ。値なし・想定外は止める
            return stopped('write_me');
        }
    }

    // S8・S9 印（最後）
    return saveMark(serverUrl, me.id);
};

const saveMark = async (serverUrl: string, userId: string): Promise<NotifyDefaultsResult> => {
    const result = await savePreference(serverUrl, [{
        user_id: userId,
        category: NOTIFY_DEFAULTS_PREF_CATEGORY,
        name: NOTIFY_DEFAULTS_PREF_NAME,
        value: NOTIFY_DEFAULTS_PREF_VALUE,
    }]);
    if (hasError(result)) {
        return stopped('write_mark');
    }
    return 'done';
};
