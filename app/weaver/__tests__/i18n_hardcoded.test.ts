// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39 日本語化（i18nを通らない英語表示の解消）。ja.json の整合は ja_i18n.test.ts。
//   H-1: プロフィール写真のアップロード拒否の文言（app/actions/remote/user.ts）。ClientError の intl フィールドで日本語になる。
//   H-2: 問題報告の共有失敗アラートの見出し（app/utils/share_logs.ts）。ユーザーの言語（getIntlShape）で出る。
//   H-3: ブックマーク編集画面の削除ボタン（app/screens/channel_bookmark/index.tsx）。既存キー channel_bookmark.delete.confirm_title。

import fs from 'fs';
import path from 'path';

import TurboLogger from '@mattermost/react-native-turbo-log';
import {createIntl} from 'react-intl';
import {Alert} from 'react-native';
import Share from 'react-native-share';

import {uploadUserProfileImage} from '@actions/remote/user';
import {SYSTEM_IDENTIFIERS} from '@constants/database';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getErrorMessage} from '@utils/errors';
import {emailLogs, shareLogs} from '@utils/share_logs';

import type ServerDataOperator from '@database/operator/server_data_operator';

const support = require('./weaver_test_support.cjs');

const ja: Record<string, string> = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../assets/base/i18n/ja.json'), 'utf-8'));
const jaIntl = createIntl({locale: 'ja', messages: ja});

// share_logs.ts が使う getIntlShape を、日本語のユーザーに固定する（実機では getIntlShape() の既定ロケール）
jest.mock('@utils/general', () => ({
    ...jest.requireActual('@utils/general'),
    getIntlShape: () => {
        const json = jest.requireActual('fs').readFileSync(jest.requireActual('path').resolve(process.cwd(), 'assets/base/i18n/ja.json'), 'utf-8');
        return jest.requireActual('react-intl').createIntl({locale: 'ja', messages: JSON.parse(json)});
    },
}));

jest.mock('react-native-share', () => ({
    open: jest.fn(),
    shareSingle: jest.fn(),
    Social: {EMAIL: 'email'},
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
    alert: jest.fn(),
}));

describe('H-1 プロフィール写真のアップロード拒否の文言', () => {
    const serverUrl = 'i18nhard.test.com';
    let operator: ServerDataOperator;
    const user1 = {id: 'userid1', username: 'user1', email: 'user1@example.com', roles: ''} as UserProfile;
    const upload = jest.fn();
    const mockClient = {
        getRequestHeaders: jest.fn(() => ({})),
        getUserRoute: jest.fn((id: string) => `/users/${id}`),
        apiClient: {upload, baseUrl: 'https://i18nhard.test.com'},
    };

    beforeAll(() => {
        // @ts-ignore
        NetworkManager.getClient = () => mockClient;
    });

    beforeEach(async () => {
        upload.mockReset();
        await DatabaseManager.init([serverUrl]);
        operator = DatabaseManager.serverDatabases[serverUrl]!.operator;
        await operator.handleSystem({systems: [{id: SYSTEM_IDENTIFIERS.CURRENT_USER_ID, value: 'userid1'}], prepareRecordsOnly: false});
        await operator.handleUsers({users: [user1], prepareRecordsOnly: false});
    });

    afterEach(async () => {
        await DatabaseManager.destroyServerDatabase(serverUrl);
    });

    it('UT-JH-01 拒否（413）の error は intl（id・defaultMessage）を持つ。英語の画面（intl未指定）では defaultMessage', async () => {
        upload.mockResolvedValue({ok: false, code: 413});
        const {error} = await uploadUserProfileImage(serverUrl, '/path/to/image.jpg');
        expect((error as {intl?: unknown}).intl).toEqual({id: 'mobile.edit_profile.upload_failed', defaultMessage: 'Unable to upload the profile image'});
        expect(getErrorMessage(error)).toBe('Unable to upload the profile image');
    });

    it('UT-JH-02 日本語の画面では、ja.json の訳で表示される', async () => {
        upload.mockResolvedValue({ok: false, code: 403});
        const {error} = await uploadUserProfileImage(serverUrl, '/path/to/image.jpg');
        expect(getErrorMessage(error, jaIntl)).toBe('プロフィール写真をアップロードできませんでした。別の写真を選ぶか、もう一度お試しください。');
    });
});

describe('H-2 問題報告の共有失敗アラートの見出し', () => {
    const metadata = {
        currentUserId: 'user1',
        currentTeamId: 'team1',
        serverVersion: '1.0.0',
        appVersion: '2.0.0',
        appPlatform: 'ios',
        deviceModel: 'iPhone 14',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(TurboLogger.getLogPaths).mockResolvedValue(['/path/to/log1']);
    });

    it('UT-JH-03 shareLogs の失敗時、見出しが日本語（本文は例外の文字列のまま）', async () => {
        jest.mocked(Share.open).mockRejectedValue(new Error('Share failed'));
        await shareLogs(metadata, 'My Site', 'support@example.com');
        expect(Alert.alert).toHaveBeenCalledWith('エラー', 'Error: Share failed');
    });

    it('UT-JH-04 emailLogs の失敗時、見出しが日本語（本文は例外の文字列のまま）', async () => {
        jest.mocked(Share.shareSingle).mockRejectedValue(new Error('Share failed'));
        await emailLogs(metadata, 'My Site', 'support@example.com');
        expect(Alert.alert).toHaveBeenCalledWith('エラー', 'Error: Share failed');
    });
});

describe('H-3 ブックマーク編集画面の削除ボタン', () => {
    const src: string = support.codeOnly(support.read('app/screens/channel_bookmark/index.tsx'));

    it('UT-JH-05 ボタンの文言が直書きの英語でなく、既存キー channel_bookmark.delete.confirm_title を通る', () => {
        expect(src).not.toMatch(/text='Delete bookmark'/);
        expect(src).toMatch(/text=\{formatMessage\(\{id: 'channel_bookmark\.delete\.confirm_title', defaultMessage: 'Delete bookmark'\}\)\}/);
    });

    it('UT-JH-06 そのキーの日本語訳がある', () => {
        expect(ja['channel_bookmark.delete.confirm_title']).toBe('ブックマークを削除');
    });
});
