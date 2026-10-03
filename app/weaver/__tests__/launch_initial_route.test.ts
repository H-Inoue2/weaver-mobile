// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループV（UT-284〜285）: app/init/launch.ts の determineInitialExpoRoute（起動直後の経路。ビルド9の実機で「リンクが無効」の有力な原因）
// SSO の戻りURLで起動（または起動直後に Linking.getInitialURL が SSO 戻りURLを返す）したとき、深いリンクの起動として扱わない:
//   返す route の params は通常起動（launchType=Launch.Normal）で、launchError が付かない。
// 本物の深いリンクのときは従来どおり launchType=Launch.DeepLink。

import {Linking} from 'react-native';
import {Notifications} from 'react-native-notifications';

import {Launch} from '@constants';
import DatabaseManager from '@database/manager';
import {getServerCredentials} from '@init/credentials';
import {getActiveServer, getAllServers} from '@queries/app/servers';

import {determineInitialExpoRoute} from '../../init/launch';

jest.mock('@init/credentials');
jest.mock('@queries/app/servers');
jest.mock('@queries/app/global');
jest.mock('@queries/servers/preference');
jest.mock('@queries/servers/team');
jest.mock('@store/ephemeral_store');
jest.mock('@actions/remote/entry');
jest.mock('@actions/remote/thread');
jest.mock('@actions/remote/channel');
jest.mock('@actions/local/post');
jest.mock('@utils/deep_link', () => ({
    ...jest.requireActual('@utils/deep_link'),
    handleDeepLink: jest.fn(),
}));

const setInitialUrl = (url: string | null) => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(url);
};

describe('determineInitialExpoRoute と SSO 戻りURL', () => {
    beforeEach(() => {
        jest.mocked(getActiveServer).mockResolvedValue(undefined);
        jest.mocked(getAllServers).mockResolvedValue([]);
        jest.mocked(getServerCredentials).mockResolvedValue(null);
        DatabaseManager.searchUrl = jest.fn().mockReturnValue(undefined);
        DatabaseManager.getServerDatabaseAndOperator = jest.fn().mockReturnValue({database: {}, operator: {}});
        DatabaseManager.getServerUrlFromIdentifier = jest.fn().mockResolvedValue(undefined);

        // setup.ts の mock に getInitialNotification が無いため、このテストで足す（通知なしの起動）
        (Notifications as unknown as Record<string, unknown>).getInitialNotification = jest.fn().mockResolvedValue(undefined);
    });

    it.each([
        'mmauthbeta://callback?login_code=x&state=y&srv=z',
        'mmauth://callback?login_code=x&state=y&srv=z',
    ])('UT-284 getInitialURL が SSO 戻りURL（%s）のとき、params は通常起動で launchError が付かない', async (url) => {
        setInitialUrl(url);

        const result = await determineInitialExpoRoute();

        expect(result.params.launchType).toBe(Launch.Normal);
        expect(result.params.launchError).toBeUndefined();
        expect(result.params.extra).toBeUndefined();
    });

    it('UT-285 本物の深いリンクのときは従来どおり DeepLink（launchType=DeepLink・coldStart=true・extra あり）', async () => {
        setInitialUrl('https://community.example.com/team/channels/town-square');

        const result = await determineInitialExpoRoute();

        expect(result.params.launchType).toBe(Launch.DeepLink);
        expect(result.params.coldStart).toBe(true);
        expect(result.params.extra).toBeDefined();
    });
});
