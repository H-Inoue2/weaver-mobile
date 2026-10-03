// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import React from 'react';
import {Image, StyleSheet} from 'react-native';

import {View as ViewConstants} from '@constants';

import {WEAVER_LOGO} from '../images';

type Props = {
    theme: Theme;
}

const styles = StyleSheet.create({
    image: {
        width: ViewConstants.PROFILE_PICTURE_SIZE,
        height: ViewConstants.PROFILE_PICTURE_SIZE,
        borderRadius: ViewConstants.PROFILE_PICTURE_SIZE / 2,
    },
});

// システム投稿のアバター（Weaverのロゴ。円形）。
const WeaverSystemAvatar = ({theme}: Props) => {
    return (
        <Image
            source={WEAVER_LOGO}
            style={[styles.image, {backgroundColor: theme.centerChannelBg}]}
            testID='system_avatar.image'
        />
    );
};

export default WeaverSystemAvatar;
