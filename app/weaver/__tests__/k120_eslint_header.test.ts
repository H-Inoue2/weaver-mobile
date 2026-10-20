// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-120（「通知を受け取れません」警告を表示の入口で止める）: ESLint の確認（K120-UT-08a〜08c）。
// 期待結果の正は K120_詳細設計.md §2.1（ヘッダー・import の並び）・§3（上流の最終形）・§4.4、K120_単体テスト設計.md §1.3。
// ESLint は子プロセスで実行する（support.lintText。UT-227 と同じ）。ファイルは書き換えない。
// 上流の CRLF ファイルは、メモリ上で LF にして渡す（linebreak-style が全行エラーになるのを避ける）。

export {};

const support = require('./weaver_test_support.cjs');

jest.setTimeout(120000);

type Msg = {ruleId: string | null; severity: number; message: string; line: number};
const lf = (rel: string): string => support.read(rel);
const errorsOf = (rel: string): string[] => (support.lintText(lf(rel), rel) as Msg[]).filter((m) => m.severity === 2).map((m) => `${m.ruleId}@${m.line}: ${m.message}`);

describe('K-120 ESLint', () => {
    it('K120-UT-08a 新規 app/weaver/push_proxy_warning.ts: header/header のエラー0件（Weaver 用の2行ヘッダー）', () => {
        const msgs = support.lintText(lf('app/weaver/push_proxy_warning.ts'), 'app/weaver/push_proxy_warning.ts') as Msg[];
        expect(msgs.filter((m) => m.ruleId === 'header/header')).toEqual([]);
    });

    it('K120-UT-08b 新規 app/weaver/push_proxy_warning.ts: severity 2（エラー）が全規則で0件（import/order・no-unused-vars を含む）', () => {
        expect(errorsOf('app/weaver/push_proxy_warning.ts')).toEqual([]);
    });

    it.each([
        ['app/screens/home/channel_list/servers/servers_list/server_item/index.ts'],
        ['app/screens/home/channel_list/categories_list/header/index.ts'],
        ['app/screens/home/channel_list/categories_list/header/index.test.tsx'],
    ])('K120-UT-08c %s: severity 2 が0件（上流の import 並び・同居テストの未使用 import を検出）', (rel) => {
        expect(errorsOf(rel)).toEqual([]);
    });
});
