// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループS（UT-227〜UT-231）: ESLint ヘッダーの上書き（詳細設計 §3.14 案B。eslint.config.mjs 末尾の1ブロック）
// 対象は app/weaver/**/*.{ts,tsx} と app/routes/(modals)/(settings)/account_deletion.tsx だけ。対象ファイルでは Weaver 用の2行だけを許し、
// Mattermost のヘッダーはエラーにする（「許す」と「上書き」は併存しない）。他のファイルは従来どおり Mattermost のヘッダーだけ。
// ESLint は子プロセスで実行する（jest の VM 内では ESM の設定ファイルを読めないため）。

export {};

const support = require('./weaver_test_support.cjs');

jest.setTimeout(120000);

const WEAVER_HEADER = [
    '// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.',
    '// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).',
].join('\n');
const MATTERMOST_HEADER = [
    '// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.',
    '// See LICENSE.txt for license information.',
].join('\n');

const headerErrors = (header: string, rel: string): number => {
    const messages: Array<{ruleId: string | null; severity: number}> = support.lintText(`${header}\n\nexport const a = 1;\n`, rel);
    return messages.filter((m) => m.ruleId === 'header/header').length;
};

describe('ESLint ヘッダーの上書き（§3.14）', () => {
    it('UT-227 app/weaver/x.ts に Weaver 用の2行ヘッダー: header/header のエラー0件', () => {
        expect(headerErrors(WEAVER_HEADER, 'app/weaver/x.ts')).toBe(0);
    });

    it('UT-228 app/utils/x.ts（app/weaver の外）に Weaver 用ヘッダー: header/header のエラー1件（上書きは対象にだけ効く）', () => {
        expect(headerErrors(WEAVER_HEADER, 'app/utils/x.ts')).toBe(1);
    });

    it('UT-229 app/weaver/x.ts に Mattermost の2行ヘッダー: header/header のエラー1件（対象ファイルでは Mattermost のヘッダーはエラー）', () => {
        expect(headerErrors(MATTERMOST_HEADER, 'app/weaver/x.ts')).toBe(1);
    });

    it('UT-230 app/routes/(modals)/(settings)/account_deletion.tsx に Weaver 用ヘッダー: エラー0件（同ルートも上書き対象）', () => {
        expect(headerErrors(WEAVER_HEADER, 'app/routes/(modals)/(settings)/account_deletion.tsx')).toBe(0);
    });

    it('UT-231 app/routes/(modals)/(settings)/about.tsx に Weaver 用ヘッダー: エラー1件（他のルートへは効かない）', () => {
        expect(headerErrors(WEAVER_HEADER, 'app/routes/(modals)/(settings)/about.tsx')).toBe(1);
    });
});
