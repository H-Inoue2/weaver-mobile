// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-114, 2026-10): passes the opening server's URL (serverUrl) to the add-members screen so it stays pinned to that server.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Platform} from 'react-native';

import OptionItem from '@components/option_item';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {usePreventDoubleTap} from '@hooks/utils';
import {navigateToChannelInfoScreen} from '@screens/navigation';

type Props = {
    channelId: string;
    displayName: string;
}

const AddMembers = ({displayName, channelId}: Props) => {
    const {formatMessage} = useIntl();
    const serverUrl = useServerUrl();
    const title = formatMessage({id: 'channel_info.add_members', defaultMessage: 'Add members'});

    const goToAddMembers = usePreventDoubleTap(useCallback(async () => {
        navigateToChannelInfoScreen(Screens.CHANNEL_ADD_MEMBERS, {channelId, inModal: true, displayName, serverUrl});
    }, [channelId, displayName, serverUrl]));

    return (
        <OptionItem
            action={goToAddMembers}
            label={title}
            icon='account-plus-outline'
            type={Platform.select({ios: 'arrow', default: 'default'})}
            testID='channel_info.options.add_members.option'
        />
    );
};

export default AddMembers;
