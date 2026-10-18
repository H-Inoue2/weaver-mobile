// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-114, 2026-10): passes the opening server's URL (serverUrl) to the channel info screen so it stays pinned to that server.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import OptionBox from '@components/option_box';
import SlideUpPanelItem from '@components/slide_up_panel_item';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {dismissBottomSheet, navigateToScreen} from '@screens/navigation';

import type {StyleProp, ViewStyle} from 'react-native';

type Props = {
    channelId: string;
    containerStyle?: StyleProp<ViewStyle>;
    showAsLabel?: boolean;
    testID?: string;
}

const InfoBox = ({channelId, containerStyle, showAsLabel = false, testID}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const onViewInfo = useCallback(async () => {
        await dismissBottomSheet();
        const title = intl.formatMessage({id: 'screens.channel_info', defaultMessage: 'Channel Info'});
        navigateToScreen(Screens.CHANNEL_INFO, {channelId, title, serverUrl});
    }, [intl, channelId, serverUrl]);

    if (showAsLabel) {
        return (
            <SlideUpPanelItem
                leftIcon='information-outline'
                onPress={onViewInfo}
                testID={testID}
                text={intl.formatMessage({id: 'channel_header.info', defaultMessage: 'View info'})}
            />
        );
    }

    return (
        <OptionBox
            containerStyle={containerStyle}
            iconName='information-outline'
            onPress={onViewInfo}
            testID={testID}
            text={intl.formatMessage({id: 'intro.channel_info', defaultMessage: 'Info'})}
        />
    );
};

export default InfoBox;
