// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-120, 2026-10): the push proxy status passed to the view is gated by SHOW_PUSH_PROXY_WARNING (app/weaver/push_proxy_warning.ts). The stored status is not changed.

import {withObservables} from '@nozbe/watermelondb/react';
import {of as of$} from 'rxjs';

import {Tutorial} from '@constants';
import {PUSH_PROXY_STATUS_UNKNOWN} from '@constants/push_proxy';
import DatabaseManager from '@database/manager';
import {observeTutorialWatched} from '@queries/app/global';
import {observePushVerificationStatus} from '@queries/servers/system';

import {observeDisplayedPushProxyStatus, SHOW_PUSH_PROXY_WARNING} from '../../../../../../weaver/push_proxy_warning';

import ServerItem from './server_item';

import type ServersModel from '@typings/database/models/app/servers';

const enhance = withObservables(['highlight'], ({highlight, server}: {highlight: boolean; server: ServersModel}) => {
    let tutorialWatched = of$(false);
    if (highlight) {
        tutorialWatched = observeTutorialWatched(Tutorial.MULTI_SERVER);
    }

    const serverDatabase = DatabaseManager.serverDatabases[server.url]?.database;

    return {
        server: server.observe(),
        tutorialWatched,
        pushProxyStatus: observeDisplayedPushProxyStatus(serverDatabase ? observePushVerificationStatus(serverDatabase) : of$(PUSH_PROXY_STATUS_UNKNOWN), SHOW_PUSH_PROXY_WARNING),
    };
});

export default enhance(ServerItem);
