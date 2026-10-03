// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループJ（UT-87〜UT-89）: Screens.ACCOUNT_DELETION と名前の対応（観点10・12）
// 画面ID account_deletion ＝ Screens.ACCOUNT_DELETION ＝ ルートファイル名 ＝ 文言キー接頭辞 ＝ testID接頭辞

import {Screens} from '@constants';
import ScreensDefault from '@constants/screens';

const support = require('./weaver_test_support.cjs');

const ROUTE = 'app/routes/(modals)/(settings)/account_deletion.tsx';

describe('Screens.ACCOUNT_DELETION', () => {
    it('UT-87 Screens.ACCOUNT_DELETION === account_deletion', () => {
        expect((Screens as Record<string, unknown>).ACCOUNT_DELETION).toBe('account_deletion');
    });

    it('UT-88 screens.ts の export default に ACCOUNT_DELETION があり、ルートファイルが存在する', () => {
        expect(Object.keys(ScreensDefault)).toContain('ACCOUNT_DELETION');
        expect(support.exists(ROUTE)).toBe(true);
    });

    it('UT-89 account_deletion を含む非テストファイル（import 行・コメントを除く）は、app/weaver 配下とルートを除き screens.ts だけ（既存の同名なし）', () => {
        const files: string[] = support.walk('app', ['.ts', '.tsx']).filter((f: string) => !support.isTestFile(f));
        const hits = files.filter((f) => (/account_deletion/i).test(support.codeOnly(support.read(f))) && !f.startsWith('app/weaver/') && f !== ROUTE);
        expect(hits).toEqual(['app/constants/screens.ts']);
    });
});
