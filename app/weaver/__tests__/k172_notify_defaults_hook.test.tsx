// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 結合 IT-08（契機と二重実行）。フック useWeaverNotifyDefaults(serverUrl, appState) が、
// 同期の終わり・前面復帰の契機で実行を呼び、重なっても書き込みが1セットだけになること。
// 設計: K172_詳細設計書 v0.4 §7.1（契機）・§7.4（同時実行）、K172_結合総合テスト設計 v0.4 IT-08（③は詳細設計 §11.1 の
// 「問い合わせ1回・書き込み0」に従う。結合設計の旧文「記憶」は詳細設計 v0.2 で削除済み＝N-12）。
// 擬似サーバーと書き込みスタブは k172_notify_defaults_run.test.ts と同じ（k172_notify_world.cjs）。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

import {act, renderHook, waitFor} from '@testing-library/react-native';

import {setTeamLoading} from '@store/team_load_store';

import {useWeaverNotifyDefaults} from '../notify_defaults_hook';

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

let seq = 0;
const nextUrl = () => `https://k172-hook-${++seq}.example.test`; // 実行中の印・同期の購読はサーバーURLごとに持つので、テストごとに別のURL
const ops = (): string[] => world.writes.map((w: {op: string}) => w.op);
const settle = () => act(async () => {
    await new Promise((r) => setTimeout(r, 60));
});

beforeEach(() => {
    W.reset();
});

describe('IT-08 契機と二重実行', () => {
    it('IT-08① ログイン済みの既存利用者が新版でホームを開く（再ログインなし）→IT-05 と同じ1セットが実行される', async () => {
        renderHook(() => useWeaverNotifyDefaults(nextUrl(), 'active'));

        await waitFor(() => expect(ops()).toEqual(['town', 'me', 'mark']));
        expect(world.writes.find((w: {op: string}) => w.op === 'me').notifyProps.push).toBe('all');
    });

    it('IT-08② ホームが同時に2回表示される・再マウントされる→個人設定の書き込みは1回だけ', async () => {
        const url = nextUrl();
        const a = renderHook(() => useWeaverNotifyDefaults(url, 'active'));
        renderHook(() => useWeaverNotifyDefaults(url, 'active'));
        await settle();
        a.unmount();
        renderHook(() => useWeaverNotifyDefaults(url, 'active')); // 再マウント（前の実行の後）
        await settle();

        expect(ops().filter((o) => o === 'me')).toHaveLength(1);
        expect(ops().filter((o) => o === 'town')).toHaveLength(1);
        expect(ops().filter((o) => o === 'mark')).toHaveLength(1);
    });

    it('IT-08③ 印あり→前面に戻るたびに印の問い合わせ1回・書き込み0・他の問い合わせ0。裏・非アクティブでは何も呼ばない', async () => {
        world.prefs = [W.markedPref('u1')];
        const url = nextUrl();
        const h = renderHook(({s}: {s: 'active' | 'background' | 'inactive'}) => useWeaverNotifyDefaults(url, s), {initialProps: {s: 'active' as 'active' | 'background' | 'inactive'}});
        await settle();
        world.calls = [];
        world.counts = {};

        h.rerender({s: 'background'});
        h.rerender({s: 'inactive'});
        await settle();
        expect(world.calls).toEqual([]);

        h.rerender({s: 'active'});
        await settle();
        h.rerender({s: 'background'});
        h.rerender({s: 'active'});
        await settle();

        expect(world.calls).toEqual(['getMyPreferences', 'getMyPreferences']);
        expect(world.writes).toEqual([]);
    });

    it('IT-08④ 新規ログイン直後でタウンスクエアの行が未確定（不明）→書き込み0・印なし。初回の同期が完了したら、再起動なしで IT-05 と同じ1セット', async () => {
        world.fail = {getMyChannelMembers: [1]}; // 最初の1回だけ不明（同期の前）
        const url = nextUrl();
        renderHook(() => useWeaverNotifyDefaults(url, 'active'));
        await settle();

        expect(world.writes).toEqual([]);
        expect(world.prefs).toEqual([]);

        await act(async () => {
            setTeamLoading(url, true); // 同期の開始
            setTeamLoading(url, false); // 同期の完了（購読の値が 0 に戻る）
        });
        await waitFor(() => expect(ops()).toEqual(['town', 'me', 'mark']));
    });
});
