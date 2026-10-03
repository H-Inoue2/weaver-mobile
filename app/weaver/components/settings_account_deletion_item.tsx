// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import SettingItem from '@components/settings/item';
import {Screens} from '@constants';
import {usePreventDoubleTap} from '@hooks/utils';
import {navigateToSettingsScreen} from '@screens/navigation';

import {getWeaverMessage} from '../messages';

// 設定画面の「アカウントの削除について」項目（Aboutの項目と同じ型。optionName は既存の 'about' を借り、ラベルとアイコンを上書きする）。
const WeaverSettingsAccountDeletionItem = () => {
    const {locale} = useIntl();
    const label = getWeaverMessage(locale, 'weaver.settings.account_deletion');

    const goToAccountDeletion = usePreventDoubleTap(useCallback(() => {
        navigateToSettingsScreen(Screens.ACCOUNT_DELETION, {headerTitle: label});
    }, [label]));

    return (
        <SettingItem
            icon='account-outline'
            label={label}
            onPress={goToAccountDeletion}
            optionName='about'
            testID='settings.account_deletion.option'
        />
    );
};

export default WeaverSettingsAccountDeletionItem;
