// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループW（UT-287〜290）: プロフィール写真のアップロード結果の判定（実機テスト ビルド10の指摘J）
// 事実: 上流の uploadUserProfileImage（app/actions/remote/user.ts）は apiClient.upload の応答（ClientResponse: ok・code）を見ず、
// サーバーが 403・413 などで拒否しても例外にならないため、画面は成功と扱い、写真が反映されない。
// 期待（既存の関数を直す。新規ファイルなし）:
//   uploadUserProfileImage(serverUrl, localPath) は、応答の code が 400 以上（または ok === false）のとき {error} を返す。
//   通信が例外（reject）のときも {error}。応答が成功（ok=true・code=200）、または応答が undefined（既存テストの mock）のときは {}（error なし）。
//   画面（edit_profile.tsx）は error を受けると resetScreen(error) でエラーを表示する（既存の経路。UT-290 で確認）。

import {uploadUserProfileImage} from '@actions/remote/user';
import {SYSTEM_IDENTIFIERS} from '@constants/database';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';

import type ServerDataOperator from '@database/operator/server_data_operator';

const support = require('./weaver_test_support.cjs');

const serverUrl = 'uploadprofile.test.com';
let operator: ServerDataOperator;
const user1 = {id: 'userid1', username: 'user1', email: 'user1@example.com', roles: ''} as UserProfile;

const upload = jest.fn();
const mockClient = {
    getRequestHeaders: jest.fn(() => ({})),
    getUserRoute: jest.fn((id: string) => `/users/${id}`),
    apiClient: {upload},
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

describe('uploadUserProfileImage の応答判定', () => {
    it.each([[403], [413], [400], [500], [502]])('UT-287 応答が %i のとき error を返す', async (code) => {
        upload.mockResolvedValue({ok: false, code, data: {message: 'rejected'}});
        const result = await uploadUserProfileImage(serverUrl, '/path/to/image.jpg');
        expect(result.error).toBeDefined();
    });

    it.each([[{code: 413}], [{ok: false}]])('UT-287b ok だけ・code だけの応答 %p でも error を返す（判定の2条件がそれぞれ効く）', async (response) => {
        upload.mockResolvedValue(response);
        const result = await uploadUserProfileImage(serverUrl, '/path/to/image.jpg');
        expect(result.error).toBeDefined();
    });

    it('UT-288 通信の例外（reject）のとき error を返す', async () => {
        upload.mockRejectedValue(new Error('network down'));
        const result = await uploadUserProfileImage(serverUrl, '/path/to/image.jpg');
        expect(result.error).toBeDefined();
    });

    it.each([[{ok: true, code: 200}], [{ok: true, code: 201}], [undefined]])('UT-289 成功の応答 %p（または応答なしの mock）のとき error なし', async (response) => {
        upload.mockResolvedValue(response);
        const result = await uploadUserProfileImage(serverUrl, '/path/to/image.jpg');
        expect(result.error).toBeUndefined();
        expect(upload).toHaveBeenCalledTimes(1);
        expect(upload.mock.calls[0][0]).toBe('/users/userid1/image');
    });

    it('UT-290 画面（edit_profile.tsx）は uploadUserProfileImage の error でエラー表示（resetScreen）に進み、成功時の更新に進まない（既存の経路）', () => {
        const src: string = support.codeOnly(support.read('app/screens/edit_profile/edit_profile.tsx'));
        const i = src.indexOf('uploadUserProfileImage(serverUrl, localPath)');
        expect(i).toBeGreaterThan(0);
        const after = src.slice(i, i + 400);
        expect(after).toMatch(/if \(uploadError\) {\s*resetScreen\(uploadError\);\s*return;/);
    });
});
