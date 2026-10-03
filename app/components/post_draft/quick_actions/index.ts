// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-39, 2026-10): app log attachment is always disabled (app/weaver/allow_download_logs.ts).

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React from 'react';
import {combineLatest} from 'rxjs';
import {map} from 'rxjs/operators';

import {observeIsAgentsEnabled} from '@agents/queries/agents';
import {Preferences} from '@constants';
import {withServerUrl} from '@context/server';
import {observeIsBoREnabled, observeIsPostPriorityEnabled} from '@queries/servers/post';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeCanUploadFiles} from '@queries/servers/security';
import {observeMaxFileCount} from '@queries/servers/system';

import {observeAllowDownloadLogs} from '../../../weaver/allow_download_logs';

import QuickActions from './quick_actions';

import type {WithDatabaseArgs} from '@typings/database/database';

type EnhancedProps = WithDatabaseArgs & {
    serverUrl: string;
}

const enhanced = withObservables([], ({database, serverUrl}: EnhancedProps) => {
    const canUploadFiles = observeCanUploadFiles(database);
    const maxFileCount = observeMaxFileCount(database);
    const allowDownloadLogs = observeAllowDownloadLogs(database);
    const attachLogsEnabled = queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.ADVANCED_SETTINGS, Preferences.ATTACH_APP_LOGS).
        observeWithColumns(['value']).
        pipe(map((prefs) => prefs[0]?.value === 'true'));

    return {
        canUploadFiles,
        isAgentsEnabled: observeIsAgentsEnabled(serverUrl),
        isPostPriorityEnabled: observeIsPostPriorityEnabled(database),
        isBoREnabled: observeIsBoREnabled(database),
        maxFileCount,
        showAttachLogs: combineLatest([allowDownloadLogs, attachLogsEnabled]).pipe(
            map(([allowed, enabled]) => allowed && enabled),
        ),
    };
});

export default React.memo(withDatabase(withServerUrl(enhanced(QuickActions))));
