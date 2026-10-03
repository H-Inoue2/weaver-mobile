// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useTheme} from '@context/theme';
import {useUserLocale} from '@context/user_locale';
import {getHeaderOptions, useNavigationHeader} from '@hooks/navigation_header';

import {getWeaverMessage} from '../../../weaver/messages';
import LanguageScreen from '../../../weaver/screens/language';

// 言語の選択画面のルート（settings_display_*.tsx と同型）。
export default function SettingsDisplayLanguageRoute() {
    const theme = useTheme();
    const locale = useUserLocale();

    useNavigationHeader({
        showWhenPushed: true,
        headerOptions: {
            headerTitle: getWeaverMessage(locale, 'weaver.settings.language'),
            ...getHeaderOptions(theme),
        },
    });

    return (<LanguageScreen/>);
}
