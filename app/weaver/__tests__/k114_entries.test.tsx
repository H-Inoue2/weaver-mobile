// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-114（メンバー追加画面・channel_info を「押した時点のサーバー」に固定）: 入口が serverUrl を積むことの単体テスト。
// 対象: K114-UT-01（AddMembers）・K114-UT-02/03（AddMembersBox）・K114-UT-15（InfoBox）。
// 期待結果の正は K114_詳細設計.md §3.1 と K114_単体テスト設計.md §1.1。テスト名は K114-UT-nn（既存の UT-nn と衝突するため）。
// @context/server は mock せず、実物の ServerProvider を使う（固定値を返す mock がバグを隠さないため）。

import {fireEvent, waitFor} from '@testing-library/react-native';
import React from 'react';

import AddMembersBox from '@components/channel_actions/add_members_box/add_members_box';
import InfoBox from '@components/channel_actions/info_box';
import {Screens} from '@constants';
import ServerProvider from '@context/server';
import {dismissBottomSheet, navigateToChannelInfoScreen, navigateToScreen} from '@screens/navigation';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import AddMembers from '../../screens/channel_info/options/add_members/add_members';

jest.mock('@screens/navigation');

const A = 'https://a.example';
const B = 'https://b.example';

const withServer = (url: string, child: React.ReactElement) => (
    <ServerProvider server={{displayName: url, url}}>{child}</ServerProvider>
);

let nowOffset = 0;
const realNow = Date.now.bind(Date);

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(dismissBottomSheet).mockResolvedValue(undefined);

    // usePreventDoubleTap は Date.now で 750ms を見る。テストごとに時刻をずらして互いに干渉させない。
    nowOffset += 10000;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + nowOffset);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('K-114 入口が serverUrl を積む', () => {
    it('K114-UT-01 AddMembers: navigateToChannelInfoScreen に {channelId, inModal:true, displayName, serverUrl:A} の4キーちょうど', () => {
        const r = renderWithIntlAndTheme(withServer(A, (
            <AddMembers
                channelId='C1'
                displayName='ch'
            />
        )));
        fireEvent.press(r.getByTestId('channel_info.options.add_members.option'));

        expect(navigateToChannelInfoScreen).toHaveBeenCalledTimes(1);
        const [screen, props] = jest.mocked(navigateToChannelInfoScreen).mock.calls[0];
        expect(screen).toBe(Screens.CHANNEL_ADD_MEMBERS);
        expect(props).toEqual({channelId: 'C1', inModal: true, displayName: 'ch', serverUrl: A});
        expect(Object.keys(props!).sort()).toEqual(['channelId', 'displayName', 'inModal', 'serverUrl']);
    });

    it('K114-UT-02 AddMembersBox(inModal=true): dismissBottomSheet は呼ばれず、serverUrl:A を積んで1回 navigate', async () => {
        const r = renderWithIntlAndTheme(withServer(A, (
            <AddMembersBox
                channelId='C1'
                displayName='ch'
                inModal={true}
                testID='k114.box'
            />
        )));
        fireEvent.press(r.getByTestId('k114.box'));

        await waitFor(() => expect(navigateToChannelInfoScreen).toHaveBeenCalledTimes(1));
        expect(dismissBottomSheet).toHaveBeenCalledTimes(0);
        const [screen, props] = jest.mocked(navigateToChannelInfoScreen).mock.calls[0];
        expect(screen).toBe(Screens.CHANNEL_ADD_MEMBERS);
        expect(props).toEqual({channelId: 'C1', displayName: 'ch', inModal: true, serverUrl: A});
        expect(Object.keys(props!).sort()).toEqual(['channelId', 'displayName', 'inModal', 'serverUrl']);
    });

    it('K114-UT-03 AddMembersBox(inModal=false): dismissBottomSheet を await する間に文脈が B に替わっても、押した時点の A を積む（先に dismiss → 後に navigate）', async () => {
        let release: () => void = () => undefined;
        jest.mocked(dismissBottomSheet).mockImplementation(() => new Promise<void>((resolve) => {
            release = resolve;
        }));

        const ui = (url: string) => withServer(url, (
            <AddMembersBox
                channelId='C1'
                displayName='ch'
                inModal={false}
                testID='k114.box'
            />
        ));
        const r = renderWithIntlAndTheme(ui(A));
        fireEvent.press(r.getByTestId('k114.box'));
        expect(dismissBottomSheet).toHaveBeenCalledTimes(1);
        expect(navigateToChannelInfoScreen).toHaveBeenCalledTimes(0);

        r.rerender(ui(B));
        release();

        await waitFor(() => expect(navigateToChannelInfoScreen).toHaveBeenCalledTimes(1));
        const [, props] = jest.mocked(navigateToChannelInfoScreen).mock.calls[0];
        expect(props).toEqual({channelId: 'C1', displayName: 'ch', inModal: false, serverUrl: A});
        expect(jest.mocked(dismissBottomSheet).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(navigateToChannelInfoScreen).mock.invocationCallOrder[0]);
    });

    it.each([
        ['showAsLabel なし', false],
        ['showAsLabel あり', true],
    ])('K114-UT-15 InfoBox(%s): dismiss の保留中に B へ替わっても navigateToScreen(CHANNEL_INFO, {channelId:C1, title, serverUrl:A}) を1回、dismiss の後に', async (_label, showAsLabel) => {
        let release: () => void = () => undefined;
        jest.mocked(dismissBottomSheet).mockImplementation(() => new Promise<void>((resolve) => {
            release = resolve;
        }));

        const ui = (url: string) => withServer(url, (
            <InfoBox
                channelId='C1'
                showAsLabel={showAsLabel}
                testID='k114.info'
            />
        ));
        const r = renderWithIntlAndTheme(ui(A));
        fireEvent.press(r.getByTestId('k114.info'));
        r.rerender(ui(B));
        release();

        await waitFor(() => expect(navigateToScreen).toHaveBeenCalledTimes(1));
        const [screen, props] = jest.mocked(navigateToScreen).mock.calls[0];
        expect(screen).toBe(Screens.CHANNEL_INFO);

        // title は messages 解決後の値（assets/base/i18n/en.json の screens.channel_info＝'Channel info'。defaultMessage の 'Channel Info' は使われない）
        expect(props).toEqual({channelId: 'C1', title: 'Channel info', serverUrl: A});
        expect(jest.mocked(dismissBottomSheet).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(navigateToScreen).mock.invocationCallOrder[0]);
    });
});
