// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {map} from 'rxjs/operators';

import {observeConfigBooleanValue} from '@queries/servers/system';

import type {Database} from '@nozbe/watermelondb';

// アプリのログのダウンロード・添付を、サーバーの設定にかかわらず無効にする（問合せの窓口にログを添付できないため）。
// 1行書式（export const NAME = ...;）を守ること。
export const ALLOW_DOWNLOAD_LOGS = false;

// サーバーの AllowDownloadLogs（未設定は許可）と ALLOW_DOWNLOAD_LOGS の AND。
export const observeAllowDownloadLogs = (database: Database) => {
    return observeConfigBooleanValue(database, 'AllowDownloadLogs', true).pipe(
        map((allowedByServer) => allowedByServer && ALLOW_DOWNLOAD_LOGS),
    );
};
