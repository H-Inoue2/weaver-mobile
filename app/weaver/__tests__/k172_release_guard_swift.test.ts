// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-172/R1 UT-G（番人 weaver_release_guard.sh の K-172 の検査の働きの確認。結合 IT-10 の働き）。
// 設計: K172_詳細設計書 v0.4 §9.1、K172_単体テスト設計 v0.3 UT-G02・G03。
// 検査の内容: Database+Mentions.swift が「ある」ときだけ、固定文字列2つ（message_count と "push":"mention"）が残っていること。
// 無いとき・--shared-only では何もしない（既存のフィクスチャ・UT-295 の禁止パターンを壊さないため。既存テストで確認済み）。
// 注意: このファイル名は release_guard.test.ts で終わらせない（UT-295 の禁止パターン）。

export {};

const support = require('./weaver_test_support.cjs');

const SWIFT_REL = 'ios/Gekidou/Sources/Gekidou/Storage/Database+Mentions.swift';

// 規則（詳細設計 §6.1）を持つ SQL の本文に見える最小の Swift。固定文字列2つを含む
const swiftBody = (omit: string[] = []): string => {
    const lines = [
        'extension Database {',
        '    public func getChannelMentions(_ db: Connection) -> Int {',
        '        let sql = """',
        '        SELECT SUM(CASE WHEN c.type IN (\'O\',\'P\') AND my.is_unread = 1',
        '            AND mys.notify_props NOT LIKE \'%"push":"mention"%\'',
        '            AND mys.notify_props NOT LIKE \'%"push":"none"%\'',
        '            THEN MAX(my.message_count, my.mentions_count) ELSE my.mentions_count END)',
        '        FROM MyChannel my',
        '        """',
        '        return 0',
        '    }',
        '}',
        '',
    ];
    return lines.filter((l) => !omit.some((o) => l.includes(o))).join('\n');
};

function run(content: string | null, args: string[] = ['--release']) {
    const root: string = support.makeFixture(content === null ? {} : {files: {[SWIFT_REL]: content}});
    try {
        return support.runGuard([...args, root]);
    } finally {
        support.removeFixture(root);
    }
}

describe('UT-G 番人の K-172 の検査', () => {
    it('UT-G02 固定文字列2つが全部ある→K172 の出力なし・終了0', () => {
        const r = run(swiftBody());

        expect({status: r.status, k172: r.out.includes('K172')}).toEqual({status: 0, k172: false});
    });

    it.each([
        ['message_count', 'message_count'],
        ['"push":"mention"', '"push":"mention"'],
    ])('UT-G03 2つのうち %s を外す→「K172: …（人手確認が必要）」で FAIL（終了1）', (_n, needle) => {
        // その文字列を含む行を丸ごと外す。外したあとに、もう一方の固定文字列は残っていることを確かめてから走らせる
        const body = swiftBody([needle]);
        const other = needle === 'message_count' ? '"push":"mention"' : 'message_count';
        expect(body).toContain(other);
        expect(body).not.toContain(needle);

        const r = run(body);

        expect(r.status).toBe(1);
        expect(r.out).toMatch(/K172: .*（人手確認が必要）/);
    });
});
