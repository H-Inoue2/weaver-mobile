// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-114: 画面を「params で渡された serverUrl のサーバー」に固定する部品。
// 上流の withServerDatabase は last_active_at が最大のサーバーを文脈にするため、モーダルを開いたあとに別サーバーが最大になると
// useServerUrl()・DB だけが入れ替わり、開いた時点の channelId と別サーバーの組ができる。ここでは last_active_at を一切見ず、
// params の URL に一致するサーバーの文脈（DatabaseProvider → UserLocaleProvider → ServerProvider）を供給する。
// ThemeProvider・DeviceInfoProvider は入れない（ThemeProvider は updateThemeIfNeeded でグローバルのテーマを書き換えるため。外側のものを使う）。
// 詳細設計: .claude/outputs/mobile/K114_詳細設計.md §3.2

import {DatabaseProvider} from '@nozbe/watermelondb/react';
import {router} from 'expo-router';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';

import {Screens} from '@constants';
import ServerProvider, {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import UserLocaleProvider from '@context/user_locale';
import DatabaseManager from '@database/manager';
import {subscribeActiveServers} from '@database/subscription/servers';
import {dismissBottomSheet, navigateBack, navigateToRoot} from '@screens/navigation';
import {NavigationStore} from '@store/navigation_store';
import {logWarning} from '@utils/log';
import {secureGetFromRecord} from '@utils/types';

import {useWeaverMessage} from '../messages';

import type {Database} from '@nozbe/watermelondb';
import type ServersModel from '@typings/database/models/app/servers';
import type {PersistenceFlag} from '@typings/database/models/app/servers';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    serverUrl: unknown;
    screenId: AvailableScreens;
    children?: React.ReactNode;
}

type ScopeState =
    | {kind: 'loading'}
    | {kind: 'unavailable'}
    | {kind: 'available'; database: Database; displayName: string; persistenceFlag: PersistenceFlag; generation: number};

const LOADING: ScopeState = {kind: 'loading'};
const UNAVAILABLE: ScopeState = {kind: 'unavailable'};

// 閉じる実行は screenId ごと、アラートはモジュール全体で、この間隔に1回（key による再マウントでの二重実行の防止）
const DEDUPE_MS = 1500;

// 閉じる実行のあと、まだ最前面のままなら取り残しとみなしてフォールバック表示にするまでの時間
const LEFT_BEHIND_MS = 800;

const lastCloseAtByScreen: Record<string, number | undefined> = {};
let lastAlertAt = 0;

const OBSERVE_MESSAGE = 'PinnedServerScope: outer context differs from pinned';

const styles = StyleSheet.create({
    fallback: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    fallbackText: {
        textAlign: 'center',
        fontSize: 16,
    },
});

const PinnedServerScope = ({serverUrl, screenId, children}: Props) => {
    const theme = useTheme();
    const getMessage = useWeaverMessage();
    const outerUrl = useServerUrl();
    const [state, setState] = useState<ScopeState>(LOADING);
    const [showFallback, setShowFallback] = useState(false);

    // 有効な URL（空でない文字列）だけを扱う。正規化はしない（DatabaseManager のキーと完全一致させる）。
    const pinnedUrl = typeof serverUrl === 'string' && serverUrl.length > 0 ? serverUrl : undefined;

    // 購読のコールバックは古いレンダーの値を握るため、最新値は ref 経由で読む。
    const outerUrlRef = useRef(outerUrl);
    outerUrlRef.current = outerUrl;
    const messageRef = useRef('');
    messageRef.current = getMessage('weaver.pinned_server.unavailable');
    const observedRef = useRef(false);

    useEffect(() => {
        if (!pinnedUrl) {
            return undefined;
        }

        const observer = (servers: ServersModel[]) => {
            const list = servers || [];
            const server = list.find((s) => s.url === pinnedUrl);
            const database = server ? secureGetFromRecord(DatabaseManager.serverDatabases, server.url)?.database : undefined;

            if (!server || !database) {
                setState((prev) => (prev.kind === 'unavailable' ? prev : UNAVAILABLE));
                return;
            }

            if (!observedRef.current) {
                observedRef.current = true;
                const outer = outerUrlRef.current;
                if (outer && outer !== pinnedUrl) {
                    // withServerDatabase と同じ最大選択（同値は先の要素が勝つ）で、固定先が表示中のサーバーかを記録する
                    const lastActive = list.reduce((a, b) => (b.lastActiveAt > a.lastActiveAt ? b : a));
                    logWarning(OBSERVE_MESSAGE, {screenId, pinnedIsLastActive: lastActive.url === pinnedUrl});
                }
            }

            setState((prev) => {
                if (prev.kind === 'available' &&
                    prev.database === database &&
                    prev.displayName === server.displayName &&
                    prev.persistenceFlag === server.persistenceFlag) {
                    return prev;
                }
                let generation = 0;
                if (prev.kind === 'available') {
                    generation = prev.database === database ? prev.generation : prev.generation + 1;
                }
                return {
                    kind: 'available',
                    database,
                    displayName: server.displayName,
                    persistenceFlag: server.persistenceFlag,
                    generation,
                };
            });
        };

        setState(LOADING);
        const subscription = subscribeActiveServers(observer);
        return () => {
            subscription?.unsubscribe();
        };
    }, [pinnedUrl, screenId]);

    // 無効（params 欠落）または利用不能（未登録・削除）の間だけ、閉じる動作を待ち受ける
    let closeReason: 'missing' | 'unregistered' | undefined;
    if (!pinnedUrl) {
        closeReason = 'missing';
    } else if (state.kind === 'unavailable') {
        closeReason = 'unregistered';
    }

    useEffect(() => {
        if (!closeReason) {
            setShowFallback(false);
            return undefined;
        }

        let previous: string | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const close = () => {
            const now = Date.now();
            const last = lastCloseAtByScreen[screenId];
            if (last !== undefined && now - last < DEDUPE_MS) {
                return;
            }
            lastCloseAtByScreen[screenId] = now;

            logWarning(closeReason === 'missing' ? 'PinnedServerScope: serverUrl param is missing' : 'PinnedServerScope: pinned server is not registered', {screenId});

            let closing: Promise<unknown> | void;
            if (screenId === Screens.GENERIC_BOTTOM_SHEET) {
                closing = dismissBottomSheet();
            } else if (router.canGoBack()) {
                closing = navigateBack();
            } else {
                closing = navigateToRoot();
            }
            Promise.resolve(closing).catch(() => undefined);

            if (now - lastAlertAt >= DEDUPE_MS) {
                lastAlertAt = now;
                Alert.alert('', messageRef.current);
            }
        };

        const subscription = NavigationStore.currentScreen$.subscribe((screen) => {
            const becameFront = screen === screenId && previous !== screenId;
            previous = screen;
            if (!becameFront) {
                return;
            }

            close();

            // 閉じる実行を省いた場合も含め、最前面になってから一定時間後にまだ残っていれば、取り残しとして文言を出す
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                timer = undefined;
                if (NavigationStore.getVisibleScreen() === screenId) {
                    setShowFallback(true);
                }
            }, LEFT_BEHIND_MS);
        });

        return () => {
            subscription.unsubscribe();
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [closeReason, screenId]);

    const available = state.kind === 'available' ? state : undefined;
    const serverValue = useMemo(() => ({displayName: available?.displayName ?? '', url: pinnedUrl ?? ''}), [available?.displayName, pinnedUrl]);

    if (closeReason) {
        if (!showFallback) {
            return null;
        }
        return (
            <View style={styles.fallback}>
                <Text style={[styles.fallbackText, {color: theme.centerChannelColor}]}>{messageRef.current}</Text>
            </View>
        );
    }

    if (!available || !pinnedUrl) {
        return null;
    }

    // adapter（永続↔メモリ）や DB の参照が替わったら key を替えて子を再マウントする（withObservables は mount 時にしか DB を束縛しないため）
    const dbKey = `${available.persistenceFlag === 'zero-persistence' ? `${pinnedUrl}.mem` : pinnedUrl}#${available.generation}`;

    return (
        <DatabaseProvider
            database={available.database}
            key={dbKey}
        >
            <UserLocaleProvider database={available.database}>
                <ServerProvider server={serverValue}>
                    {children}
                </ServerProvider>
            </UserLocaleProvider>
        </DatabaseProvider>
    );
};

export default PinnedServerScope;
