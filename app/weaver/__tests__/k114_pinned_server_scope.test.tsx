// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-114: PinnedServerScope（app/weaver/components/pinned_server_scope.tsx。params の serverUrl に画面を固定する部品）と、
// それで包む2つのルート（(channel_info)/index・channel_add_members）の単体テスト。
// 対象: K114-UT-04〜08・11〜14・16・17・18。期待結果の正は K114_詳細設計.md §3.2・§3.3、K114_単体テスト設計.md §0・§1.2・§1.3。
// 取り決め: ①新部品は各テスト内で遅延 require する（未実装の間も1件ずつ失敗させるため）。②サーバー A=https://a.example（固定先）・
// B=https://b.example（last_active 側）・C/D は別。③subscribeActiveServers の通知は手で発火する（emitServers）。
// 通知の中身は実物の ServersModel（アプリDB）。④重複排除は Date.now() の 1500ms なので、Date.now をテストごとにずらして互いに干渉させない。
// ⑤K114-UT-13 の (a)〜(e) は互いに独立（各ケースで初期状態から作り直す）。

import {Database, Q} from '@nozbe/watermelondb';
import {DatabaseProvider, useDatabase} from '@nozbe/watermelondb/react';
import {act, waitFor} from '@testing-library/react-native';
import {router} from 'expo-router';
import React from 'react';
import {Alert, Text} from 'react-native';
import {BehaviorSubject} from 'rxjs';

import SelectedUserChipById from '@components/chips/selected_user_chip_by_id';
import {General, Screens} from '@constants';
import {MM_TABLES} from '@constants/database';
import ServerProvider, {useServerDisplayName, useServerUrl} from '@context/server';
import {withServerDatabase} from '@database/components';
import DatabaseManager from '@database/manager';
import {usePropsFromParams} from '@hooks/props_from_params';
import {dismissBottomSheet, navigateBack, navigateToRoot} from '@screens/navigation';
import {NavigationStore} from '@store/navigation_store';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';
import {logWarning} from '@utils/log';

import ChannelAddMembersRoute from '../../routes/(modals)/(channel_info)/channel_add_members';
import ChannelInfoRoute from '../../routes/(modals)/(channel_info)/index';

import type ServersModel from '@typings/database/models/app/servers';

// ---- 購読の差し替え：subscribeActiveServers の通知を手で発火する ----
const mockFeed: {
    latest?: unknown[];
    observers: Set<(servers: unknown[]) => void>;
    returnUndefined: boolean;
} = {observers: new Set(), returnUndefined: false};
jest.mock('@database/subscription/servers', () => ({
    subscribeActiveServers: (observer: (servers: unknown[]) => void) => {
        if (mockFeed.returnUndefined) {
            return undefined;
        }
        mockFeed.observers.add(observer);
        if (mockFeed.latest) {
            const snapshot = mockFeed.latest;
            Promise.resolve().then(() => observer(snapshot));
        }
        return {unsubscribe: () => mockFeed.observers.delete(observer)};
    },
}));

jest.mock('@screens/navigation');
jest.mock('@hooks/props_from_params', () => ({usePropsFromParams: jest.fn()}));
jest.mock('@hooks/navigation_header', () => ({
    useNavigationHeader: jest.fn(),
    getHeaderOptions: jest.fn(() => ({})),
    getModalHeaderOptions: jest.fn(() => ({})),
}));

// 画面本体はスタブ（スコープの内側から見える url と、受け取った props を文字で出す）
jest.mock('@screens/channel_add_members', () => {
    const mockReact = require('react');
    const {Text: MockText} = require('react-native');
    const {useServerUrl: mockUseServerUrl} = require('@context/server');
    const Stub = (props: Record<string, unknown>) => mockReact.createElement(MockText, {testID: 'stub.add_members'}, JSON.stringify({...props, url: mockUseServerUrl()}));
    return {__esModule: true, default: Stub};
});
jest.mock('@screens/channel_info', () => {
    const mockReact = require('react');
    const {Text: MockText} = require('react-native');
    const {useServerUrl: mockUseServerUrl} = require('@context/server');
    const Stub = (props: Record<string, unknown>) => mockReact.createElement(MockText, {testID: 'stub.channel_info'}, JSON.stringify({...props, url: mockUseServerUrl()}));
    return {__esModule: true, default: Stub};
});

const A = 'https://a.example';
const B = 'https://b.example';
const C = 'https://c.example';
const D = 'https://d.example';
const EN_TEXT = 'This screen was closed because the server could not be found.';
const OBSERVE_MSG = 'PinnedServerScope: outer context differs from pinned';

type AnyRecord = Record<string, unknown>;

const loadScope = () => require('../components/pinned_server_scope').default as React.ComponentType<{serverUrl: unknown; screenId: string; children?: React.ReactNode}>;

// ---- 時刻・画面スタックの制御 ----
let nowOffset = 0;
const realNow = Date.now.bind(Date);
const nav = {visible: undefined as string | undefined, subject: new BehaviorSubject<string | undefined>(undefined)};
const setVisible = async (screen: string | undefined) => {
    nav.visible = screen;
    await act(async () => {
        nav.subject.next(screen);
    });
};
const waitMs = (ms: number) => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
});

// ---- サーバーとアプリDB ----
const serversCollection = () => DatabaseManager.appDatabase!.database.get<ServersModel>(MM_TABLES.APP.SERVERS);

async function seedServer(url: string, id: string, lastActiveAt: number) {
    await DatabaseManager.createServerDatabase({
        config: {dbName: `k114-${id}`, dbType: 1, serverUrl: url, displayName: `Server ${id}`, identifier: `id-${id}`},
    } as never);
    await updateServer(url, (r) => {
        r.lastActiveAt = lastActiveAt;
    });
}

async function updateServer(url: string, change: (r: ServersModel) => void) {
    const server = (await serversCollection().query(Q.where('url', url)).fetch())[0];
    await DatabaseManager.appDatabase!.database.write(async () => {
        await server.update(change);
    });
}

async function emitServers() {
    const rows = await serversCollection().query(Q.where('identifier', Q.notEq(''))).fetch();
    mockFeed.latest = rows;
    await act(async () => {
        [...mockFeed.observers].forEach((o) => o(rows));
    });
}

async function resetWorld() {
    await DatabaseManager.initAppDatabase();
    const rows = await serversCollection().query().fetch();
    await DatabaseManager.appDatabase!.database.write(async () => {
        await Promise.all(rows.map((r) => r.destroyPermanently()));
    });
    DatabaseManager.serverDatabases = {};
    mockFeed.latest = undefined;
    mockFeed.observers.clear();
    mockFeed.returnUndefined = false;
}

const dbOf = (url: string) => DatabaseManager.serverDatabases[url]!.database;

// ---- 子（スコープの内側から見える文脈を記録する） ----
const probe = {url: '', displayName: '', db: null as Database | null, renders: 0, mounts: 0, unmounts: 0};
function Probe() {
    probe.url = useServerUrl();
    probe.displayName = useServerDisplayName();
    probe.db = useDatabase();
    probe.renders++;
    React.useEffect(() => {
        probe.mounts++;
        return () => {
            probe.unmounts++;
        };
    }, []);
    return <Text testID='probe'>{probe.url}</Text>;
}

type UiOptions = {
    serverUrl?: unknown;
    screenId?: string;
    outer?: string | 'none';
    outerKey?: string;
    extra?: React.ReactNode;
};

function buildUi({serverUrl, screenId = Screens.CHANNEL_ADD_MEMBERS, outer = B, outerKey = 'k0', extra}: UiOptions) {
    const Scope = loadScope();
    const inner = (
        <Scope
            serverUrl={serverUrl}
            screenId={screenId}
        >
            <Probe/>
        </Scope>
    );
    const body = outer === 'none' ? inner : (
        <ServerProvider server={{displayName: `outer ${outer}`, url: outer}}>{inner}</ServerProvider>
    );
    return (
        <DatabaseProvider
            database={dbOf(B)}
            key={outerKey}
        >
            {body}
            {extra}
        </DatabaseProvider>
    );
}

const renderScope = (options: UiOptions) => {
    const r = renderWithIntlAndTheme(buildUi(options));
    return {r, rerender: (next: UiOptions) => r.rerender(buildUi(next))};
};

const expectClosedOnce = () => {
    expect(navigateBack).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith('', EN_TEXT);
};

describe('K-114 PinnedServerScope', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        jest.mocked(dismissBottomSheet).mockResolvedValue(undefined);
        jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        jest.mocked(router.canGoBack).mockReturnValue(true);
        nowOffset += 10000;
        jest.spyOn(Date, 'now').mockImplementation(() => realNow() + nowOffset);
        Object.assign(probe, {url: '', displayName: '', db: null, renders: 0, mounts: 0, unmounts: 0});
        nav.visible = Screens.CHANNEL_ADD_MEMBERS;
        nav.subject = new BehaviorSubject<string | undefined>(Screens.CHANNEL_ADD_MEMBERS);
        (NavigationStore as unknown as {currentScreen$: unknown}).currentScreen$ = nav.subject.asObservable();
        (NavigationStore as unknown as {getVisibleScreen: () => string | undefined}).getVisibleScreen = () => nav.visible;
        await resetWorld();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const seedAB = async () => {
        await seedServer(A, 'A', 1000);
        await seedServer(B, 'B', 2000);
        await emitServers();
    };

    describe('供給（K114-UT-04・05・12・13・14・16）', () => {
        it('K114-UT-04 外側=B・params=A: 子の url は A、DB は A の DB（B の DB と別）、displayName は A', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(probe.url).toBe(A);
            expect(probe.db).toBe(dbOf(A));
            expect(probe.db).not.toBe(dbOf(B));
            expect(probe.displayName).toBe('Server A');
        });

        it('K114-UT-05 開いたまま B の last_active が3000、続けて C が4000で追加されても、url・DB・マウント回数は初期のまま、閉じる・アラートは0回', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());

            await updateServer(B, (s) => {
                s.lastActiveAt = 3000;
            });
            await emitServers();
            await seedServer(C, 'C', 4000);
            await emitServers();

            expect(probe.url).toBe(A);
            expect(probe.db).toBe(dbOf(A));
            expect(probe.mounts).toBe(1);
            expect(probe.unmounts).toBe(0);
            expect(navigateBack).toHaveBeenCalledTimes(0);
            expect(navigateToRoot).toHaveBeenCalledTimes(0);
            expect(Alert.alert).toHaveBeenCalledTimes(0);
        });

        it('K114-UT-12 値同一の通知3回では子は再描画されない（描画回数1）。displayName だけ変えた通知で描画2・マウント1のまま', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(probe.renders).toBe(1);

            await emitServers();
            await emitServers();
            await emitServers();
            expect(probe.renders).toBe(1);

            await updateServer(A, (s) => {
                s.displayName = 'Server A2';
            });
            await emitServers();
            expect(probe.renders).toBe(2);
            expect(probe.mounts).toBe(1);
            expect(probe.displayName).toBe('Server A2');
        });

        describe('K114-UT-13 DatabaseProvider の key の世代（各ケースは独立）', () => {
            const mountA = async (aLastActive: number) => {
                await seedServer(A, 'A', aLastActive);
                await seedServer(B, 'B', 2000);
                await seedServer(C, 'C', 500);
                await seedServer(D, 'D', 100);
                await emitServers();
                const {r} = renderScope({serverUrl: A});
                await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
                expect(probe.mounts).toBe(1);
            };

            it('K114-UT-13(a) A が表示中（最大）で同値の通知: マウント1のまま', async () => {
                await mountA(5000);
                await emitServers();
                expect(probe.mounts).toBe(1);
            });

            it('K114-UT-13(b) persistenceFlag を zero-persistence にし、A の lastActiveAt を更新して通知: マウント2。同値の通知後も2', async () => {
                await mountA(5000);
                await updateServer(A, (s) => {
                    s.persistenceFlag = 'zero-persistence';
                });
                expect(probe.mounts).toBe(1); // flag 単独では通知が来ない（F-16）
                await updateServer(A, (s) => {
                    s.lastActiveAt = 6000;
                });
                await emitServers();
                expect(probe.mounts).toBe(2);
                await emitServers();
                expect(probe.mounts).toBe(2);
            });

            it('K114-UT-13(c) serverDatabases[A].database を別の Database に差し替え、A の lastActiveAt を更新して通知: マウント2・DB は差し替え後', async () => {
                await mountA(5000);
                const replacement = dbOf(D);
                DatabaseManager.serverDatabases[A] = {...DatabaseManager.serverDatabases[A]!, database: replacement};
                await updateServer(A, (s) => {
                    s.lastActiveAt = 6000;
                });
                await emitServers();
                expect(probe.mounts).toBe(2);
                expect(probe.db).toBe(replacement);
            });

            it('K114-UT-13(d) A が非アクティブ（B が最大）で DB を差し替えるだけ（通知なし）: マウント1のまま（追従しない＝既知の限界・特性テスト）', async () => {
                await mountA(1000);
                DatabaseManager.serverDatabases[A] = {...DatabaseManager.serverDatabases[A]!, database: dbOf(D)};
                await waitMs(50);
                expect(probe.mounts).toBe(1);
            });

            it('K114-UT-13(e) (d) のあと C の lastActiveAt を更新して通知: マウント2（次の通知で追従）', async () => {
                await mountA(1000);
                const replacement = dbOf(D);
                DatabaseManager.serverDatabases[A] = {...DatabaseManager.serverDatabases[A]!, database: replacement};
                await updateServer(C, (s) => {
                    s.lastActiveAt = 700;
                });
                await emitServers();
                expect(probe.mounts).toBe(2);
                expect(probe.db).toBe(replacement);
            });
        });

        it('K114-UT-14 固定先 DB での名前解決: A の DB の U1=alice、B の DB の U1=bob。外側=B・params=A なら alice が出て bob は出ない', async () => {
            await seedAB();
            await DatabaseManager.serverDatabases[A]!.operator.handleUsers({users: [TestHelper.fakeUser({id: 'U1', username: 'alice'})], prepareRecordsOnly: false});
            await DatabaseManager.serverDatabases[B]!.operator.handleUsers({users: [TestHelper.fakeUser({id: 'U1', username: 'bob'})], prepareRecordsOnly: false});

            const Scope = loadScope();
            const r = renderWithIntlAndTheme(
                <DatabaseProvider database={dbOf(B)}>
                    <ServerProvider server={{displayName: 'outer', url: B}}>
                        <Scope
                            serverUrl={A}
                            screenId={Screens.CHANNEL_ADD_MEMBERS}
                        >
                            <SelectedUserChipById
                                userId='U1'
                                onPress={jest.fn()}
                                teammateNameDisplay={General.TEAMMATE_NAME_DISPLAY.SHOW_USERNAME}
                                testID='k114.chip'
                            />
                        </Scope>
                    </ServerProvider>
                </DatabaseProvider>,
            );
            await waitFor(() => expect(JSON.stringify(r.toJSON())).toContain('alice'));
            expect(JSON.stringify(r.toJSON())).not.toContain('bob');
        });

        it('K114-UT-16 外側を実物 withServerDatabase にした合成: B を5000に更新、続けて C を6000で追加（外側が再マウント）しても、子は常に A（url・DB）', async () => {
            await seedAB();
            const Scope = loadScope();
            const outerProbe = {url: ''};
            const Outer = withServerDatabase(() => {
                outerProbe.url = useServerUrl();
                return (
                    <Scope
                        serverUrl={A}
                        screenId={Screens.CHANNEL_ADD_MEMBERS}
                    >
                        <Probe/>
                    </Scope>
                );
            });
            const r = renderWithIntlAndTheme(<Outer/>);
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(outerProbe.url).toBe(B);
            expect(probe.url).toBe(A);
            expect(probe.db).toBe(dbOf(A));

            await updateServer(B, (s) => {
                s.lastActiveAt = 5000;
            });
            await emitServers();
            await seedServer(C, 'C', 6000);
            await emitServers();
            await waitFor(() => expect(outerProbe.url).toBe(C));
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(probe.url).toBe(A);
            expect(probe.db).toBe(dbOf(A));
        });
    });

    describe('fail-closed（K114-UT-06・07・08・11）', () => {
        it('K114-UT-06(a) params 欠落・戻れる: 子は0個、navigateBack 1・Alert(\'\', 文言) 1・logWarning 1（URL・資格情報を含まない）', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: undefined});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            expect(r.queryByTestId('probe')).toBeNull();
            expectClosedOnce();
            expect(logWarning).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toMatch(/example/);
        });

        it('K114-UT-06(a2) params が空文字でも (a) と同じ', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: ''});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            expect(r.queryByTestId('probe')).toBeNull();
            expectClosedOnce();
        });

        it('K114-UT-06(b) 戻れない（canGoBack=false）: navigateToRoot 1・navigateBack 0', async () => {
            await seedAB();
            jest.mocked(router.canGoBack).mockReturnValue(false);
            renderScope({serverUrl: undefined});
            await waitFor(() => expect(navigateToRoot).toHaveBeenCalledTimes(1));
            expect(navigateBack).toHaveBeenCalledTimes(0);
        });

        it('K114-UT-06(c) ボトムシート（screenId=GENERIC_BOTTOM_SHEET）: dismissBottomSheet 1・navigateBack/navigateToRoot 0', async () => {
            await seedAB();
            await setVisible(Screens.GENERIC_BOTTOM_SHEET);
            renderScope({serverUrl: undefined, screenId: Screens.GENERIC_BOTTOM_SHEET});
            await waitFor(() => expect(dismissBottomSheet).toHaveBeenCalledTimes(1));
            expect(navigateBack).toHaveBeenCalledTimes(0);
            expect(navigateToRoot).toHaveBeenCalledTimes(0);
        });

        it('K114-UT-06(d) navigateBack が何もしないとき: 800ms 後に null の代わりに同じ文言のテキストが1つ描画される', async () => {
            await seedAB();
            jest.mocked(navigateBack).mockImplementation(() => undefined);
            const {r} = renderScope({serverUrl: undefined});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            expect(r.queryAllByText(EN_TEXT)).toHaveLength(0);
            await waitMs(900);
            expect(r.queryAllByText(EN_TEXT)).toHaveLength(1);
        });

        it('K114-UT-06(e) 閉じる実行の直後（1500ms 以内）に同じ screenId の別の無効画面が最前面になる: navigateBack・Alert の追加呼び出し0、800ms 後にフォールバック文言は描画される', async () => {
            await seedAB();
            const first = renderScope({serverUrl: undefined});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            first.r.unmount();

            const second = renderScope({serverUrl: undefined});
            await waitMs(900);
            expect(navigateBack).toHaveBeenCalledTimes(1);
            expect(Alert.alert).toHaveBeenCalledTimes(1);
            expect(second.r.queryAllByText(EN_TEXT)).toHaveLength(1);
        });

        it('K114-UT-06(f) 最前面でない間は0回、最前面になった時点で (a) と同じ', async () => {
            await seedAB();
            await setVisible(Screens.CHANNEL_INFO);
            renderScope({serverUrl: undefined});
            await waitMs(100);
            expect(navigateBack).toHaveBeenCalledTimes(0);
            expect(Alert.alert).toHaveBeenCalledTimes(0);

            await setVisible(Screens.CHANNEL_ADD_MEMBERS);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            expect(Alert.alert).toHaveBeenCalledTimes(1);
        });

        it.each([
            ['数値 123', 123],
            ['配列', [A]],
            ['オブジェクト {}', {}],
            ['null', null],
            ['末尾スラッシュ（登録は末尾なし）', `${A}/`],
        ])('K114-UT-07 params 不正（%s）: 子0個・navigateBack 1・Alert 1（正規化せず未登録として閉じる）', async (_label, value) => {
            await seedAB();
            const {r} = renderScope({serverUrl: value});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            expect(r.queryByTestId('probe')).toBeNull();
            expectClosedOnce();
        });

        it('K114-UT-08(a) 通知に A が無い状態でマウント: 子0個・navigateBack ちょうど1回（通知を3回送っても1回）', async () => {
            await seedServer(B, 'B', 2000);
            await emitServers();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            await emitServers();
            await emitServers();
            await emitServers();
            await waitMs(100);
            expect(r.queryByTestId('probe')).toBeNull();
            expect(navigateBack).toHaveBeenCalledTimes(1);
        });

        it('K114-UT-08(b) 利用可能になった後 A の identifier を空にして通知: 子0個・navigateBack ちょうど1回（通知を重ねても1回）', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(navigateBack).toHaveBeenCalledTimes(0);

            await updateServer(A, (s) => {
                s.identifier = '';
            });
            await emitServers();
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            await emitServers();
            await emitServers();
            await waitMs(100);
            expect(r.queryByTestId('probe')).toBeNull();
            expect(navigateBack).toHaveBeenCalledTimes(1);
        });

        it('K114-UT-08(c) 未登録のまま外側の key を変えて100ms以内に再マウント: 再マウントをまたいで合計 navigateBack 1・Alert 1', async () => {
            await seedServer(B, 'B', 2000);
            await emitServers();
            const {rerender} = renderScope({serverUrl: A, outerKey: 'k1'});
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            rerender({serverUrl: A, outerKey: 'k2'});
            await waitMs(200);
            expectClosedOnce();
        });

        it('K114-UT-08(d) 最前面が別画面→screenId になった時点で1回。1500ms 経過後に再度最前面になると再実行できる（計2回）', async () => {
            await seedServer(B, 'B', 2000);
            await emitServers();
            await setVisible(Screens.CHANNEL_INFO);
            renderScope({serverUrl: A});
            await waitMs(100);
            expect(navigateBack).toHaveBeenCalledTimes(0);

            await setVisible(Screens.CHANNEL_ADD_MEMBERS);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));

            nowOffset += 1600;
            await setVisible(Screens.CHANNEL_INFO);
            await setVisible(Screens.CHANNEL_ADD_MEMBERS);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(2));
        });

        it('K114-UT-08(e) 別 screenId（CHANNEL_INFO と CHANNEL_ADD_MEMBERS）の2画面が1500ms以内に連続で最前面になる: 閉じる実行は画面ごとに1回（計2）、Alert は計1', async () => {
            await seedServer(B, 'B', 2000);
            await emitServers();
            await setVisible(undefined);
            const Scope = loadScope();
            renderWithIntlAndTheme(
                <DatabaseProvider database={dbOf(B)}>
                    <ServerProvider server={{displayName: 'outer', url: B}}>
                        <Scope
                            serverUrl={A}
                            screenId={Screens.CHANNEL_INFO}
                        >
                            <Probe/>
                        </Scope>
                        <Scope
                            serverUrl={A}
                            screenId={Screens.CHANNEL_ADD_MEMBERS}
                        >
                            <Probe/>
                        </Scope>
                    </ServerProvider>
                </DatabaseProvider>,
            );
            await setVisible(Screens.CHANNEL_ADD_MEMBERS);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
            await setVisible(Screens.CHANNEL_INFO);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(2));
            expect(Alert.alert).toHaveBeenCalledTimes(1);
        });

        it('K114-UT-11 読込中（購読が未発火）: 子0個、navigateBack・Alert・logWarning 0回', async () => {
            await seedAB();
            mockFeed.latest = undefined;
            const {r} = renderScope({serverUrl: A});
            await waitMs(100);
            expect(r.queryByTestId('probe')).toBeNull();
            expect(navigateBack).toHaveBeenCalledTimes(0);
            expect(Alert.alert).toHaveBeenCalledTimes(0);
            expect(logWarning).toHaveBeenCalledTimes(0);
        });

        it('K114-UT-11(境界) subscribeActiveServers が undefined を返すとき（DB 未初期化）も読込中のまま', async () => {
            await seedAB();
            mockFeed.returnUndefined = true;
            const {r} = renderScope({serverUrl: A});
            await waitMs(100);
            expect(r.queryByTestId('probe')).toBeNull();
            expect(navigateBack).toHaveBeenCalledTimes(0);
            expect(Alert.alert).toHaveBeenCalledTimes(0);
            expect(logWarning).toHaveBeenCalledTimes(0);
        });
    });

    describe('観測ログ（K114-UT-17）', () => {
        const observeCalls = () => jest.mocked(logWarning).mock.calls.filter((c) => c[0] === OBSERVE_MSG);

        it('K114-UT-17(a) 外側=B・params=A・A は最大でない: pinnedIsLastActive=false のログが1回。URL を含まない。通知を重ねても増えない', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(observeCalls()).toHaveLength(1);
            expect(observeCalls()[0]).toEqual([OBSERVE_MSG, {screenId: Screens.CHANNEL_ADD_MEMBERS, pinnedIsLastActive: false}]);
            expect(JSON.stringify(observeCalls())).not.toMatch(/a\.example|b\.example/);
            await emitServers();
            await emitServers();
            expect(observeCalls()).toHaveLength(1);
        });

        it('K114-UT-17(a2) 外側=B・params=A・A が last_active 最大: pinnedIsLastActive=true のログが1回', async () => {
            await seedServer(A, 'A', 5000);
            await seedServer(B, 'B', 2000);
            await emitServers();
            const {r} = renderScope({serverUrl: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(observeCalls()).toEqual([[OBSERVE_MSG, {screenId: Screens.CHANNEL_ADD_MEMBERS, pinnedIsLastActive: true}]]);
        });

        it('K114-UT-17(b) 外側=A・params=A: 観測ログ0回', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A, outer: A});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(observeCalls()).toHaveLength(0);
        });

        it('K114-UT-17(c) 外側の URL が空: 観測ログ0回', async () => {
            await seedAB();
            const {r} = renderScope({serverUrl: A, outer: 'none'});
            await waitFor(() => expect(r.queryByTestId('probe')).not.toBeNull());
            expect(observeCalls()).toHaveLength(0);
        });
    });

    describe('ルート2本の結線（K114-UT-18）', () => {
        const withParams = (params: AnyRecord | undefined) => {
            jest.mocked(usePropsFromParams).mockReturnValue((params ?? {}) as never);
        };

        it('K114-UT-18 channel_add_members: 有効な params なら画面本体が channelId=C1 で描画され、中の url は A。欠落なら本体0個で閉じる（screenId=CHANNEL_ADD_MEMBERS）', async () => {
            await seedAB();
            withParams({serverUrl: A, channelId: 'C1'});
            const ok = renderWithIntlAndTheme(
                <DatabaseProvider database={dbOf(B)}>
                    <ServerProvider server={{displayName: 'outer', url: B}}>
                        <ChannelAddMembersRoute/>
                    </ServerProvider>
                </DatabaseProvider>,
            );
            await waitFor(() => expect(ok.queryByTestId('stub.add_members')).not.toBeNull());
            expect(JSON.parse(ok.getByTestId('stub.add_members').props.children)).toEqual({channelId: 'C1', url: A});
            ok.unmount();

            nowOffset += 3000;
            withParams({channelId: 'C1'});
            await setVisible(Screens.CHANNEL_INFO); // 別画面が最前面の間は閉じない（screenId が CHANNEL_ADD_MEMBERS であることの確認）
            const ng = renderWithIntlAndTheme(
                <DatabaseProvider database={dbOf(B)}>
                    <ServerProvider server={{displayName: 'outer', url: B}}>
                        <ChannelAddMembersRoute/>
                    </ServerProvider>
                </DatabaseProvider>,
            );
            await waitMs(100);
            expect(ng.queryByTestId('stub.add_members')).toBeNull();
            expect(navigateBack).toHaveBeenCalledTimes(0);
            await setVisible(Screens.CHANNEL_ADD_MEMBERS);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
        });

        it('K114-UT-18 (channel_info)/index: 有効な params なら画面本体が channelId=C1・groupCallsAllowed=true で描画され、中の url は A。欠落なら本体0個で閉じる（screenId=CHANNEL_INFO）', async () => {
            await seedAB();
            await setVisible(Screens.CHANNEL_INFO);
            withParams({serverUrl: A, channelId: 'C1', groupCallsAllowed: true, title: 'T'});
            const ok = renderWithIntlAndTheme(
                <DatabaseProvider database={dbOf(B)}>
                    <ServerProvider server={{displayName: 'outer', url: B}}>
                        <ChannelInfoRoute/>
                    </ServerProvider>
                </DatabaseProvider>,
            );
            await waitFor(() => expect(ok.queryByTestId('stub.channel_info')).not.toBeNull());
            expect(JSON.parse(ok.getByTestId('stub.channel_info').props.children)).toEqual({channelId: 'C1', groupCallsAllowed: true, url: A});
            ok.unmount();

            nowOffset += 3000;
            withParams({channelId: 'C1', title: 'T'});
            await setVisible(Screens.CHANNEL_ADD_MEMBERS); // 別画面が最前面の間は閉じない
            const ng = renderWithIntlAndTheme(
                <DatabaseProvider database={dbOf(B)}>
                    <ServerProvider server={{displayName: 'outer', url: B}}>
                        <ChannelInfoRoute/>
                    </ServerProvider>
                </DatabaseProvider>,
            );
            await waitMs(100);
            expect(ng.queryByTestId('stub.channel_info')).toBeNull();
            expect(navigateBack).toHaveBeenCalledTimes(0);
            await setVisible(Screens.CHANNEL_INFO);
            await waitFor(() => expect(navigateBack).toHaveBeenCalledTimes(1));
        });
    });
});
