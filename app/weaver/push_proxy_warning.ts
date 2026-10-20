// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {of as of$, type Observable} from 'rxjs';

import {PUSH_PROXY_STATUS_VERIFIED} from '@constants/push_proxy';

// サーバー一覧・ホームのサーバー名の横に出る「通知を受け取れません」警告を表示するかのスイッチ（K-120）。
// false の間は、端末 DB に保存した通知中継の検証状態は変えず、画面へ渡す値だけを verified にして警告を止める。
// K-80（通知中継の整備）が完了したあとで true に戻すかを決める暫定の措置。戻す手順は K120_詳細設計.md §6。
// 小関数が show を引数で受けるのは、jest.mock では同じモジュール内の定数を差し替えられないため（呼び出し側が定数を明示で渡す）。
export const SHOW_PUSH_PROXY_WARNING = false;

// show が false なら、元の状態を購読せず verified を同期で 1 回流す。true なら元の Observable をそのまま返す。
export const observeDisplayedPushProxyStatus = (status$: Observable<string>, show: boolean = SHOW_PUSH_PROXY_WARNING): Observable<string> => {
    return show ? status$ : of$(PUSH_PROXY_STATUS_VERIFIED);
};
