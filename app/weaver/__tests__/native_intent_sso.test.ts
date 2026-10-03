// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループV（UT-281〜283）: app/routes/+native-intent.ts の redirectSystemPath（ビルド9の実機で、ログイン直後に「リンクが無効」）
// SSO 戻りURLは、initial の真偽に関わらず null を返し、parseAndHandleDeepLink・alertInvalidDeepLink を呼ばない。
// 通常のURLの挙動は変えない（既存 +native-intent.test.ts と同じ）。

import {alertInvalidDeepLink, parseAndHandleDeepLink} from '@utils/deep_link';

import {redirectSystemPath} from '../../routes/+native-intent';

jest.mock('@utils/deep_link');

const SSO_URLS = [
    'mmauthbeta://callback?login_code=x&state=y&srv=z',
    'mmauth://callback?login_code=x&state=y&srv=z',
];
const SCHEMELESS = [
    'callback?login_code=x&state=y&srv=z',
    '/callback?login_code=x&state=y&srv=z',
    '//callback?login_code=x&state=y&srv=z',
];

describe('redirectSystemPath と SSO 戻りURL', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (parseAndHandleDeepLink as jest.Mock).mockResolvedValue({error: false});
    });

    it.each(SSO_URLS)('UT-281 %s は initial の真偽に関わらず null。深いリンク処理もアラートも呼ばない', async (path) => {
        expect(await redirectSystemPath({path, initial: true})).toBeNull();
        expect(await redirectSystemPath({path, initial: false})).toBeNull();
        expect(parseAndHandleDeepLink).not.toHaveBeenCalled();
        expect(alertInvalidDeepLink).not.toHaveBeenCalled();
    });

    it.each(SCHEMELESS)('UT-282 スキームを落とした形 %s も同じ（null・呼ばない）。深いリンク処理が失敗を返す状況でもアラートを出さない', async (path) => {
        (parseAndHandleDeepLink as jest.Mock).mockResolvedValue({error: true});
        expect(await redirectSystemPath({path, initial: true})).toBeNull();
        expect(await redirectSystemPath({path, initial: false})).toBeNull();
        expect(parseAndHandleDeepLink).not.toHaveBeenCalled();
        expect(alertInvalidDeepLink).not.toHaveBeenCalled();
    });

    it('UT-283 通常のURLの挙動は不変: https は処理されて null、mailto は処理せずそのまま、処理失敗はアラートしてそのまま', async () => {
        const web = 'https://community.example.com/team/channels/town-square';
        expect(await redirectSystemPath({path: web, initial: true})).toBeNull();
        expect(await redirectSystemPath({path: web, initial: false})).toBeNull();
        expect(parseAndHandleDeepLink).toHaveBeenCalledWith(web, undefined, undefined, true);
        expect(alertInvalidDeepLink).not.toHaveBeenCalled();

        jest.clearAllMocks();
        const mail = 'mailto:someone@example.com';
        expect(await redirectSystemPath({path: mail, initial: true})).toBe(mail);
        expect(parseAndHandleDeepLink).not.toHaveBeenCalled();

        (parseAndHandleDeepLink as jest.Mock).mockResolvedValue({error: true});
        expect(await redirectSystemPath({path: web, initial: false})).toBe(web);
        expect(alertInvalidDeepLink).toHaveBeenCalledTimes(1);
    });
});
