// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-39, 2026-10): app log download is always disabled (app/weaver/allow_download_logs.ts).

import {withDatabase} from '@nozbe/watermelondb/DatabaseProvider';
import {withObservables} from '@nozbe/watermelondb/react';
import {map} from 'rxjs/operators';

import {Preferences} from '@constants';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeConfigValue, observeCurrentUserId, observeIsFreeEdition, observeReportAProblemMetadata} from '@queries/servers/system';

import {observeAllowDownloadLogs} from '../../weaver/allow_download_logs';

import ReportProblem from './report_problem';

const enhanced = withObservables([], ({database}) => {
    return {
        reportAProblemType: observeConfigValue(database, 'ReportAProblemType'),
        reportAProblemMail: observeConfigValue(database, 'ReportAProblemMail'),
        reportAProblemLink: observeConfigValue(database, 'ReportAProblemLink'),
        siteName: observeConfigValue(database, 'SiteName'),
        allowDownloadLogs: observeAllowDownloadLogs(database),
        isFreeEdition: observeIsFreeEdition(database),
        metadata: observeReportAProblemMetadata(database),
        currentUserId: observeCurrentUserId(database),
        attachLogsEnabled: queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.ADVANCED_SETTINGS, Preferences.ATTACH_APP_LOGS).
            observeWithColumns(['value']).
            pipe(map((prefs) => prefs[0]?.value === 'true')),
    };
});

export default withDatabase(enhanced(ReportProblem));
