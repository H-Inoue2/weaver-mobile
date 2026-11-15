// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 通知の初期値の実行 runNotifyDefaults（危険領域）。単体 UT-R と結合 IT-05・IT-06・IT-07。
// 設計: K172_詳細設計書 v0.4 §7.2（手順 S0〜S9）・§7.3、K172_単体テスト設計 v0.3 UT-R、K172_結合総合テスト設計 v0.4 IT-05〜07。
// 読み取りは擬似サーバー（k172_notify_world.cjs の Client）、書き込みは既存の remote アクション3つ
// （updateChannelNotifyProps・updateMe・savePreference）を記録するスタブ。端末DB・本物の通信は使わない。
// ガード①②④⑤（all・none・印ありを変えない／タウンスクエア→個人の順／失敗時に印なし／明示済みを上書きしない／失敗を「なし」と読まない）が対象。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import {runNotifyDefaults} from '../notify_defaults_runner';

jest.mock('@managers/network_manager', () => ({
    __esModule: true,
    default: {getClient: () => require('./k172_notify_world.cjs').client},
}));
jest.mock('@actions/remote/channel', () => ({
    updateChannelNotifyProps: (...a: unknown[]) => require('./k172_notify_world.cjs').writeTown(...a),
}));
jest.mock('@actions/remote/user', () => ({
    updateMe: (...a: unknown[]) => require('./k172_notify_world.cjs').writeMe(...a),
}));
jest.mock('@actions/remote/preference', () => ({
    savePreference: (...a: unknown[]) => require('./k172_notify_world.cjs').writeMark(...a),
}));

const W = require('./k172_notify_world.cjs');
const {world} = W;

const SERVER = 'https://k172.example.test';
const ops = (): string[] => world.writes.map((w: {op: string}) => w.op);
const writesOf = (op: string) => world.writes.filter((w: {op: string}) => w.op === op);
const ME_KEYS = {desktop: 'mention', email: 'true', mention_keys: 'taro', first_name: 'true'};
const me = (push?: string, extra: Record<string, string> = {}) => ({id: 'u1', notify_props: push === undefined ? {...ME_KEYS, ...extra} : {...ME_KEYS, ...extra, push}});

beforeEach(() => {
    W.reset();
});

describe('IT-05 全部書く流れ（D2。順序＝ガード②・全キー＝M5）', () => {
    it('印なし・個人 mention・タウンスクエア default→ タウンスクエア→個人→印 の順に3つだけ書く', async () => {
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(ops()).toEqual(['town', 'me', 'mark']);
        expect(writesOf('town')[0]).toEqual({op: 'town', channelId: 'ts_t1', props: {push: 'mention'}});

        // 個人設定は丸ごと置き換え: 入力のキーは全部そのまま、push だけ all
        expect(writesOf('me')[0].notifyProps).toEqual({...ME_KEYS, push: 'all'});
        expect(writesOf('mark')[0].prefs).toEqual([W.markedPref('u1')]);
    });
});

describe('UT-R 実行の分岐（結合が持たないもの）', () => {
    it('UT-R01 取り直しで他のキーが変わっていたら、取り直した値で送る（S2 の古い値で巻き戻さない＝M5）', async () => {
        world.meAtCall = {2: me('mention', {desktop: 'all'})};
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(writesOf('me')).toHaveLength(1);
        expect(writesOf('me')[0].notifyProps).toEqual({...ME_KEYS, desktop: 'all', push: 'all'});
    });

    it.each(['all', 'none'])('UT-R02 取り直したら個人が %s に変わっていた（本人が変更）→個人は書かない・印は保存・done（ガード①）', async (push) => {
        world.meAtCall = {2: me(push)};
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(writesOf('me')).toHaveLength(0);
        expect(writesOf('mark')).toHaveLength(1);
    });

    it.each([
        ['取り直しの通信失敗', {2: 'fail'}],
        ['取り直しで push が値なし', {2: {id: 'u1', notify_props: {...ME_KEYS}}}],
    ])('UT-R03 %s→stopped:write_me・個人は書かない・印なし（ガード③）', async (_n, meAtCall) => {
        world.meAtCall = meAtCall;
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('stopped:write_me');
        expect(writesOf('me')).toHaveLength(0);
        expect(writesOf('mark')).toHaveLength(0);
    });

    it('UT-R06 個人 push が none→チーム・タウンスクエアの問い合わせも書き込みも無く、印だけ保存（ガード①。D6）', async () => {
        world.me = me('none');
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(ops()).toEqual(['mark']);
        expect(world.calls.filter((c: string) => /Team|Channel/.test(c))).toEqual([]);
    });

    it.each([
        ['S2 getMe の失敗', {getMe: 'all'}, 'stopped:me'],
        ['S3 getMyTeamMembers の失敗', {getMyTeamMembers: 'all'}, 'stopped:teams'],
        ['S4 名前引き getChannelByName の失敗（未参加(ii)と誤らない）', {getChannelByName: 'all'}, 'stopped:town_square'],
    ])('UT-R07 問い合わせの失敗 %s→%s・書き込み0・印なし（ガード⑤）', async (_n, fail, expected) => {
        world.fail = fail;
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe(expected);
        expect(world.writes).toEqual([]);
    });

    it('UT-R09 チーム一覧に抜けたチーム（delete_at>0）と有効なチームがある→有効なチームだけを問い合わせ、完走', async () => {
        world.teams = [{id: 't1', delete_at: 0}, {id: 't2', delete_at: 0}];
        world.members = [{team_id: 't1', user_id: 'u1', delete_at: 0}, {team_id: 't2', user_id: 'u1', delete_at: 1700000000000}];
        world.town = {t1: {joined: true, push: 'default'}}; // t2 の行は無い（問い合わせられたら getMyChannelMembers で気付ける）
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(world.counts.getChannelByName).toBe(1);
        expect(world.counts.getMyChannelMembers).toBe(1);
        expect(writesOf('town').map((w: {channelId: string}) => w.channelId)).toEqual(['ts_t1']);
    });

    it.each([
        ['mention とは別の想定外の値', 'xyz'],
        ['push が値なし', undefined],
    ])('UT-R11 個人 push が %s→stopped:plan・書き込み0・印なし（D7）', async (_n, push) => {
        world.me = me(push);
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('stopped:plan');
        expect(world.writes).toEqual([]);
    });
});

describe('IT-06 書かない・書く量が減る流れ（実行の形）', () => {
    it.each([
        ['D1 印あり', () => {
            world.prefs = [W.markedPref('u1')];
        }, 'done'],
        ['D7 個人 push が値なし', () => {
            world.me = me(undefined);
        }, 'stopped:plan'],
    ])('IT-06① %s→書き込み0回', async (_n, setup, expected) => {
        setup();
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe(expected);
        expect(world.writes).toEqual([]);
    });

    it('IT-06② D3 タウンスクエアが all を明示→タウンスクエアへの書き込み0・個人 all・印（ガード④）', async () => {
        world.town = {t1: {joined: true, push: 'all'}};
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(ops()).toEqual(['me', 'mark']);
        expect(world.town.t1.push).toBe('all');
    });

    it('IT-06③ (ii) 未参加が確定（成功した応答に行が無い）→タウンスクエアへの書き込み0・失敗扱いにしない・個人 all・印まで進む', async () => {
        world.town = {t1: {joined: false}};
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('done');
        expect(ops()).toEqual(['me', 'mark']);
    });

    it('IT-06④ (iii) 不明（メンバー一覧の通信失敗）→書き込み0・個人設定も印も変えない（ガード⑤）', async () => {
        world.fail = {getMyChannelMembers: 'all'};
        const code = await runNotifyDefaults(SERVER);

        expect(code).toBe('stopped:town_square');
        expect(world.writes).toEqual([]);
        expect(world.me.notify_props.push).toBe('mention');
    });

    it.each([
        ['チーム一覧が空', {teams: [], members: []}],
        ['メンバー行が全部 delete_at>0', {members: [{team_id: 't1', user_id: 'u1', delete_at: 1700000000000}]}],
        ['チームがアーカイブ済み', {teams: [{id: 't1', delete_at: 1700000000000}]}],
    ])('IT-06⑤ D10 対象のチームが0件（%s）→stopped:teams・書き込み0。チームに入った後の契機で IT-05 と同じ1セット', async (_n, state) => {
        W.reset(state);
        expect(await runNotifyDefaults(SERVER)).toBe('stopped:teams');
        expect(world.writes).toEqual([]);

        W.reset(); // チームに入った（チーム1つ・有効）
        expect(await runNotifyDefaults(SERVER)).toBe('done');
        expect(ops()).toEqual(['town', 'me', 'mark']);
    });
});

describe('IT-07 失敗注入（停止点×再実行）。失敗させた回と、次の契機の両方を見る', () => {
    it.each([
        ['TS の書き込みが失敗／サーバーが拒否（403）', {town: true}, 'stopped:write_ts'],
    ])('IT-07① %s→個人設定の書き込み0・印なし・例外を出さない・同じ契機内で再試行しない。次の契機で IT-05 と同じ結果', async (_n, writeFail, expected) => {
        world.writeFail = writeFail;
        await expect(runNotifyDefaults(SERVER)).resolves.toBe(expected);
        expect(ops()).toEqual(['town']); // 1回だけ試して止まる（個人・印へ進まない）

        W.reset();
        expect(await runNotifyDefaults(SERVER)).toBe('done');
        expect(ops()).toEqual(['town', 'me', 'mark']);
    });

    it('IT-07② 個人設定の書き込みが失敗→印なし・タウンスクエアは mention のまま。次の契機では D3（タウンスクエアは書かない）→個人→印', async () => {
        world.writeFail = {me: true};
        expect(await runNotifyDefaults(SERVER)).toBe('stopped:write_me');
        expect(ops()).toEqual(['town', 'me']);
        expect(world.town.t1.push).toBe('mention');

        world.writes = [];
        world.writeFail = {};
        expect(await runNotifyDefaults(SERVER)).toBe('done');
        expect(ops()).toEqual(['me', 'mark']);
    });

    it('IT-07③ 印の保存が失敗→次の契機では個人は既に all なので、設定は変えず印だけ保存', async () => {
        world.writeFail = {mark: true};
        expect(await runNotifyDefaults(SERVER)).toBe('stopped:write_mark');
        expect(ops()).toEqual(['town', 'me', 'mark']);
        expect(world.me.notify_props.push).toBe('all');

        world.writes = [];
        world.writeFail = {};
        expect(await runNotifyDefaults(SERVER)).toBe('done');
        expect(ops()).toEqual(['mark']);
    });

    it('IT-07④ 印を読む問い合わせが失敗（D9。端末DBが空でも「印なし」と誤読しない）→stopped:prefs・何も書かない', async () => {
        world.fail = {getMyPreferences: 'all'};
        expect(await runNotifyDefaults(SERVER)).toBe('stopped:prefs');
        expect(world.writes).toEqual([]);
    });
});
