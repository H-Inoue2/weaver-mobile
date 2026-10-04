// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39 初回接続時の「このサーバーからは通知を受け取れない」アラートの抑止（UT-PP-01〜06）。
// サーバーへの接続直後に呼ばれる canReceiveNotifications は、ping の CanReceiveNotifications が 'false'（NOT_AVAILABLE）でも
// アラートを出さない。ただし検証状態（EphemeralStore）は従来どおり NOT_AVAILABLE に記録する（ヘッダーの警告アイコンが
// 状態を示し続け、タップで説明を見られる）。'unknown'（中継が一時的に応答しない等）のアラートは従来どおり出す。

import {Alert} from 'react-native';

import {PUSH_PROXY_RESPONSE_NOT_AVAILABLE, PUSH_PROXY_RESPONSE_UNKNOWN, PUSH_PROXY_RESPONSE_VERIFIED, PUSH_PROXY_STATUS_NOT_AVAILABLE, PUSH_PROXY_STATUS_UNKNOWN, PUSH_PROXY_STATUS_VERIFIED} from '@constants/push_proxy';
import EphemeralStore from '@store/ephemeral_store';
import {alertPushProxyError, canReceiveNotifications} from '@utils/push_proxy';

import type {IntlShape} from 'react-intl';

const mockGetAck = jest.fn();
const mockStoreAck = jest.fn();

jest.mock('react-native', () => ({
    Alert: {alert: jest.fn()},
}));

jest.mock('@actions/app/global', () => ({
    storePushDisabledInServerAcknowledged: (...args: unknown[]) => mockStoreAck(...args),
}));

jest.mock('@queries/app/global', () => ({
    getPushDisabledInServerAcknowledged: (...args: unknown[]) => mockGetAck(...args),
}));

jest.mock('@store/ephemeral_store', () => ({
    setPushProxyVerificationState: jest.fn(),
}));

jest.mock('@utils/security', () => ({
    urlSafeBase64Encode: jest.fn((url: string) => `encoded-${url}`),
}));

describe('canReceiveNotifications（接続直後のアラート）', () => {
    const serverUrl = 'https://weaver.example.com';
    const intl = {
        formatMessage: ({defaultMessage}: {defaultMessage: string}) => defaultMessage,
    } as IntlShape;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetAck.mockResolvedValue(false);
    });

    it('UT-PP-01 NOT_AVAILABLE・未確認: アラートを出さない', async () => {
        await canReceiveNotifications(serverUrl, PUSH_PROXY_RESPONSE_NOT_AVAILABLE, intl);
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('UT-PP-02 NOT_AVAILABLE: 検証状態は NOT_AVAILABLE に記録する（ヘッダーの警告アイコンの元）', async () => {
        await canReceiveNotifications(serverUrl, PUSH_PROXY_RESPONSE_NOT_AVAILABLE, intl);
        expect(EphemeralStore.setPushProxyVerificationState).toHaveBeenCalledTimes(1);
        expect(EphemeralStore.setPushProxyVerificationState).toHaveBeenCalledWith(serverUrl, PUSH_PROXY_STATUS_NOT_AVAILABLE);
    });

    it('UT-PP-03 NOT_AVAILABLE・確認済み: アラートを出さず、状態は記録する', async () => {
        mockGetAck.mockResolvedValue(true);
        await canReceiveNotifications(serverUrl, PUSH_PROXY_RESPONSE_NOT_AVAILABLE, intl);
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(EphemeralStore.setPushProxyVerificationState).toHaveBeenCalledWith(serverUrl, PUSH_PROXY_STATUS_NOT_AVAILABLE);
    });

    it('UT-PP-04 UNKNOWN: 従来どおりアラートを1回出し、状態は UNKNOWN に記録する', async () => {
        await canReceiveNotifications(serverUrl, PUSH_PROXY_RESPONSE_UNKNOWN, intl);
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Notifications could not be received from this server');
        expect(EphemeralStore.setPushProxyVerificationState).toHaveBeenCalledWith(serverUrl, PUSH_PROXY_STATUS_UNKNOWN);
    });

    it('UT-PP-05 VERIFIED（true）: アラートなし、状態は VERIFIED', async () => {
        await canReceiveNotifications(serverUrl, PUSH_PROXY_RESPONSE_VERIFIED, intl);
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(EphemeralStore.setPushProxyVerificationState).toHaveBeenCalledWith(serverUrl, PUSH_PROXY_STATUS_VERIFIED);
    });

    it('UT-PP-06 ヘッダーの警告アイコンのタップ（alertPushProxyError）は従来どおり説明を出す', () => {
        alertPushProxyError(intl, serverUrl);
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Notifications cannot be received from this server');
    });
});
