// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループP（UT-111・UT-112・UT-122・UT-142〜UT-150）: 上流追従の固定検査 K1〜K7 と帰属表記（静的。詳細設計 §6・§11.3）
// 取り込み後にこのテストを実行し、§11・§12 の表（意図的に残すもの）と一致することを確認する。
// 許可一覧・K6 の明示リストは、テストのデータとして持つ。

export {};

const support = require('./weaver_test_support.cjs');

const sourceFiles = (dirs: string[]): string[] => dirs.flatMap((d) => support.walk(d, ['.ts', '.tsx'])).filter((f: string) => !support.isTestFile(f));

describe('K1: mattermost.(com|org) と github.com/mattermost の URL（許可一覧との一致）', () => {
    const RE = /https?:\/\/[a-z0-9.-]*(?:mattermost\.(?:com|org)|github\.com\/mattermost)[^\s'"`)]*/gi;

    // 詳細設計 §11.3（取り込み後も残ってよいもの。合計7件）
    const ALLOWED: Record<string, number> = {
        'assets/base/config.json': 3,
        'app/constants/about_links.ts': 3,
        'app/utils/server/index.ts': 1,
    };

    it('UT-142 app・share_extension・config.json の該当URLが許可一覧（7件）と一致。通知画面・share_logs.ts・report_a_problem.ts は0件', () => {
        const files: string[] = [...sourceFiles(['app', 'share_extension']), 'assets/base/config.json'];
        const hits: Record<string, number> = {};
        for (const f of files) {
            support.read(f).split('\n').forEach((line: string) => {
                if (support.isCommentLine(line)) {
                    return;
                }
                const m = line.match(RE);
                if (m) {
                    hits[f] = (hits[f] || 0) + m.length;
                }
            });
        }
        expect(hits).toEqual(ALLOWED);
        expect(Object.values(hits).reduce((a, b) => a + b, 0)).toBe(7);
    });
});

describe('K3・K4・K6・K7 と外部送信の回帰', () => {
    it('UT-143 K3: app の非テストに name=\'mattermost\'（引用符2種）が0件', () => {
        const hits = sourceFiles(['app']).filter((f) => (/name=['"]mattermost['"]/).test(support.stripComments(support.read(f))));
        expect(hits).toEqual([]);
    });

    it('UT-144 K4（強化）: app の非テスト .ts/.tsx に \'GitLab\' の文字列リテラルが0件（識別子 EnableSignUpWithGitLab は対象外）', () => {
        const hits = sourceFiles(['app']).filter((f) => (/['"`]GitLab['"`]/).test(support.stripComments(support.read(f))));
        expect(hits).toEqual([]);
    });

    it('UT-145 K6: app/weaver の外で import 指定子に /weaver/ を含む非テストファイルが、ちょうど9ファイル', () => {
        const EXPECTED = [
            'app/screens/settings/about/about.tsx',
            'app/screens/settings/settings.tsx',
            'app/screens/login/sso_options.tsx',
            'app/components/system_avatar/index.tsx',
            'app/screens/edit_profile/components/email_field.tsx',
            'app/screens/settings/notifications/send_test_notification_notice/send_test_notification_notice.tsx',
            'app/constants/report_a_problem.ts',
            'app/utils/share_logs.ts',
            'app/routes/(modals)/(settings)/account_deletion.tsx',
        ].sort();
        const specRe = /(?:from\s+|import\s+|require\(\s*)['"]([^'"]+)['"]/g;
        const hits = sourceFiles(['app']).filter((f) => {
            if (f.startsWith('app/weaver/')) {
                return false;
            }
            const text: string = support.stripComments(support.read(f));
            const specs = [...text.matchAll(specRe)].map((m) => m[1]);
            return specs.some((s) => s.includes('/weaver/'));
        }).sort();
        expect(hits).toEqual(EXPECTED);
    });

    it('UT-146 K7: Info.plist で mattermost（大文字小文字不問）を含む行は、URLスキームの2行（com.mattermost・mattermost）のみ', () => {
        const lines: string[] = support.read('ios/Mattermost/Info.plist').split('\n').filter((l: string) => (/mattermost/i).test(l));
        expect(lines.map((l) => l.trim())).toEqual(['<string>com.mattermost</string>', '<string>mattermost</string>']);
    });

    it('UT-111 send_test_notification_notice.tsx に mattermost.com が0件', () => {
        const src: string = support.read('app/screens/settings/notifications/send_test_notification_notice/send_test_notification_notice.tsx');
        expect(src).not.toMatch(/mattermost\.com/i);
    });

    it('UT-112 K2: app 全体の非テストの useExternalLink( 呼び出し（定義を除く）の後8行以内に mattermost.com が0件', () => {
        const files = sourceFiles(['app']).filter((f) => !f.endsWith('hooks/use_external_link.ts'));
        const callSites: Array<{file: string; line: number; near: string}> = [];
        for (const f of files) {
            const lines: string[] = support.read(f).split('\n');
            lines.forEach((line, i) => {
                if (line.includes('useExternalLink(') && !support.isCommentLine(line)) {
                    callSites.push({file: f, line: i + 1, near: lines.slice(i, i + 9).join('\n')});
                }
            });
        }
        const offenders = callSites.filter((c) => (/mattermost\.com/i).test(c.near)).map((c) => `${c.file}:${c.line}`);
        expect(callSites.length).toBeGreaterThan(0);
        expect(offenders).toEqual([]);
    });

    it.each(['app/constants/report_a_problem.ts', 'app/utils/share_logs.ts'])('UT-122 %s に mattermost（コメント・import を除く。大文字小文字不問）が0件', (f) => {
        expect(support.codeOnly(support.read(f))).not.toMatch(/mattermost/i);
    });
});

describe('K5 と帰属表記・変更の表示（Apache-2.0 §4）', () => {
    it('UT-147 K5: 実リポジトリ（ROOT=リポジトリ）でガードを引数なしで実行すると終了コード0（G1・G2・G5が実ファイルで通る）', () => {
        const r = support.runGuard([support.ROOT]);
        expect({status: r.status, out: r.out}).toEqual({status: 0, out: r.out});
    });

    it('UT-148 about.tsx に帰属表記のキーが残り、LICENSE.txt・NOTICE.txt がある', () => {
        const src: string = support.read('app/screens/settings/about/about.tsx');
        for (const key of ['settings.about.powered_by', 'settings.about.copyright', 'settings.notice_text']) {
            expect(src).toContain(key);
        }
        expect(support.exists('LICENSE.txt')).toBe(true);
        expect(support.exists('NOTICE.txt')).toBe(true);
    });

    it('UT-149 NOTICE.txt の先頭20行に Weaver・Mattermost Mobile・Apache License を含む変更の注記がある', () => {
        const head: string = support.read('NOTICE.txt').split('\n').slice(0, 20).join('\n');
        expect(head).toContain('Weaver');
        expect(head).toContain('Mattermost Mobile');
        expect(head).toContain('Apache License');
    });

    it('UT-150 WEAVER.md に『変更したファイル一覧』の見出しがあり、E1〜E15 のファイル名がすべて載る', () => {
        const md: string = support.read('WEAVER.md');
        expect(md).toMatch(/^#{1,6}\s*変更したファイル一覧/m);
        for (const name of ['about.tsx', 'settings.tsx', 'screens.ts', 'sso_options.tsx', 'system_avatar', 'email_field.tsx', 'send_test_notification_notice.tsx', 'report_a_problem.ts', 'share_logs.ts', 'Info.plist', 'project.pbxproj', 'icon.png', 'eslint.config.mjs', 'weaver-ios-testflight.yml']) {
            expect({name, listed: md.includes(name)}).toEqual({name, listed: true});
        }
    });
});
