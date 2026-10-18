// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-114（メンバー追加画面・channel_info を「押した時点のサーバー」に固定）: 静的検査と特性テスト。
// 対象: K114-UT-09（プロバイダー鎖の整合）・K114-UT-10（入口の全件確認）・K114-UT-19（外部パスの到達＝特性）・K114-UT-20（シートの包み）。
// 期待結果の正は K114_詳細設計.md §3.1・§3.2・J-10・J-14、K114_単体テスト設計.md §1.3。

import {alertInvalidDeepLink, parseAndHandleDeepLink} from '@utils/deep_link';

import {redirectSystemPath} from '../../routes/+native-intent';

const support = require('./weaver_test_support.cjs');

jest.mock('@utils/deep_link');

const sourceFiles = (dirs: string[]): string[] => dirs.flatMap((d) => support.walk(d, ['.ts', '.tsx'])).filter((f: string) => !support.isTestFile(f));

const SCOPE_FILE = 'app/weaver/components/pinned_server_scope.tsx';
const HEADER_FILE = 'app/screens/channel/header/header.tsx';

// ---- UT-10 の抽出関数 ----
// Screens.CHANNEL_ADD_MEMBERS / Screens.CHANNEL_INFO を、画面遷移の関数（navigateTo…・showModal・router.push 等）の第1引数に渡す呼び出しを全件抽出する。
const NAV_CALL = /(?:\bnavigateTo\w*|\bshowModal\w*|\brouter\.(?:push|navigate|replace))\(\s*Screens\.(?:CHANNEL_ADD_MEMBERS|CHANNEL_INFO)\b[\s\S]*?\)\s*;/g;

// 文字列パスの直指定（'/(modals)/(channel_info)…'・'/…/channel_add_members…'）。import 指定子や i18n ID（先頭が '/' でない）は含めない。
const PATH_LITERAL = /['"`]\/[^'"`\n]*(?:\(channel_info\)|channel_add_members)[^'"`\n]*['"`]/g;

const extractNavCalls = (src: string): string[] => [...support.stripComments(src).matchAll(NAV_CALL)].map((m) => m[0]);
const extractPathLiterals = (src: string): string[] => [...support.stripComments(src).matchAll(PATH_LITERAL)].map((m) => m[0]);

// serverUrl キーが「serverUrl」1語（省略記法）か「serverUrl: <識別子>」で渡されているか
const hasServerUrlKey = (call: string): boolean => (/[{,]\s*serverUrl\s*(?:[,}]|:\s*[A-Za-z_$][\w$]*\s*[,}])/).test(call);

const entryFiles = (): string[] => sourceFiles(['app']).filter((f) => !f.startsWith('app/routes/') && !f.startsWith('app/constants/'));

describe('K-114 静的検査', () => {
    it('K114-UT-09 鎖の整合: pinned_server_scope.tsx の *Provider の集合 ＝ withServerDatabase の鎖から DeviceInfoProvider・ThemeProvider を除いたもの。Theme 関連は含まない', () => {
        const names = (src: string): string[] => [...new Set([...support.stripComments(src).matchAll(/<(\w+Provider)\b/g)].map((m) => m[1] as string))].sort();
        const upstream = names(support.read('app/database/components/index.tsx'));
        expect(upstream).toEqual(['DatabaseProvider', 'DeviceInfoProvider', 'ServerProvider', 'ThemeProvider', 'UserLocaleProvider']);

        const scopeSrc: string = support.read(SCOPE_FILE);
        expect(names(scopeSrc)).toEqual(upstream.filter((n) => n !== 'DeviceInfoProvider' && n !== 'ThemeProvider'));
        expect(names(scopeSrc)).toEqual(['DatabaseProvider', 'ServerProvider', 'UserLocaleProvider']);

        const code: string = support.stripComments(scopeSrc);
        for (const forbidden of ['ThemeProvider', 'updateThemeIfNeeded', 'setTheme']) {
            expect(code).not.toContain(forbidden);
        }
    });

    it('K114-UT-10 入口の全件確認: CHANNEL_ADD_MEMBERS・CHANNEL_INFO を画面遷移に渡す呼び出しがちょうど4件（add_members.tsx・add_members_box.tsx・info_box/index.tsx・header.tsx）で、すべて serverUrl キーを持つ。文字列パス直指定は0件', () => {
        const found: Array<{file: string; call: string}> = [];
        const paths: Array<{file: string; literal: string}> = [];
        for (const f of entryFiles()) {
            const src: string = support.read(f);
            extractNavCalls(src).forEach((call) => found.push({file: f, call}));
            extractPathLiterals(src).forEach((literal) => paths.push({file: f, literal}));
        }
        expect(found.map((x) => x.file).sort()).toEqual([
            'app/components/channel_actions/add_members_box/add_members_box.tsx',
            'app/components/channel_actions/info_box/index.tsx',
            'app/screens/channel/header/header.tsx',
            'app/screens/channel_info/options/add_members/add_members.tsx',
        ]);
        expect(paths).toEqual([]);
        expect(found.filter((x) => !hasServerUrlKey(x.call)).map((x) => x.file)).toEqual([]);
    });

    it('K114-UT-10 陽性対照: 抽出関数は serverUrl の無いダミーの呼び出しを違反と判定し、serverUrl のあるものは通す。経路直指定も拾う', () => {
        const bad = 'navigateToScreen(Screens.CHANNEL_INFO, {channelId, title});';
        const good = 'navigateToChannelInfoScreen(Screens.CHANNEL_ADD_MEMBERS, {channelId, inModal: true, displayName, serverUrl});';
        const goodKeyed = 'navigateToScreen(Screens.CHANNEL_INFO, {channelId, title, serverUrl: url});';
        const commented = '// navigateToScreen(Screens.CHANNEL_INFO, {channelId});';
        expect(extractNavCalls(bad)).toHaveLength(1);
        expect(hasServerUrlKey(extractNavCalls(bad)[0])).toBe(false);
        expect(hasServerUrlKey(extractNavCalls(good)[0])).toBe(true);
        expect(hasServerUrlKey(extractNavCalls(goodKeyed)[0])).toBe(true);
        expect(extractNavCalls(commented)).toHaveLength(0);
        expect(extractPathLiterals("router.push('/(modals)/(channel_info)/channel_add_members')")).toHaveLength(1);
        expect(extractPathLiterals("import X from '@screens/channel_add_members';")).toHaveLength(0);
    });

    it('K114-UT-19 外部パスの到達（特性・現状で通る）: 追加画面への外部パスは redirectSystemPath がそのまま返す（F-13。fail-closed の必要性を残す）', async () => {
        jest.mocked(parseAndHandleDeepLink).mockResolvedValue({error: true} as never);
        const path = '/(modals)/(channel_info)/channel_add_members?channelId=%22C1%22';
        expect(await redirectSystemPath({path, initial: false})).toBe(path);
        expect(alertInvalidDeepLink).toBeDefined();
    });

    it('K114-UT-20 シートの包み: onChannelQuickAction が PinnedServerScope(GENERIC_BOTTOM_SHEET, serverUrl) で QuickActions を包み、useCallback の依存配列に serverUrl を含む。weaver の部品を import する', () => {
        const src: string = support.stripComments(support.read(HEADER_FILE));
        const start = src.indexOf('const onChannelQuickAction = useCallback(');
        expect(start).toBeGreaterThan(-1);
        const end = src.indexOf('const openPlaybooksRuns', start);
        const body = src.slice(start, end);

        expect(body).toContain('PinnedServerScope');
        expect(body).toContain('Screens.GENERIC_BOTTOM_SHEET');
        expect(body).toMatch(/serverUrl=\{serverUrl\}/);
        expect(body).toMatch(/<PinnedServerScope[\s\S]*?<QuickActions[\s\S]*?<\/PinnedServerScope>/);
        const deps = body.match(/\},\s*\[([^\]]*)\]\);\s*$/);
        expect(deps).not.toBeNull();
        expect(deps![1]).toContain('serverUrl');
        expect(src).toMatch(/import PinnedServerScope from '(?:\.\.\/)+weaver\/components\/pinned_server_scope';/);
    });
});
