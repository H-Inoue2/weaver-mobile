// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-39, 2026-10): app log download is always disabled (app/weaver/allow_download_logs.ts).

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';

import {observeConfigValue} from '@queries/servers/system';

import {observeAllowDownloadLogs} from '../../../weaver/allow_download_logs';

import ReportProblem from './report_problem';

const enhanced = withObservables([], ({database}) => ({
    allowDownloadLogs: observeAllowDownloadLogs(database),
    reportAProblemType: observeConfigValue(database, 'ReportAProblemType'),
}));

export default withDatabase(enhanced(ReportProblem));
