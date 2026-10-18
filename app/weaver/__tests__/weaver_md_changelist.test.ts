// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-114 付随: 上流ファイルの「Modified for Weaver」コメントと WEAVER.md「変更したファイル一覧」の完全一致を検査する。
// 経緯: K-114/K-39 で、コメントを付けたのに一覧へ書き漏らしたファイルが8件あった（Apache-2.0 §4(b) の変更表示の漏れ）。
// 既存テストに同種の検査は無い（android_source_changes.test.ts は基点との差分を見るもので、一覧との照合ではない）。

export {};

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MARK = 'Modified for Weaver';

// 走査から除く: WEAVER.md 自身（一覧の本体）と app/weaver/ 配下（自作ファイル。上流の改変ではなく「新規」欄で扱う。
// このテストや android_source_changes.test.ts も文字列としてMARKを含むため）。
const isExcluded = (rel: string) => rel === 'WEAVER.md' || rel.startsWith('app/weaver/');

// 一覧に載るがコメントを書けない（または書かない）ファイルの例外。(b)の「コメントが無い」だけを免除する。存在検査は行う。
// TS/TSX は例外にしない（WEAVER.md L77「TS/TSX の既存ファイルには先頭に1行コメントを付けた」）。
const NO_COMMENT_OK: Record<string, string> = {
    'ios/Mattermost/Info.plist': 'Xcode が書き換える plist のため、一覧で代える',
    'ios/Mattermost.xcodeproj/project.pbxproj': 'Xcode が書き換えるため',
    'assets/base/images/icon.png': 'バイナリ',
    'eslint.config.mjs': '末尾のブロックで変更を示す（K-39）',
    '.github/workflows/weaver-ios-testflight.yml': 'ワークフローは名前・本文で示す（K-39）',
    'NOTICE.txt': '帰属文書。冒頭の追記文で示す',
    '.gitattributes': '一覧で代える（K-79）',
    'android/app/google-services.json': 'JSON はコメント不可。本表で代える（WEAVER.md の記述）',
    'android/app/src/main/res/values/strings.xml': '一覧で代える（app_name の値のみ）',
    '.github/scripts/weaver_release_guard.sh': '一覧で代える',
    '.gitignore': '一覧で代える',
};

function commentedFiles(): string[] {
    const r = spawnSync('git', ['grep', '-lI', '--untracked', '-F', MARK], {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    if (r.status !== 0 && r.status !== 1) {
        throw new Error(`git grep failed: ${r.stderr}`);
    }
    return r.stdout.split('\n').map((x: string) => x.trim()).filter(Boolean).filter((x: string) => !isExcluded(x)).sort();
}

function listedFiles(): string[] {
    const md = fs.readFileSync(path.join(ROOT, 'WEAVER.md'), 'utf8').replace(/\r\n/g, '\n');
    const sec = md.split('## 変更したファイル一覧')[1];
    if (!sec) {
        throw new Error('WEAVER.md に「変更したファイル一覧」節が無い');
    }
    const table = sec.split('\n## ')[0];
    const out: string[] = [];
    for (const line of table.split('\n')) {
        const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
        if (m) {
            out.push(m[1]);
        }
    }
    return out.sort();
}

describe('WEAVER.md の変更ファイル一覧 ⇔ 「Modified for Weaver」コメント（完全一致）', () => {
    const commented = commentedFiles();
    const listed = listedFiles();

    it('走査が空でない（陽性対照）: コメント付き20件以上・一覧25件以上', () => {
        expect(commented.length).toBeGreaterThanOrEqual(20);
        expect(listed.length).toBeGreaterThanOrEqual(25);
    });

    it('(a) コメントがあるのに一覧に無いファイルは0件', () => {
        const missing = commented.filter((f) => !listed.includes(f));
        expect(missing).toEqual([]);
    });

    it('(b) 一覧にあるのに存在しないファイルは0件', () => {
        const gone = listed.filter((f) => !fs.existsSync(path.join(ROOT, f)));
        expect(gone).toEqual([]);
    });

    it('(b) 一覧にあるのにコメントが無いファイルは、例外リスト（理由つき）のものだけ', () => {
        const noComment = listed.filter((f) => !commented.includes(f) && !(f in NO_COMMENT_OK));
        expect(noComment).toEqual([]);
    });

    it('例外リストに、実は一覧に無い・コメントがある不要な項目が無い', () => {
        const stale = Object.keys(NO_COMMENT_OK).filter((f) => !listed.includes(f) || commented.includes(f));
        expect(stale).toEqual([]);
    });

    it('一覧に重複行が無い', () => {
        const dup = listed.filter((f, i) => listed.indexOf(f) !== i);
        expect(dup).toEqual([]);
    });
});
