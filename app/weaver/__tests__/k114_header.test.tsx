// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-114: チャンネルヘッダー（app/screens/channel/header/header.tsx）の単体テスト。
// 対象: K114-UT-22（onTitlePress が serverUrl を積む）・K114-UT-21（クイックアクションのシートが開いた時点のサーバーに固定される）。
// 期待結果の正は K114_詳細設計.md §3.1（header.tsx 行）・J-14、K114_単体テスト設計.md §1.1・§1.3。
// 既存の header.test.tsx は useServerUrl を固定値で mock しているため、ここでは @context/server を mock せず実物の ServerProvider を使う。
// 新部品 PinnedServerScope は未実装でも1件ずつ失敗するよう、このテストファイルは直接 import しない（header.tsx 経由でのみ使われる）。

import {DatabaseProvider} from '@nozbe/watermelondb/react';
import {act, fireEvent, waitFor} from '@testing-library/react-native';
import React, {type ComponentProps} from 'react';
import {BehaviorSubject} from 'rxjs';

import {General, Screens} from '@constants';
import {MM_TABLES} from '@constants/database';
import ServerProvider from '@context/server';
import DatabaseManager from '@database/manager';
import {bottomSheet, dismissBottomSheet, navigateToChannelInfoScreen, navigateToScreen} from '@screens/navigation';
import {NavigationStore} from '@store/navigation_store';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import ChannelHeader from '../../screens/channel/header/header';

// ---- 購読の差し替え（subscribeActiveServers の通知を手で発火する） ----
const mockFeed: {latest?: unknown[]; observers: Set<(servers: unknown[]) => void>} = {observers: new Set()};
jest.mock('@database/subscription/servers', () => ({
    subscribeActiveServers: (observer: (servers: unknown[]) => void) => {
        mockFeed.observers.add(observer);
        if (mockFeed.latest) {
            const snapshot = mockFeed.latest;
            Promise.resolve().then(() => observer(snapshot));
        }
        return {unsubscribe: () => mockFeed.observers.delete(observer)};
    },
}));

// ---- シート内容の観測（QuickActions は子スタブに置換。設計 UT-21 が許す形） ----
const mockQa: {url: string; db: unknown} = {url: '', db: null};
jest.mock('../../screens/channel/header/quick_actions', () => {
    const mockReact = require('react');
    const {View: MockView} = require('react-native');
    const {useServerUrl: mockUseServerUrl} = require('@context/server');
    const {useDatabase: mockUseDatabase} = require('@nozbe/watermelondb/react');
    const MockInfoBox = require('@components/channel_actions/info_box').default;
    const MockAddMembersBox = require('@components/channel_actions/add_members_box/add_members_box').default;
    const QuickActions = ({channelId}: {channelId: string}) => {
        mockQa.url = mockUseServerUrl();
        mockQa.db = mockUseDatabase();
        return mockReact.createElement(MockView, null,
            mockReact.createElement(MockInfoBox, {channelId, showAsLabel: true, testID: 'k114.qa.info'}),
            mockReact.createElement(MockAddMembersBox, {channelId, displayName: 'ch', testID: 'k114.qa.add'}),
        );
    };
    return {__esModule: true, default: QuickActions, MARGIN: 8, SEPARATOR_HEIGHT: 1};
});

jest.mock('@components/navigation_header', () => ({
    __esModule: true,
    default: jest.fn(),
}));
jest.mock('@screens/navigation');
jest.mock('@playbooks/screens/navigation');
jest.mock('@playbooks/actions/remote/runs');
jest.mock('@calls/state', () => ({getCallsConfig: jest.fn().mockReturnValue({pluginEnabled: false})}));
jest.mock('@calls/hooks', () => ({useNavigationHeaderCallButtonForDM: jest.fn()}));

// eslint-disable-next-line import/order
import NavigationHeader from '@components/navigation_header';

const A = 'https://a.example';
const B = 'https://b.example';

type HeaderProps = ComponentProps<typeof ChannelHeader>;

const baseProps = (): HeaderProps => ({
    channelId: 'C1',
    channelType: 'O',
    currentUserId: 'current-user-id',
    displayName: 'Test Channel',
    teamId: 'team-id',
    hasPlaybookRuns: false,
    playbooksActiveRuns: 0,
    callsEnabledInChannel: false,
    groupCallsAllowed: true,
    isBookmarksEnabled: false,
    canAddBookmarks: false,
    canCallDMUser: true,
    hasBookmarks: false,
    shouldRenderBookmarks: false,
    isCustomStatusEnabled: false,
    isCustomStatusExpired: false,
    isOwnDirectMessage: false,
    shouldRenderChannelBanner: false,
    isPlaybooksEnabled: false,
    isChannelAutotranslated: false,
    channelAttributes: [],
});

let nowOffset = 0;
const realNow = Date.now.bind(Date);
const nav = {visible: undefined as string | undefined, subject: new BehaviorSubject<string | undefined>(undefined)};

async function seedServer(url: string, id: string, lastActiveAt: number) {
    await DatabaseManager.createServerDatabase({
        config: {dbName: `k114-${id}`, dbType: 1, serverUrl: url, displayName: `Server ${id}`, identifier: `id-${id}`},
    } as never);
    const appDb = DatabaseManager.appDatabase!.database;
    const server = (await appDb.get(MM_TABLES.APP.SERVERS).query().fetch()).find((s) => (s as unknown as {url: string}).url === url)!;
    await appDb.write(async () => {
        await server.update((r) => {
            (r as unknown as {lastActiveAt: number}).lastActiveAt = lastActiveAt;
        });
    });
}

async function emitServers() {
    const rows = await DatabaseManager.appDatabase!.database.get(MM_TABLES.APP.SERVERS).query().fetch();
    mockFeed.latest = rows;
    await act(async () => {
        [...mockFeed.observers].forEach((o) => o(rows));
    });
}

async function resetWorld() {
    await DatabaseManager.initAppDatabase();
    const appDb = DatabaseManager.appDatabase!.database;
    const rows = await appDb.get(MM_TABLES.APP.SERVERS).query().fetch();
    await appDb.write(async () => {
        await Promise.all(rows.map((r) => r.destroyPermanently()));
    });
    DatabaseManager.serverDatabases = {};
    mockFeed.latest = undefined;
    mockFeed.observers.clear();
}

const renderHeader = (url: string, props: HeaderProps = baseProps()) => {
    const ui = (u: string, p: HeaderProps) => (
        <ServerProvider server={{displayName: u, url: u}}>
            <ChannelHeader {...p}/>
        </ServerProvider>
    );
    const r = renderWithIntlAndTheme(ui(url, props));
    return {r, rerenderAt: (u: string, p: HeaderProps = props) => r.rerender(ui(u, p))};
};

const headerProps = (r: ReturnType<typeof renderWithIntlAndTheme>) => r.getByTestId('navigation-header').props as ComponentProps<typeof NavigationHeader>;

describe('K-114 チャンネルヘッダー', () => {
    beforeAll(async () => {
        jest.mocked(NavigationHeader).mockImplementation((props) => React.createElement('NavigationHeader', {testID: 'navigation-header', ...props}));
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.mocked(dismissBottomSheet).mockResolvedValue(undefined);
        nowOffset += 10000;
        jest.spyOn(Date, 'now').mockImplementation(() => realNow() + nowOffset);
        mockQa.url = '';
        mockQa.db = null;
        nav.visible = undefined;
        nav.subject = new BehaviorSubject<string | undefined>(undefined);
        (NavigationStore as unknown as {currentScreen$: unknown}).currentScreen$ = nav.subject.asObservable();
        (NavigationStore as unknown as {getVisibleScreen: () => string | undefined}).getVisibleScreen = () => nav.visible;
        await resetWorld();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it.each([
        ['O', undefined, 'Channel info'],
        [General.DM_CHANNEL, undefined, 'Direct message info'],
        [General.GM_CHANNEL, undefined, 'Group message info'],
    ])('K114-UT-22 onTitlePress(channelType=%s): navigateToScreen(CHANNEL_INFO, {channelId, title, groupCallsAllowed, serverUrl}) の4キーちょうど。url=A で A、B へ再描画して押すと B', (channelType, _x, expectedTitle) => {
        const props = {...baseProps(), channelType: channelType as ChannelType, groupCallsAllowed: true};
        const {r, rerenderAt} = renderHeader(A, props);

        act(() => {
            headerProps(r).onTitlePress!();
        });
        expect(navigateToScreen).toHaveBeenCalledTimes(1);
        const [screen, args] = jest.mocked(navigateToScreen).mock.calls[0];
        expect(screen).toBe(Screens.CHANNEL_INFO);
        expect(args).toEqual({channelId: 'C1', title: expectedTitle, groupCallsAllowed: true, serverUrl: A});
        expect(Object.keys(args!).sort()).toEqual(['channelId', 'groupCallsAllowed', 'serverUrl', 'title']);

        // usePreventDoubleTap（750ms）を超えるよう時刻をずらしてから、url=B で再描画して押す
        nowOffset += 2000;
        rerenderAt(B, props);
        act(() => {
            headerProps(r).onTitlePress!();
        });
        expect(navigateToScreen).toHaveBeenCalledTimes(2);
        expect(jest.mocked(navigateToScreen).mock.calls[1][1]).toEqual({channelId: 'C1', title: expectedTitle, groupCallsAllowed: true, serverUrl: B});
    });

    it('K114-UT-21 クイックアクション: A で開いたシート内容を外側 B の文脈の下に描画しても、子の useServerUrl()・DB は A、入口の serverUrl も A（bottomSheet の第2引数は [1, height] のまま）', async () => {
        await seedServer(A, 'A', 1000);
        await seedServer(B, 'B', 2000);
        await emitServers();
        const dbA = DatabaseManager.serverDatabases[A]!.database;
        const dbB = DatabaseManager.serverDatabases[B]!.database;

        // ヘッダーは A の文脈で描画し、クイックアクションのボタンを押す
        const r = renderWithIntlAndTheme(
            <ServerProvider server={{displayName: 'A', url: A}}>
                <DatabaseProvider database={dbA}>
                    <ChannelHeader {...baseProps()}/>
                </DatabaseProvider>
            </ServerProvider>,
        );
        const button = headerProps(r).rightButtons!.find((b) => b.id === 'channel-quick-actions')!;
        act(() => {
            button.onPress();
        });
        expect(bottomSheet).toHaveBeenCalledTimes(1);
        const [renderContent, snapPoints] = jest.mocked(bottomSheet).mock.calls[0];
        expect(snapPoints).toEqual([1, expect.any(Number)]);

        // シート本体は別ルート。last_active が B に替わった後の外側（B の文脈）の下で、捕捉した renderContent() を描画する
        nav.visible = Screens.GENERIC_BOTTOM_SHEET;
        nav.subject.next(Screens.GENERIC_BOTTOM_SHEET);
        const sheet = renderWithIntlAndTheme(
            <ServerProvider server={{displayName: 'B', url: B}}>
                <DatabaseProvider database={dbB}>
                    {renderContent() as React.ReactElement}
                </DatabaseProvider>
            </ServerProvider>,
        );
        await waitFor(() => expect(mockQa.url).not.toBe(''));
        expect(mockQa.url).toBe(A);
        expect(mockQa.db).toBe(dbA);
        expect(mockQa.db).not.toBe(dbB);

        // シート内の入口を押す（dismissBottomSheet は即解決）
        fireEvent.press(sheet.getByTestId('k114.qa.info'));
        await waitFor(() => expect(navigateToScreen).toHaveBeenCalledTimes(1));
        expect(jest.mocked(navigateToScreen).mock.calls[0][1]).toEqual(expect.objectContaining({channelId: 'C1', serverUrl: A}));

        fireEvent.press(sheet.getByTestId('k114.qa.add'));
        await waitFor(() => expect(navigateToChannelInfoScreen).toHaveBeenCalledTimes(1));
        expect(jest.mocked(navigateToChannelInfoScreen).mock.calls[0][1]).toEqual(expect.objectContaining({channelId: 'C1', serverUrl: A}));
        expect(JSON.stringify([jest.mocked(navigateToScreen).mock.calls, jest.mocked(navigateToChannelInfoScreen).mock.calls])).not.toContain('b.example');
    });
});
