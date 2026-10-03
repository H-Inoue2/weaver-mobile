// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループB（UT-08〜UT-37, UT-234〜）: app/weaver/messages.ts。
// 案内画面の文言の正は運用設計 K39_アカウント削除_運用設計_v0.1.md §7.1（ja）・§7.2（en）。
// 取り込みの規則（詳細設計 §3.5.3）: 行頭記号・見出し記号は含めない／複数行は LF／ja の穴埋めは ⟦ ⟧。
// body_no_docs の値の正は詳細設計 §3.10。

import {renderHook} from '@testing-library/react-native';
import React from 'react';
import {IntlProvider} from 'react-intl';

import {WEAVER_MESSAGES, getWeaverMessage, useWeaverMessage} from '../messages';

const {KEYS, JA, EN} = require('./expected_messages.cjs') as {KEYS: string[]; JA: Record<string, string>; EN: Record<string, string>};

const ja = WEAVER_MESSAGES?.ja as unknown as Record<string, string>;
const en = WEAVER_MESSAGES?.en as unknown as Record<string, string>;
const get = getWeaverMessage as (locale: string, key: string) => string;

describe('messages.ts: getWeaverMessage', () => {
    it('UT-08 ja の weaver.sso_login', () => {
        expect(get('ja', 'weaver.sso_login')).toBe('Weaverでログイン');
    });
    it('UT-09 en の weaver.sso_login', () => {
        expect(get('en', 'weaver.sso_login')).toBe('Log in with Weaver');
    });
    it.each(['fr', 'de', 'zh-CN', 'pt-BR', 'ko', 'es'])('UT-10 ロケール %s は英語', (loc) => {
        expect(get(loc, 'weaver.sso_login')).toBe('Log in with Weaver');
    });
    it('UT-11 ロケール空文字は英語（例外を出さない）', () => {
        expect(get('', 'weaver.sso_login')).toBe('Log in with Weaver');
    });
    it('UT-37 未知のキーはキー文字列をそのまま返す（例外を投げない）', () => {
        expect(() => get('en', 'weaver.no_such_key')).not.toThrow();
        expect(get('en', 'weaver.no_such_key')).toBe('weaver.no_such_key');
        expect(get('ja', 'weaver.no_such_key')).toBe('weaver.no_such_key');
    });
});

describe('messages.ts: 表の整合', () => {
    it('UT-12 en 表と ja 表のキー集合が完全に一致', () => {
        expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    });
    it('UT-13 全キーが weaver. で始まる', () => {
        for (const k of [...Object.keys(ja), ...Object.keys(en)]) {
            expect(k.startsWith('weaver.')).toBe(true);
        }
    });
    it('UT-14 必須19キーが en・ja の両方にあり、キー集合はちょうどその19個', () => {
        expect(KEYS).toHaveLength(19);
        expect(Object.keys(en).sort()).toEqual([...KEYS].sort());
        expect(Object.keys(ja).sort()).toEqual([...KEYS].sort());
    });
    it('UT-31 旧キー（intro・who.*・process.*・data.body）が存在しない', () => {
        const all = [...Object.keys(ja), ...Object.keys(en)];
        for (const old of ['weaver.account_deletion.intro', 'weaver.account_deletion.data.body']) {
            expect(all).not.toContain(old);
        }
        expect(all.filter((k) => (/\.who\.|\.process\./).test(k))).toHaveLength(0);
    });
});

describe('messages.ts: 文言の値（正は運用設計 §7.1・§7.2、詳細設計 §3.10）', () => {
    it('UT-15 weaver.settings.account_deletion', () => {
        expect(get('ja', 'weaver.settings.account_deletion')).toBe(JA['weaver.settings.account_deletion']);
        expect(get('en', 'weaver.settings.account_deletion')).toBe(EN['weaver.settings.account_deletion']);
    });
    it('UT-16 title', () => {
        expect(get('ja', 'weaver.account_deletion.title')).toBe('アカウントの削除について');
        expect(get('en', 'weaver.account_deletion.title')).toBe('About account deletion');
    });
    const cases: Array<[string, string]> = [
        ['UT-17', 'weaver.account_deletion.lead'],
        ['UT-18', 'weaver.account_deletion.how.title'],
        ['UT-19', 'weaver.account_deletion.how.step1'],
        ['UT-20', 'weaver.account_deletion.how.step2'],
        ['UT-21', 'weaver.account_deletion.how.note1'],
        ['UT-22', 'weaver.account_deletion.how.note2'],
        ['UT-23', 'weaver.account_deletion.support_button'],
        ['UT-24', 'weaver.account_deletion.data.title'],
        ['UT-25', 'weaver.account_deletion.data.account'],
        ['UT-26', 'weaver.account_deletion.data.posts'],
        ['UT-27', 'weaver.account_deletion.data.workflow'],
        ['UT-28', 'weaver.account_deletion.device.title'],
        ['UT-29', 'weaver.account_deletion.device.body'],
        ['UT-238', 'weaver.notification_notice.body_no_docs'],
    ];
    it.each(cases)('%s %s（ja・en の逐語一致）', (_id, key) => {
        expect(get('ja', key)).toBe(JA[key]);
        expect(get('en', key)).toBe(EN[key]);
        expect(ja[key]).toBe(JA[key]);
        expect(en[key]).toBe(EN[key]);
    });
    it('UT-30 link.detail・link.privacy はラベルのみ', () => {
        expect(get('ja', 'weaver.account_deletion.link.detail')).toBe('詳細');
        expect(get('ja', 'weaver.account_deletion.link.privacy')).toBe('プライバシーポリシー');
        expect(get('en', 'weaver.account_deletion.link.detail')).toBe('Details');
        expect(get('en', 'weaver.account_deletion.link.privacy')).toBe('Privacy policy');
    });
    it('UT-239 複数行の値は LF のみで、行頭に空白を持たない（lead・step2・note2・posts・account(ja)・device.body(ja)）', () => {
        for (const key of ['weaver.account_deletion.lead', 'weaver.account_deletion.how.step2', 'weaver.account_deletion.how.note2', 'weaver.account_deletion.data.posts']) {
            for (const table of [ja, en]) {
                expect(table[key]).not.toMatch(/\r/);
                for (const line of table[key].split('\n')) {
                    expect(line).toBe(line.trimStart());
                    expect(line.length).toBeGreaterThan(0);
                }
            }
        }
        for (const key of ['weaver.account_deletion.data.account', 'weaver.account_deletion.device.body']) {
            expect(ja[key].split('\n').every((l) => l === l.trimStart() && l.length > 0)).toBe(true);
        }
    });
});

describe('messages.ts: 全キー・全言語の常時検査', () => {
    const tables: Array<[string, Record<string, string>]> = [['ja', ja], ['en', en]];

    it('UT-32 mattermost・gitlab・【】・TODO_WEAVER・要確定を含まない。⟦⟧ は device.body の2値だけ', () => {
        for (const [, table] of tables) {
            for (const key of Object.keys(table)) {
                const v = table[key];
                expect(v).not.toMatch(/mattermost/i);
                expect(v).not.toMatch(/gitlab/i);
                expect(v).not.toMatch(/[【】]/);
                expect(v).not.toMatch(/TODO_WEAVER|要確定/);
                if (key === 'weaver.account_deletion.device.body') {
                    expect(v).toMatch(/⟦[^⟧]+⟧/);
                } else {
                    expect(v).not.toMatch(/[⟦⟧]/);
                }
            }
        }
    });

    it('UT-34 削除完了の日数を断定しない（受付連絡の1文だけ除外）', () => {
        const allowed = ['3営業日以内にご連絡します', 'within 3 business days of receiving your request'];
        const re = /\d+\s*(営業日|日|時間|days?|business days?|hours?)/i;
        for (const [, table] of tables) {
            for (const key of Object.keys(table)) {
                if (!key.startsWith('weaver.account_deletion.')) {
                    continue;
                }
                let v = table[key];
                for (const a of allowed) {
                    v = v.split(a).join('');
                }
                expect(v).not.toMatch(re);
            }
        }

        // 除外の対象が実在し、how.step2 にだけ現れる
        expect(ja['weaver.account_deletion.how.step2']).toContain(allowed[0]);
        expect(en['weaver.account_deletion.how.step2']).toContain(allowed[1]);
    });

    it('UT-35 全値が空でなく前後に空白がない', () => {
        for (const [, table] of tables) {
            for (const key of Object.keys(table)) {
                expect(table[key].length).toBeGreaterThan(0);
                expect(table[key]).toBe(table[key].trim());
            }
        }
    });

    it('UT-36 ja の値は日本語の文字を含む（weaver.sso_login を除く）。en の値は日本語の文字を含まない', () => {
        const jp = /[ぁ-んァ-ヶ一-龠]/;
        for (const key of Object.keys(ja)) {
            if (key !== 'weaver.sso_login') {
                expect(ja[key]).toMatch(jp);
            }
        }
        for (const key of Object.keys(en)) {
            expect(en[key]).not.toMatch(jp);
        }
    });
});

describe('messages.ts: useWeaverMessage（フック）', () => {
    const wrapperFor = (locale: string) => function Wrapper({children}: {children: React.ReactNode}) {
        return (
            <IntlProvider
                locale={locale}
                messages={{}}
            >
                {children}
            </IntlProvider>
        );
    };

    it('UT-234 locale=ja のとき (key)=>string で日本語を返す', () => {
        const {result} = renderHook(() => useWeaverMessage(), {wrapper: wrapperFor('ja')});
        expect(typeof result.current).toBe('function');
        expect(result.current('weaver.sso_login' as never)).toBe('Weaverでログイン');
        expect(result.current('weaver.settings.account_deletion' as never)).toBe('アカウントの削除について');
    });

    it('UT-235 locale=en・fr・ja-JP のとき英語を返す', () => {
        for (const loc of ['en', 'fr', 'ja-JP']) {
            const {result} = renderHook(() => useWeaverMessage(), {wrapper: wrapperFor(loc)});
            expect(result.current('weaver.sso_login' as never)).toBe('Log in with Weaver');
        }
    });
});
