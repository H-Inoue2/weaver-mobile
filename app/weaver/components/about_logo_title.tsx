// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import React from 'react';
import {Image, Text} from 'react-native';

import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {APP_NAME} from '../constants';
import {WEAVER_LOGO} from '../images';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        logo: {
            width: 80,
            height: 80,
            borderRadius: 18,
        },
        title: {
            ...typography('Heading', 700, 'SemiBold'),
            color: theme.centerChannelColor,
            textAlign: 'center',
            marginTop: 8,
            marginBottom: 8,
        },
    };
});

// About 画面のロゴとタイトル。色付きの画像なのでテーマ色では塗らない。
const WeaverAboutLogoTitle = () => {
    const theme = useTheme();
    const style = getStyleSheet(theme);

    return (
        <>
            <Image
                source={WEAVER_LOGO}
                style={style.logo}
                testID='about.logo'
            />
            <Text
                style={style.title}
                testID='about.title'
            >
                {APP_NAME}
            </Text>
        </>
    );
};

export default WeaverAboutLogoTitle;
