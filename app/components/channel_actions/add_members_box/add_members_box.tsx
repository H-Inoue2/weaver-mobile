// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-114, 2026-10): passes the opening server's URL (serverUrl) to the add-members screen so it stays pinned to that server.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import OptionBox from '@components/option_box';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {dismissBottomSheet, navigateToChannelInfoScreen} from '@screens/navigation';

import type {StyleProp, ViewStyle} from 'react-native';

type Props = {
    channelId: string;
    displayName: string;
    inModal?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    testID: string;
}

const AddMembersBox = ({
    channelId,
    displayName,
    inModal,
    containerStyle,
    testID,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const onAddMembers = useCallback(async () => {
        if (!inModal) {
            await dismissBottomSheet();
        }

        navigateToChannelInfoScreen(Screens.CHANNEL_ADD_MEMBERS, {channelId, displayName, inModal, serverUrl});
    }, [inModal, channelId, displayName, serverUrl]);

    return (
        <OptionBox
            containerStyle={containerStyle}
            iconName='account-plus-outline'
            onPress={onAddMembers}
            testID={testID}
            text={intl.formatMessage({id: 'intro.add_members', defaultMessage: 'Add members'})}
        />
    );
};

export default AddMembersBox;
