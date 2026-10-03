// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Text, View} from 'react-native';

import Button from '@components/button';
import SettingContainer from '@components/settings/container';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {usePreventDoubleTap} from '@hooks/utils';
import {navigateBack} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {tryOpenURL} from '@utils/url';
import {onOpenLinkError} from '@utils/url/links';

import {ACCOUNT_DELETION_URL, PRIVACY_POLICY_URL, SUPPORT_URL} from '../constants';
import {getWeaverMessage, type WeaverMessageKey} from '../messages';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        container: {
            paddingTop: 12,
            paddingBottom: 32,
        },
        title: {
            ...typography('Heading', 600, 'SemiBold'),
            color: theme.centerChannelColor,
            marginBottom: 12,
        },
        heading: {
            ...typography('Heading', 300, 'SemiBold'),
            color: theme.centerChannelColor,
            marginTop: 24,
            marginBottom: 8,
        },
        body: {
            ...typography('Body', 200, 'Regular'),
            color: theme.centerChannelColor,
            marginBottom: 8,
        },
        note: {
            ...typography('Body', 100, 'Regular'),
            color: changeOpacity(theme.centerChannelColor, 0.72),
            marginBottom: 8,
        },
        button: {
            marginTop: 12,
            marginBottom: 8,
        },
        link: {
            ...typography('Body', 200, 'Regular'),
            color: theme.linkColor,
            marginTop: 8,
        },
    };
});

type TextBlock = {
    key: WeaverMessageKey;
    kind: 'title' | 'heading' | 'body' | 'note';
};

// 表示順は運用設計 §7.1 の並び。testID は文言キーから 'weaver.' を除いたもの。
const BEFORE_BUTTON: TextBlock[] = [
    {key: 'weaver.account_deletion.title', kind: 'title'},
    {key: 'weaver.account_deletion.lead', kind: 'body'},
    {key: 'weaver.account_deletion.how.title', kind: 'heading'},
    {key: 'weaver.account_deletion.how.step1', kind: 'body'},
    {key: 'weaver.account_deletion.how.step2', kind: 'body'},
    {key: 'weaver.account_deletion.how.note1', kind: 'note'},
    {key: 'weaver.account_deletion.how.note2', kind: 'note'},
];

const AFTER_BUTTON: TextBlock[] = [
    {key: 'weaver.account_deletion.data.title', kind: 'heading'},
    {key: 'weaver.account_deletion.data.account', kind: 'body'},
    {key: 'weaver.account_deletion.data.posts', kind: 'body'},
    {key: 'weaver.account_deletion.data.workflow', kind: 'body'},
    {key: 'weaver.account_deletion.device.title', kind: 'heading'},
    {key: 'weaver.account_deletion.device.body', kind: 'body'},
];

const testIdOf = (key: string) => key.replace(/^weaver\./, '');

// アカウント削除の案内画面。静的な画面で、サーバー通信・DB参照をしない。
const AccountDeletionScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);

    useAndroidHardwareBackHandler(Screens.ACCOUNT_DELETION, navigateBack);

    const openURL = useCallback((url: string) => {
        const onError = () => {
            onOpenLinkError(intl);
        };

        tryOpenURL(url, onError);
    }, [intl]);

    const openSupport = usePreventDoubleTap(useCallback(() => openURL(SUPPORT_URL), [openURL]));
    const openDetail = usePreventDoubleTap(useCallback(() => openURL(ACCOUNT_DELETION_URL), [openURL]));
    const openPrivacy = usePreventDoubleTap(useCallback(() => openURL(PRIVACY_POLICY_URL), [openURL]));

    const renderBlock = ({key, kind}: TextBlock) => (
        <Text
            key={key}
            style={style[kind]}
            testID={testIdOf(key)}
        >
            {getWeaverMessage(intl.locale, key)}
        </Text>
    );

    return (
        <SettingContainer testID='account_deletion'>
            <View style={style.container}>
                {BEFORE_BUTTON.map(renderBlock)}
                {Boolean(SUPPORT_URL) && (
                    <View style={style.button}>
                        <Button
                            emphasis='tertiary'
                            onPress={openSupport}
                            size='lg'
                            testID='account_deletion.support_button'
                            text={getWeaverMessage(intl.locale, 'weaver.account_deletion.support_button')}
                            theme={theme}
                        />
                    </View>
                )}
                {AFTER_BUTTON.map(renderBlock)}
                {Boolean(ACCOUNT_DELETION_URL) && (
                    <Text
                        onPress={openDetail}
                        style={style.link}
                        testID='account_deletion.link.detail'
                    >
                        {getWeaverMessage(intl.locale, 'weaver.account_deletion.link.detail')}
                    </Text>
                )}
                {Boolean(PRIVACY_POLICY_URL) && (
                    <Text
                        onPress={openPrivacy}
                        style={style.link}
                        testID='account_deletion.link.privacy'
                    >
                        {getWeaverMessage(intl.locale, 'weaver.account_deletion.link.privacy')}
                    </Text>
                )}
            </View>
        </SettingContainer>
    );
};

export default AccountDeletionScreen;
