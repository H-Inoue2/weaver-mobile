// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import React, {useCallback} from 'react';

import SettingItem from '@components/settings/item';
import {Screens} from '@constants';
import {useUserLocale} from '@context/user_locale';
import {usePreventDoubleTap} from '@hooks/utils';
import {getLocaleFromLanguage} from '@i18n';
import {navigateToSettingsScreen} from '@screens/navigation';

import {LANGUAGE_NAMES} from '../language_names';
import {getWeaverMessage} from '../messages';

// 設定→表示の「言語」項目。右側に、現在の言語の自称を出す（optionName は既存の 'about' を借り、ラベルとアイコンを上書きする）。
const WeaverSettingsLanguageItem = () => {
    const userLocale = useUserLocale();

    const goToLanguage = usePreventDoubleTap(useCallback(() => {
        navigateToSettingsScreen(Screens.SETTINGS_DISPLAY_LANGUAGE);
    }, []));

    return (
        <SettingItem
            icon='globe'
            info={LANGUAGE_NAMES[getLocaleFromLanguage(userLocale)]}
            label={getWeaverMessage(userLocale, 'weaver.settings.language')}
            onPress={goToLanguage}
            optionName='about'
            testID='display_settings.language.option'
        />
    );
};

export default WeaverSettingsLanguageItem;
