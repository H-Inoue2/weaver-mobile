// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループA（UT-01〜07）: app/weaver/constants.ts。
// 期待は「実ファイルの値」ではなく詳細設計 §3.0 の不変条件で書く（値が変わってもテストが壊れない）。

import * as constants from '../constants';

const support = require('./weaver_test_support.cjs');

const NAMES: string[] = support.CONST_NAMES;
const URL_NAMES = ['PRIVACY_POLICY_URL', 'TERMS_OF_SERVICE_URL', 'SUPPORT_URL', 'NOTIFICATION_HELP_URL', 'ACCOUNT_DELETION_URL'];
const values = constants as unknown as Record<string, unknown>;

describe('constants.ts', () => {
    it('UT-01 APP_NAME は Weaver', () => {
        expect(values.APP_NAME).toBe('Weaver');
    });

    it('UT-02 7定数がすべて export され string', () => {
        for (const n of NAMES) {
            expect(typeof values[n]).toBe('string');
        }
    });

    it.each(URL_NAMES)('UT-03 %s は空、または https:// で始まり空白を含まない', (name) => {
        const v = values[name] as string;
        expect(v === '' || (/^https:\/\//).test(v)).toBe(true);
        expect(v).not.toMatch(/\s/);
    });

    it('UT-04 REPORT_A_PROBLEM_EMAIL は空、または 文字@文字.文字 で空白なし', () => {
        const v = values.REPORT_A_PROBLEM_EMAIL as string;
        expect(v === '' || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(v)).toBe(true);
    });

    it.each(NAMES)('UT-05 %s の値に mattermost を含まない（大文字小文字不問）', (name) => {
        expect(String(values[name])).not.toMatch(/mattermost/i);
    });

    it('UT-06 ソース書式: export const NAME = \'…\'; の1行が1回ずつ。export default なし。" や ` で始まる値なし', () => {
        const src: string = support.read('app/weaver/constants.ts');
        const lines = src.split('\n');
        for (const n of NAMES) {
            const re = new RegExp(`^export const ${n} = '[^']*';$`);
            expect(lines.filter((l) => re.test(l))).toHaveLength(1);
            const any = new RegExp(`\\b${n}\\b\\s*=`);
            expect(lines.filter((l) => l.startsWith('export const') && any.test(l))).toHaveLength(1);
        }
        expect(src).not.toMatch(/^\s*export\s+default\b/m);
        expect(lines.filter((l) => (/^export const \w+ = ["`]/).test(l))).toHaveLength(0);
    });

    it('UT-07 ソース全体に mattermost.com／mattermost.org／reportaproblem が無い', () => {
        const src: string = support.read('app/weaver/constants.ts');
        expect(src).not.toMatch(/mattermost\.(com|org)/i);
        expect(src).not.toMatch(/reportaproblem/i);
    });
});
