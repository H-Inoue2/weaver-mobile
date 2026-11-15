// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 テスト補助: 通知の初期値の実行（runNotifyDefaults・フック）のテスト用の「擬似サーバー」。
// jestの既定testMatchは .ts/.tsx を全部拾うため .cjs。別名（@actions 等）は使えないので、jest.mock の工場関数の中から require して使う。
// 読み取り（Client のメソッド）は擬似サーバーの状態を返し、書き込み（既存の remote アクション3つ）は記録して状態へ反映する。
// 書き込みが成功したら状態に反映する（「次の契機で、書いた分は残っている」を再現するため）。

const MARK = {category: 'weaver_notify_init', name: 'v1', value: '1'};

const world = {};

function reset(over = {}) {
    world.calls = []; // 読み取りの呼び出し（メソッド名）
    world.writes = []; // 書き込みの記録（順序つき）: {op:'town'|'me'|'mark', ...}
    world.counts = {};
    world.prefs = over.prefs || []; // 本人の preference 一覧（印の有無）
    world.me = over.me || {id: 'u1', notify_props: {desktop: 'mention', email: 'true', mention_keys: 'taro', first_name: 'true', push: 'mention'}};
    world.teams = over.teams || [{id: 't1', delete_at: 0}];
    world.members = over.members || world.teams.map((t) => ({team_id: t.id, user_id: 'u1', delete_at: 0}));

    // チームごとのタウンスクエア。push が undefined は notify_props に push が無い行。joined=false は未参加（応答に行が無い）
    world.town = over.town || {t1: {joined: true, push: 'default'}};
    world.fail = over.fail || {}; // {メソッド名: [何回目か…] | 'all'}（読み取りの失敗）
    world.meAtCall = over.meAtCall || {}; // {n: 戻す本人 | 'fail'}（n回目の getMe の戻りを差し替える。設定画面での同時の保存の再現）
    world.writeFail = over.writeFail || {}; // {town|me|mark: true}（書き込みを {error} にする）
    world.meCalls = 0;
    world.beforeMe = over.beforeMe || null;
}

function track(name) {
    world.counts[name] = (world.counts[name] || 0) + 1;
    world.calls.push(name);
    const f = world.fail[name];
    if (f === 'all' || (Array.isArray(f) && f.includes(world.counts[name]))) {
        throw new Error(`injected failure: ${name}`);
    }
}

const townId = (teamId) => `ts_${teamId}`;

const client = {
    getMyPreferences: async () => {
        track('getMyPreferences');
        return world.prefs;
    },
    getMe: async () => {
        track('getMe');
        world.meCalls += 1;
        const o = world.meAtCall[world.meCalls];
        if (o === 'fail') {
            throw new Error('injected failure: getMe(nth)');
        }
        return o || world.me;
    },
    getMyTeams: async () => {
        track('getMyTeams');
        return world.teams;
    },
    getMyTeamMembers: async () => {
        track('getMyTeamMembers');
        return world.members;
    },
    getChannelByName: async (teamId, name) => {
        track('getChannelByName');
        if (name !== 'town-square') {
            throw new Error(`unexpected channel name: ${name}`);
        }
        return {id: townId(teamId), team_id: teamId, name};
    },
    getMyChannelMembers: async (teamId) => {
        track('getMyChannelMembers');
        const rows = [{channel_id: `dm_${teamId}`, user_id: 'u1', notify_props: {push: 'default'}}]; // 他のチャンネルの行（書き込みの対象にならないことの確認用）
        const t = world.town[teamId];
        if (t && t.joined) {
            rows.push({channel_id: townId(teamId), user_id: 'u1', notify_props: t.push === undefined ? {} : {push: t.push}});
        }
        return rows;
    },
};

const writeTown = async (_serverUrl, channelId, props) => {
    world.writes.push({op: 'town', channelId, props});
    if (world.writeFail.town) {
        return {error: 'injected write failure'};
    }
    const teamId = channelId.replace(/^ts_/, '');
    if (world.town[teamId]) {
        world.town[teamId].push = props.push;
    }
    return {notifyProps: props};
};

const writeMe = async (_serverUrl, user) => {
    world.writes.push({op: 'me', notifyProps: user.notify_props});
    if (world.writeFail.me) {
        return {error: 'injected write failure'};
    }
    world.me = {...world.me, notify_props: user.notify_props};
    return {user: world.me};
};

const writeMark = async (_serverUrl, prefs) => {
    world.writes.push({op: 'mark', prefs});
    if (world.writeFail.mark) {
        return {error: 'injected write failure'};
    }
    world.prefs = [...world.prefs, ...prefs];
    return {preferences: prefs};
};

const markedPref = (userId = 'u1') => ({user_id: userId, ...MARK});

reset();

module.exports = {world, reset, client, writeTown, writeMe, writeMark, markedPref, MARK, townId};
