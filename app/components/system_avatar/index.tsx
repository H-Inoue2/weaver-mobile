// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-39, 2026-10): the system-post avatar is now the Weaver logo (was the Mattermost icon).

import React from 'react';

import WeaverSystemAvatar from '../../weaver/components/system_avatar';

type Props = {
    theme: Theme;
}

const SystemAvatar = ({theme}: Props) => {
    return <WeaverSystemAvatar theme={theme}/>;
};

export default SystemAvatar;
