// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

import {useTheme} from '@context/theme';
import {getHeaderOptions, useNavigationHeader} from '@hooks/navigation_header';
import {usePropsFromParams} from '@hooks/props_from_params';

import AccountDeletionScreen from '../../../weaver/screens/account_deletion';

type Props = {
    headerTitle?: string;
};

// アカウント削除の案内画面のルート（about ルートと同型）。
export default function AccountDeletionRoute() {
    const {headerTitle} = usePropsFromParams<Props>();
    const theme = useTheme();

    useNavigationHeader({
        showWhenPushed: true,
        headerOptions: {
            headerTitle,
            ...getHeaderOptions(theme),
        },
    });

    return (<AccountDeletionScreen/>);
}
