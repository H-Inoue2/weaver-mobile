// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {getWeaverMessage} from '../messages';

// ログイン画面のSSOボタン（GitLab互換）の文言。ja は日本語、それ以外は英語。
export const getWeaverSsoText = (locale: string): string => getWeaverMessage(locale, 'weaver.sso_login');
