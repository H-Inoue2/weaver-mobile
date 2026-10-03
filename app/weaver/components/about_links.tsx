// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Text} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {tryOpenURL} from '@utils/url';
import {onOpenLinkError} from '@utils/url/links';

import {PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL} from '../constants';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        noticeLink: {
            color: theme.linkColor,
            ...typography('Body', 50),
        },
        footerText: {
            color: changeOpacity(theme.centerChannelColor, 0.5),
            ...typography('Body', 50),
            marginBottom: 10,
        },
        hyphenText: {
            marginBottom: 0,
        },
    };
});

// 利用規約・プライバシーポリシーのリンク。サーバー設定は使わず、アプリ固定の定数だけを使う。
// 値が空のリンクは出さない（Mattermost社のURLへのフォールバックはしない）。
const WeaverAboutLinks = () => {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);

    const openURL = useCallback((url: string) => {
        const onError = () => {
            onOpenLinkError(intl);
        };

        tryOpenURL(url, onError);
    }, [intl]);

    const handleTermsOfService = usePreventDoubleTap(useCallback(() => {
        return openURL(TERMS_OF_SERVICE_URL);
    }, [openURL]));

    const handlePrivacyPolicy = usePreventDoubleTap(useCallback(() => {
        return openURL(PRIVACY_POLICY_URL);
    }, [openURL]));

    const showTerms = Boolean(TERMS_OF_SERVICE_URL);
    const showPrivacy = Boolean(PRIVACY_POLICY_URL);

    return (
        <>
            {showTerms && (
                <FormattedText
                    id={'mobile.tos_link'}
                    defaultMessage='Terms of Service'
                    style={style.noticeLink}
                    onPress={handleTermsOfService}
                    testID='about.terms_of_service'
                />
            )}
            {showTerms && showPrivacy && (
                <Text style={[style.footerText, style.hyphenText]}>
                    {' - '}
                </Text>
            )}
            {showPrivacy && (
                <FormattedText
                    id={'mobile.privacy_link'}
                    defaultMessage='Privacy Policy'
                    style={style.noticeLink}
                    onPress={handlePrivacyPolicy}
                    testID='about.privacy_policy'
                />
            )}
        </>
    );
};

export default WeaverAboutLinks;
