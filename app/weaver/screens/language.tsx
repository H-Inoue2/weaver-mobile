// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import availableLanguages from '@i18n/languages';
import React, {useCallback, useState} from 'react';

import {updateMe} from '@actions/remote/user';
import SettingBlock from '@components/settings/block';
import SettingContainer from '@components/settings/container';
import SettingOption from '@components/settings/option';
import SettingSeparator from '@components/settings/separator';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useUserLocale} from '@context/user_locale';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {getLocaleFromLanguage} from '@i18n';
import {navigateBack} from '@screens/navigation';

import {LANGUAGE_NAMES} from '../language_names';

const CODES = Object.keys(availableLanguages);

// アプリの表示言語（Mattermost のユーザーの locale）を選ぶ画面。選ぶと updateMe で locale を更新する。
// 現在の選択は、ユーザーの locale（無ければ端末の言語）。すでに選択中の言語を選んでも何もしない。
const LanguageScreen = () => {
    const serverUrl = useServerUrl();
    const userLocale = useUserLocale();
    const [selected, setSelected] = useState(getLocaleFromLanguage(userLocale));

    useAndroidHardwareBackHandler(Screens.SETTINGS_DISPLAY_LANGUAGE, navigateBack);

    const onSelect = useCallback((code: string) => {
        if (code === selected) {
            return;
        }
        setSelected(code);
        updateMe(serverUrl, {locale: code});
    }, [selected, serverUrl]);

    return (
        <SettingContainer testID='language_settings'>
            <SettingBlock disableHeader={true}>
                {CODES.map((code) => (
                    <React.Fragment key={code}>
                        <SettingOption
                            action={onSelect}
                            label={LANGUAGE_NAMES[code] || code}
                            selected={code === selected}
                            testID={`language_settings.option.${code}`}
                            type='select'
                            value={code}
                        />
                        <SettingSeparator/>
                    </React.Fragment>
                ))}
            </SettingBlock>
        </SettingContainer>
    );
};

export default LanguageScreen;
