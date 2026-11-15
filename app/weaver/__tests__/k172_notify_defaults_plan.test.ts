// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 単体テスト UT-P（planNotifyDefaults。詳細設計 v0.4 §7.3 の判定表 D2〜D5'・(ii)・(i)想定外。ガード①②④⑤の源）。
// 期待値は判定表から導いた（実装から写していない）。呼び口は設計に形が無いため仮置き（Q-U01 の残り）:
//   入力 {personalPush: 'mention'|'all', towns: [{teamId, state: 'row'|'not_member'|'unknown', push?}]}
//   戻り {writeTownSquareTeamIds: string[], personal: 'all'|null, mark: boolean, stop: boolean}
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import {planNotifyDefaults} from '../notify_defaults';

type Town = {teamId: string; state: 'row' | 'not_member' | 'unknown'; push?: string};
const row = (push?: string): Town => ({teamId: 't1', state: 'row', push});
const plan = (personalPush: 'mention' | 'all', town: Town) => planNotifyDefaults({personalPush, towns: [town]});

describe('UT-P planNotifyDefaults（判定表）', () => {
    it.each([
        ['空文字', ''],
        ['default', 'default'],
        ['値なし', undefined],
    ])('UT-P01（D2）個人 mention・タウンスクエア push が %s→タウンスクエアに書く・個人を all・印', (_n, push) => {
        expect(plan('mention', row(push))).toEqual({writeTownSquareTeamIds: ['t1'], personal: 'all', mark: true, stop: false});
    });

    it.each(['all', 'mention', 'none'])('UT-P02（D3）個人 mention・タウンスクエアが %s を明示→書かない（上書きしない）・個人を all・印', (push) => {
        expect(plan('mention', row(push))).toEqual({writeTownSquareTeamIds: [], personal: 'all', mark: true, stop: false});
    });

    it('UT-P03 個人 mention・タウンスクエア未参加（ii）→書かない・個人を all・印（失敗扱いにしない）', () => {
        expect(plan('mention', {teamId: 't1', state: 'not_member'})).toEqual({writeTownSquareTeamIds: [], personal: 'all', mark: true, stop: false});
    });

    it.each(['', 'default', undefined])('UT-P04（D5）個人 all・タウンスクエア push=%p→タウンスクエアに書く・個人は書かない・印', (push) => {
        expect(plan('all', row(push))).toEqual({writeTownSquareTeamIds: ['t1'], personal: null, mark: true, stop: false});
    });

    it.each([
        ['all を明示', row('all')],
        ['mention を明示', row('mention')],
        ['none を明示', row('none')],
        ['未参加(ii)', {teamId: 't1', state: 'not_member'} as Town],
    ])('UT-P05（D5\'）個人 all・タウンスクエア %s→何も書かず印だけ', (_n, town) => {
        expect(plan('all', town)).toEqual({writeTownSquareTeamIds: [], personal: null, mark: true, stop: false});
    });

    it.each([
        ['mention・不明(iii)', 'mention', {teamId: 't1', state: 'unknown'} as Town],
        ['all・不明(iii)', 'all', {teamId: 't1', state: 'unknown'} as Town],
        ['mention・(i)で想定外の値', 'mention', row('xyz')],
        ['all・(i)で想定外の値', 'all', row('xyz')],
    ])('UT-P07/P08（D4・D8・(i)想定外）個人 %s→止める（何も書かない・印なし）', (_n, personal, town) => {
        expect(plan(personal as 'mention' | 'all', town)).toEqual({writeTownSquareTeamIds: [], personal: null, mark: false, stop: true});
    });
});
