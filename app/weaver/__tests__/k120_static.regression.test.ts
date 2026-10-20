// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-120（「通知を受け取れません」警告を表示の入口で止める）: 静的検査（K120-UT-03p〜03t・04c・05a・05b・07a〜07d・07f）。
// 期待結果の正は K120_詳細設計.md §1（区分 A〜D）・§2.1・§3・§4.3、K120_単体テスト設計.md §1.2。
// 既存の UT-295 と weaver_md_changelist は「足し忘れ」を検出できない（集合の差だけを見る）ため、ここで個別に落とす。

export {};

const fs = require('fs');
const path = require('path');

const android = require('./android_test_support.cjs');
const support = require('./weaver_test_support.cjs');

const NEW_FILE = 'app/weaver/push_proxy_warning.ts';
const SERVER_ITEM_INDEX = 'app/screens/home/channel_list/servers/servers_list/server_item/index.ts';
const HEADER_INDEX = 'app/screens/home/channel_list/categories_list/header/index.ts';
const HEADER_TSX = 'app/screens/home/channel_list/categories_list/header/header.tsx';
const SERVER_ITEM_TSX = 'app/screens/home/channel_list/servers/servers_list/server_item/server_item.tsx';
const HEADER_INDEX_TEST = 'app/screens/home/channel_list/categories_list/header/index.test.tsx';

const WEAVER_HEADER = [
    '// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.',
    '// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).',
];

// 空白の揺れ（改行・インデント・末尾カンマ）を畳んで、呼び出しの形を比べる
const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/,\s*\)/g, ')').trim();
const importSpecs = (src: string): string[] => [...support.stripComments(src).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
const countOf = (src: string, needle: string): number => src.split(needle).length - 1;

describe('K-120 新規 app/weaver/push_proxy_warning.ts の形（詳細設計 §2.1）', () => {
    it('K120-UT-03p 定数は「export const SHOW_PUSH_PROXY_WARNING = false;」の1行書式がちょうど1行。同名の export const 行は1件。\\r は0個（LF）', () => {
        const src: string = support.read(NEW_FILE);
        const lines = src.split('\n');
        expect(lines.filter((l) => l === 'export const SHOW_PUSH_PROXY_WARNING = false;')).toHaveLength(1);
        expect(lines.filter((l) => (/^export const SHOW_PUSH_PROXY_WARNING\b/).test(l))).toHaveLength(1);
        const raw: Buffer = fs.readFileSync(support.abs(NEW_FILE));
        expect(raw.includes(13)).toBe(false);
    });

    it('K120-UT-03q 禁止語（⟦ ⟧ 要確定 確定】 TODO_WEAVER）と改造印（Modified for Weaver）が、コメントも含めて0件', () => {
        const src: string = support.read(NEW_FILE);
        for (const w of ['⟦', '⟧', '要確定', '確定】', 'TODO_WEAVER', 'Modified for Weaver']) {
            expect([w, src.includes(w)]).toEqual([w, false]);
        }
    });

    it('K120-UT-03r 先頭2行が allow_download_logs.ts の先頭2行と一字一句同じ（Weaver 用ヘッダー）で、3行目は空行', () => {
        const lines: string[] = support.read(NEW_FILE).split('\n');
        const ref: string[] = support.read('app/weaver/allow_download_logs.ts').split('\n');
        expect(lines.slice(0, 2)).toEqual(ref.slice(0, 2));
        expect(lines.slice(0, 2)).toEqual(WEAVER_HEADER);
        expect(lines[2]).toBe('');
    });

    it('K120-UT-03s 定数行の直前に連続するコメント塊があり、4点（通知を受け取れません・verified・K-80・jest.mock）を全て含む', () => {
        const lines: string[] = support.read(NEW_FILE).split('\n');
        const idx = lines.indexOf('export const SHOW_PUSH_PROXY_WARNING = false;');
        expect(idx).toBeGreaterThan(0);
        const block: string[] = [];
        for (let i = idx - 1; i >= 0 && lines[i].startsWith('//'); i--) {
            block.unshift(lines[i]);
        }
        const text = block.join('\n');
        for (const w of ['通知を受け取れません', 'verified', 'K-80', 'jest.mock']) {
            expect([w, text.includes(w)]).toEqual([w, true]);
        }
    });

    it('K120-UT-03t import は rxjs（of as of$・Observable の型）と @constants/push_proxy（PUSH_PROXY_STATUS_VERIFIED）。文字列 \'verified\' の直書き0件。export は2本・default なし', () => {
        const src: string = support.read(NEW_FILE);
        const code: string = support.stripComments(src);

        // rxjs の import は、値（of as of$）と型（Observable）の両方を含む。形は問わない（別の import type 文は no-duplicate-imports で lint エラーになるため、インラインの type 指定子でもよい）
        const rxjsImports = [...code.matchAll(/import\s+(?:type\s*)?\{([^}]*)\}\s*from\s*'rxjs'/g)].map((m) => m[1]).join(',');
        expect(rxjsImports).toMatch(/\bof\s+as\s+of\$/);
        expect(rxjsImports).toMatch(/\bObservable\b/);
        expect(code).toMatch(/import\s*\{\s*PUSH_PROXY_STATUS_VERIFIED\s*\}\s*from\s*'@constants\/push_proxy'/);
        expect((code.match(/['"`]verified['"`]/g) || [])).toHaveLength(0);
        const exportLines = src.split('\n').filter((l) => l.startsWith('export '));
        expect(exportLines).toHaveLength(2);
        expect(exportLines.filter((l) => (/^export default\b/).test(l))).toHaveLength(0);
    });

    it('K120-UT-04c 純粋性: import 指定子は rxjs と @constants/push_proxy の2種類だけ。DB・actions・EphemeralStore・書き込みの語が0件', () => {
        const src: string = support.read(NEW_FILE);
        expect([...new Set(importSpecs(src))].sort()).toEqual(['@constants/push_proxy', 'rxjs']);
        const code: string = support.stripComments(src);
        for (const w of ['@database', '@queries', '@actions', '@utils/push_proxy', 'EphemeralStore', 'write(', 'handleSystem', 'setPushProxyVerificationState']) {
            expect([w, code.includes(w)]).toEqual([w, false]);
        }
    });
});

describe('K-120 変えないもの（詳細設計 §1 区分 A・B）', () => {
    it('K120-UT-05a 区分 A: 他案件が触らない5ファイルが基点（BASE_SHA）と同一。HEAD を付けず作業ツリーと比べる', () => {
        const files = [
            'app/utils/push_proxy.ts',
            'app/actions/remote/entry/common.ts',
            'app/actions/remote/session.ts',
            'app/actions/remote/general.ts',
            'app/queries/servers/system.ts',
        ];
        for (const f of files) {
            expect([f, support.exists(f)]).toEqual([f, true]);
        }
        const r = android.git(['diff', '--name-only', android.BASE_SHA, '--', ...files]);
        expect(r.rc).toBe(0);
        expect(r.out.toString().split('\n').filter(Boolean)).toEqual([]);
    });

    it('K120-UT-05b 区分 B: 内側の部品の条件が残り（header.tsx 1件・server_item.tsx 2件・文言キー・alert-outline）、どちらも push_proxy_warning を import しない（方式 A の維持）', () => {
        const cond = 'pushProxyStatus !== PUSH_PROXY_STATUS_VERIFIED';
        const header: string = support.read(HEADER_TSX);
        const item: string = support.read(SERVER_ITEM_TSX);
        expect(countOf(header, cond)).toBe(1);
        expect(countOf(header, 'channel_list_header.push_alert')).toBe(1);
        expect(countOf(item, cond)).toBe(2);
        expect(countOf(item, 'server_list.push_proxy_error')).toBe(1);
        expect(countOf(item, 'server_list.push_proxy_unknown')).toBe(1);
        expect(countOf(item, 'alert-outline')).toBe(1);
        for (const src of [header, item]) {
            expect(importSpecs(src).filter((s) => s.includes('push_proxy_warning'))).toEqual([]);
            const code: string = support.stripComments(src);
            expect(code.includes('SHOW_PUSH_PROXY_WARNING')).toBe(false);
            expect(code.includes('observeDisplayedPushProxyStatus')).toBe(false);
        }
    });
});

describe('K-120 上流2ファイルの結線（詳細設計 §3・§4）', () => {
    const upstream = [SERVER_ITEM_INDEX, HEADER_INDEX];

    it.each(upstream)('K120-UT-07a 改造印: 4行目が「// Modified for Weaver (K-120, 2026-10)」で始まり、前後の3行目・5行目は空行 (%s)', (file) => {
        const lines: string[] = support.read(file).split('\n');
        expect(lines[2]).toBe('');
        expect(lines[3].startsWith('// Modified for Weaver (K-120, 2026-10)')).toBe(true);
        expect(lines[4]).toBe('');
    });

    it('K120-UT-07b import 行: server_item/index.ts は .. が6個、header/index.ts は .. が5個で、解決先が app/weaver/push_proxy_warning.ts に実在する', () => {
        const expected: Array<[string, string]> = [
            [SERVER_ITEM_INDEX, "import {observeDisplayedPushProxyStatus, SHOW_PUSH_PROXY_WARNING} from '../../../../../../weaver/push_proxy_warning';"],
            [HEADER_INDEX, "import {observeDisplayedPushProxyStatus, SHOW_PUSH_PROXY_WARNING} from '../../../../../weaver/push_proxy_warning';"],
        ];
        for (const [file, line] of expected) {
            const lines: string[] = support.read(file).split('\n');
            expect([file, lines.filter((l) => l === line).length]).toEqual([file, 1]);
            const rel = /from '([^']+)'/.exec(line)![1];
            const resolved = path.resolve(path.dirname(support.abs(file)), rel) + '.ts';
            expect(path.normalize(resolved)).toBe(path.normalize(support.abs(NEW_FILE)));
            expect(fs.existsSync(resolved)).toBe(true);
        }
    });

    it('K120-UT-07c 呼び出し形: 条件式の全体（server_item）／observePushVerificationStatus(database)（header）が第1引数、第2引数は識別子 SHOW_PUSH_PROXY_WARNING（true/false の直書きは不可）', () => {
        const item = norm(support.read(SERVER_ITEM_INDEX));
        const header = norm(support.read(HEADER_INDEX));
        expect(item).toContain(norm('pushProxyStatus: observeDisplayedPushProxyStatus(serverDatabase ? observePushVerificationStatus(serverDatabase) : of$(PUSH_PROXY_STATUS_UNKNOWN), SHOW_PUSH_PROXY_WARNING),'));
        expect(header).toContain(norm('pushProxyStatus: observeDisplayedPushProxyStatus(observePushVerificationStatus(database), SHOW_PUSH_PROXY_WARNING),'));
    });

    it('K120-UT-07d WEAVER.md: 上流2ファイルの行が各1行、K-120 を含む行がちょうど2行、第1列に改造印の無いファイルの行が0行、戻し方（行1）・K-39 の注記（行2）が第2列にある', () => {
        const md: string = fs.readFileSync(support.abs('WEAVER.md'), 'utf8').replace(/\r\n/g, '\n');
        const sec = md.split('## 変更したファイル一覧')[1].split('\n## ')[0];
        const rows = sec.split('\n').map((l) => /^\|\s*`([^`]+)`\s*\|(.*)$/.exec(l)).filter(Boolean) as RegExpExecArray[];
        const byPath = (p: string) => rows.filter((m) => m[1] === p);
        expect(byPath(SERVER_ITEM_INDEX)).toHaveLength(1);
        expect(byPath(HEADER_INDEX)).toHaveLength(1);
        expect(sec.split('\n').filter((l) => l.includes('K-120'))).toHaveLength(2);
        expect(rows.filter((m) => m[1] === 'app/utils/push_proxy.ts' || m[1] === NEW_FILE || m[1].endsWith('index.test.tsx'))).toHaveLength(0);
        const row1 = byPath(SERVER_ITEM_INDEX)[0][2];
        for (const w of ['SHOW_PUSH_PROXY_WARNING', 'true', '再ビルド']) {
            expect([w, row1.includes(w)]).toEqual([w, true]);
        }
        const row2 = byPath(HEADER_INDEX)[0][2];
        for (const w of ['app/utils/push_proxy.ts', 'K-39']) {
            expect([w, row2.includes(w)]).toEqual([w, true]);
        }
    });

    it('K120-UT-07f k120Upstream の3ファイル（上流2つ＋同居テスト）が、基点との差分に実際に含まれる（過大な許可の残存防止）', () => {
        const r = android.git(['diff', '--name-only', android.BASE_SHA]);
        expect(r.rc).toBe(0);
        const names = r.out.toString().split('\n').filter(Boolean);
        for (const f of [SERVER_ITEM_INDEX, HEADER_INDEX, HEADER_INDEX_TEST]) {
            expect([f, names.includes(f)]).toEqual([f, true]);
        }
    });
});
