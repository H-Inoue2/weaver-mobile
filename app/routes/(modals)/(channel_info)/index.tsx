// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-114, 2026-10): the screen is pinned to the server in the serverUrl param (PinnedServerScope), so a last-active server switch cannot swap its server context.

import {useNavigation} from 'expo-router';

import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {getModalHeaderOptions, useNavigationHeader} from '@hooks/navigation_header';
import {usePropsFromParams} from '@hooks/props_from_params';
import ChannelInfoScreen from '@screens/channel_info';

import PinnedServerScope from '../../../weaver/components/pinned_server_scope';

type ChannelInfoRouteProps = {
    title: string;
    channelId: string;
    groupCallsAllowed: boolean;
    serverUrl?: string;
}

export default function ChannelInfoRoute() {
    const navigation = useNavigation();
    const {title, channelId, groupCallsAllowed, serverUrl} = usePropsFromParams<ChannelInfoRouteProps>();
    const theme = useTheme();

    useNavigationHeader({
        showWhenPushed: true,
        headerOptions: {
            headerTitle: title,
            ...getModalHeaderOptions(theme, navigation.goBack, 'close.channel_info.button'),
        },
    });

    return (
        <PinnedServerScope
            serverUrl={serverUrl}
            screenId={Screens.CHANNEL_INFO}
        >
            <ChannelInfoScreen
                channelId={channelId}
                groupCallsAllowed={groupCallsAllowed}
            />
        </PinnedServerScope>
    );
}
