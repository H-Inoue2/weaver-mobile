// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39 日本語化: assets/base/i18n/ja.json の整合を検査する。
// - 正は assets/base/i18n 配下のソース（@assets は dist/assets を指し、生成物が古い恐れがあるため fs で直接読む）。
// - 検査の源: en.json にあるキーは ja.json にもある／プレースホルダ（引数名・タグ名）が en と一致／ICU として解析できる／
//   コード側にだけ defaultMessage があるキー（en.json に無い）も ja.json にある。

import fs from 'fs';
import path from 'path';

import {parse} from '@formatjs/icu-messageformat-parser';

const I18N_DIR = path.resolve(__dirname, '../../../assets/base/i18n');
const readJson = (name: string): Record<string, string> => JSON.parse(fs.readFileSync(path.join(I18N_DIR, name), 'utf-8'));

const en = readJson('en.json');
const ja = readJson('ja.json');

// @formatjs/icu-messageformat-parser の TYPE（0=literal 1=argument 2=number 3=date 4=time 5=select 6=plural 7=pound 8=tag）
type Ast = Array<{type: number; value?: string; options?: Record<string, {value: Ast}>; children?: Ast}>;

function collect(ast: Ast, args: Set<string>, tags: Set<string>) {
    for (const el of ast) {
        if (el.type >= 1 && el.type <= 6) {
            args.add(el.value as string);
        }
        if (el.type === 8) {
            tags.add(el.value as string);
            collect(el.children || [], args, tags);
        }
        if (el.options) {
            for (const opt of Object.values(el.options)) {
                collect(opt.value, args, tags);
            }
        }
    }
}

function shape(message: string) {
    const args = new Set<string>();
    const tags = new Set<string>();
    collect(parse(message) as unknown as Ast, args, tags);
    return {args: [...args].sort(), tags: [...tags].sort()};
}

// コード側にだけ defaultMessage があり、en.json に無いキー（上流の抽出漏れ。ja.json には必要）と、その引数名。
const CODE_ONLY_KEYS: Record<string, string[]> = {
    'channel_info.thread_in': [],
    'channel_info.draft_to_user': [],
    'channel_info.draft_in_channel': [],
    'emoji_picker.default': [],
    'scheduled_post.channel_indicator': ['count'],
    'scheduled_post.channel_indicator.thread': ['count'],
    'apps.error.network.no_server': [],
    'mobile.edit_profile.remove_profile_photo': [],
    'mobile.edit_profile.upload_failed': [],
};

// 和文を含まなくてよい値（OK・製品名・記号のみ・上流で意図的に英語のまま）。ここに無い値は和文を含むこと。
const ASCII_ONLY_ALLOWED = new Set([
    'about.mattermost',
    'about.teamEditiont0',
    'about.teamEditiont1',
    'alert.push_proxy.button',
    'announcment_banner.okay',
    'logout.fail.ok',
    'mobile.calls_bluetooth',
    'mobile.calls_ok',
    'mobile.calls_okay',
    'mobile.gallery.title',
    'mobile.login_options.entraid',
    'mobile.login_options.gitlab',
    'mobile.login_options.google',
    'mobile.login_options.openid',
    'mobile.login_options.saml',
    'mobile.oauth.something_wrong.okButton',
    'mobile.reset_status.alert_ok',
    'mobile.server_upgrade.button',
    'permalink.error.okay',
    'persistent_notifications.error.okay',
    'playbooks.due_date.date_at_time',
    'playbooks.fetch_error.OK',
    'playbooks.not_enabled_or_unsupported.OK',
    'playbooks.only_runs_available.ok',
    'playbooks.retrospective_not_available.ok',
    'post_info.bot',
    'settings.about.copyright',
    'settings.about.server.version.value',
    'terms_of_service.terms_declined.ok',

    // K-39 で新たに追加した、英字のままでよい値
    'ai_rewrite.error.ok',
    'channel_attributes.labels.overflow',
    'magic_link.already_logged_in_error.ok',
    'mobile.calls.foreground_service.title',
    'security_manager.okay',
]);

const JAPANESE = /[぀-ヿ㐀-鿿]/;

describe('ja.json の整合（K-39 日本語化）', () => {
    it('UT-JA-01 JSONとして読め、全キーの値が空でない文字列で、キーの重複が無い', () => {
        const raw = fs.readFileSync(path.join(I18N_DIR, 'ja.json'), 'utf-8');
        const keyLines = raw.split(/\r?\n/).filter((l) => (/^ {2}"/).test(l));
        expect(keyLines.length).toBe(Object.keys(ja).length);
        const bad = Object.entries(ja).filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k);
        expect(bad).toEqual([]);
    });

    it('UT-JA-02 全キーの値がICUメッセージとして解析できる', () => {
        const failed: string[] = [];
        for (const [k, v] of Object.entries(ja)) {
            try {
                parse(v);
            } catch (e) {
                failed.push(`${k}: ${(e as Error).message}`);
            }
        }
        expect(failed).toEqual([]);
    });

    it('UT-JA-03 en.json にあるキーはすべて ja.json にもある（未訳0件）', () => {
        const missing = Object.keys(en).filter((k) => !(k in ja));
        expect(missing).toEqual([]);
    });

    it('UT-JA-04 en と ja の両方にあるキーで、引数名（{xxx}・plural・select）とタグ名（<b>等）が一致する', () => {
        const mismatched: string[] = [];
        for (const k of Object.keys(en)) {
            if (!(k in ja)) {
                continue;
            }
            const e = shape(en[k]);
            const j = shape(ja[k]);
            if (JSON.stringify(e) !== JSON.stringify(j)) {
                mismatched.push(`${k}: en=${JSON.stringify(e)} ja=${JSON.stringify(j)}`);
            }
        }
        expect(mismatched).toEqual([]);
    });

    it('UT-JA-05 コード側にだけ defaultMessage があるキーが ja.json にあり、引数名が期待どおり', () => {
        for (const [k, args] of Object.entries(CODE_ONLY_KEYS)) {
            expect(ja[k]).toBeDefined();
            expect(shape(ja[k]).args).toEqual(args);
        }
    });

    it('UT-JA-06 プロフィール写真の変更メニュー3項目が日本語（井上さん指摘: Take Photo / Photo Library / Remove Photo）', () => {
        expect(ja['mobile.file_upload.camera_photo']).toBe('写真を撮る');
        expect(ja['mobile.file_upload.library']).toBe('フォトライブラリから選ぶ');
        expect(ja['mobile.edit_profile.remove_profile_photo']).toBe('写真を削除する');
    });

    it('UT-JA-07 値に和文が含まれる（OK・製品名など許可リストの値を除く）', () => {
        const noJapanese = Object.entries(ja).filter(([k, v]) => !JAPANESE.test(v) && !ASCII_ONLY_ALLOWED.has(k)).map(([k, v]) => `${k}: ${v}`);
        expect(noJapanese).toEqual([]);
    });

    it('UT-JA-08 許可リストのキーが実在する（消えたキーを残さない）', () => {
        const stale = [...ASCII_ONLY_ALLOWED].filter((k) => !(k in ja));
        expect(stale).toEqual([]);
    });
});
