// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {useEffect} from 'react';

import {getLoadingTeamChannelsSubject} from '@store/team_load_store';

import {runNotifyDefaults} from './notify_defaults_runner';

import type {AppStateStatus} from 'react-native';

// K-172: 通知の初期値を整える処理を呼ぶ契機（詳細設計 §7.1）。結果は待たない（画面とログインを止めない）。
// ①同期が終わったとき（チーム・チャンネルの読み込み中の数が 0 になるたび。購読した直後の 0 も含む）
// ②前面に戻ったとき（appState が active）
// 呼び出しが重なっても、実行側が同じサーバーURLの2本目を止める。
export const useWeaverNotifyDefaults = (serverUrl: string, appState: AppStateStatus) => {
    useEffect(() => {
        const subscription = getLoadingTeamChannelsSubject(serverUrl).subscribe((loading) => {
            if (loading === 0) {
                runNotifyDefaults(serverUrl);
            }
        });
        return () => subscription.unsubscribe();
    }, [serverUrl]);

    useEffect(() => {
        if (appState === 'active') {
            runNotifyDefaults(serverUrl);
        }
    }, [appState, serverUrl]);
};
