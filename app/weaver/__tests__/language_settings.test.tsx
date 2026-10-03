// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループX（UT-295〜302）: アプリ内の言語設定（井上さんの提案。実機テスト ビルド10の指摘C）
// 事実（実コード）: アプリの表示言語は、現在のユーザーの locale（UserLocaleProvider。app/context/user_locale）。ユーザーに locale が無いときは端末の言語（DEFAULT_LOCALE）。
//   上流に言語の選択画面は無い。対応言語は app/i18n/languages.ts の22言語（bg・de・en・en-AU・es・fa・fr・hu・it・ja・ko・nl・pl・pt-BR・ro・ru・sv・tr・uk・vi・zh-CN・zh-TW）。
// 期待する新規ファイル・IF（プログラマーが作る。名前・testID はここが正）:
//   app/weaver/screens/language.tsx
//     default export LanguageScreen（props なし）。SettingContainer（testID 'language_settings'）の中に、22言語の選択肢を languages.ts の並びで出す。
//     各選択肢は SettingOption type='select'、testID `language_settings.option.<言語コード>`（例 language_settings.option.ja・language_settings.option.zh-CN）、
//     表示名は、その言語の自称（例 ja=日本語・en=English・fr=Français。全22個が空でなく互いに異なる）。選択中は `<testID>.selected` が出る。
//     初期の選択は useUserLocale()（ユーザーの locale。無ければ端末の言語）。
//     選択すると、選択中と違う言語のときだけ updateMe(serverUrl, {locale: <言語コード>}) を1回呼ぶ（@actions/remote/user）。
//   app/weaver/components/settings_language_item.tsx
//     default export WeaverSettingsLanguageItem（props なし）。SettingItem（testID 'display_settings.language.option'、icon 'globe'、
//     label は weaver.settings.language〔ja=言語・en=Language〕、info は現在の言語の自称）。押すと navigateToSettingsScreen(Screens.SETTINGS_DISPLAY_LANGUAGE)。
//   app/constants/screens.ts: Screens.SETTINGS_DISPLAY_LANGUAGE = 'settings_display_language'
//   app/routes/(modals)/(settings)/settings_display_language.tsx（他の settings_display_*.tsx と同型。headerTitle は weaver.settings.language）
//   app/screens/settings/display/display.tsx に <WeaverSettingsLanguageItem/> を1項目差し込む。
//   app/weaver/messages.ts に weaver.settings.language を追加（messages.test.tsx の UT-14・286）。

import {fireEvent} from '@testing-library/react-native';
import React from 'react';

import {updateMe} from '@actions/remote/user';
import {Screens} from '@constants';
import {UserLocaleContext} from '@context/user_locale';
import {navigateToSettingsScreen} from '@screens/navigation';
import Display from '@screens/settings/display/display';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import WeaverSettingsLanguageItem from '../components/settings_language_item';
import LanguageScreen from '../screens/language';

const support = require('./weaver_test_support.cjs');

jest.mock('@actions/remote/user', () => ({updateMe: jest.fn(() => Promise.resolve({}))}));
jest.mock('@screens/navigation', () => ({navigateToSettingsScreen: jest.fn(), navigateBack: jest.fn()}));
jest.mock('@hooks/android_back_handler', () => ({__esModule: true, default: jest.fn()}));

const CODES = ['bg', 'de', 'en', 'en-AU', 'es', 'fa', 'fr', 'hu', 'it', 'ja', 'ko', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-CN', 'zh-TW'];
type R = ReturnType<typeof renderWithIntlAndTheme>;
const optionIds = (r: R): string[] => {
    const ids: string[] = support.allTestIds(r.toJSON()).filter((id: string) => (/^language_settings\.option\.[A-Za-z-]+$/).test(id));
    return ids.filter((id, i) => ids.indexOf(id) === i);
};
const withUserLocale = (locale: string, ui: React.ReactElement) => renderWithIntlAndTheme(
    <UserLocaleContext.Provider value={locale}>{ui}</UserLocaleContext.Provider>,
);
const labelOf = (r: R, code: string) => support.nodeText(support.findByTestId(r.toJSON(), `language_settings.option.${code}.label`)[0]);

describe('言語の選択画面（LanguageScreen）', () => {
    it('UT-295 選択肢は上流の対応言語の22個で、languages.ts の並び', () => {
        const r = renderWithIntlAndTheme(<LanguageScreen/>);
        expect(optionIds(r)).toEqual(CODES.map((c) => `language_settings.option.${c}`));
    });

    it('UT-296 表示名は、その言語の自称（ja=日本語・en=English・fr=Français）。全22個が空でなく互いに異なる', () => {
        const r = renderWithIntlAndTheme(<LanguageScreen/>);
        expect(labelOf(r, 'ja')).toBe('日本語');
        expect(labelOf(r, 'en')).toBe('English');
        expect(labelOf(r, 'fr')).toBe('Français');
        const labels = CODES.map((c) => labelOf(r, c));
        expect(labels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
        expect(new Set(labels).size).toBe(22);
    });

    it.each(['ja', 'fr', 'zh-CN', 'pt-BR'])('UT-297 ユーザーの locale が %s のとき、それが選択中（ほかは選択中でない）', (locale) => {
        const r = withUserLocale(locale, <LanguageScreen/>);
        expect(r.queryByTestId(`language_settings.option.${locale}.selected`)).not.toBeNull();
        const selected = CODES.filter((c) => r.queryByTestId(`language_settings.option.${c}.selected`) !== null);
        expect(selected).toEqual([locale]);
    });

    it('UT-298 ユーザーの locale が無い（コンテキストの既定＝端末の言語）ときは、端末の言語が選択中。jest の端末は en-GB → en', () => {
        const r = renderWithIntlAndTheme(<LanguageScreen/>);
        expect(CODES.filter((c) => r.queryByTestId(`language_settings.option.${c}.selected`) !== null)).toEqual(['en']);
    });

    it.each(['en', 'fr', 'zh-TW'])('UT-299 現在が ja のとき %s を選ぶと updateMe(serverUrl, {locale: %s}) が1回', (code) => {
        const r = withUserLocale('ja', <LanguageScreen/>);
        fireEvent.press(r.getByTestId(`language_settings.option.${code}`));
        expect(updateMe).toHaveBeenCalledTimes(1);
        expect(updateMe).toHaveBeenCalledWith(expect.any(String), {locale: code});
    });

    it('UT-300 すでに選択中の言語を選んでも updateMe は呼ばれない', () => {
        const r = withUserLocale('ja', <LanguageScreen/>);
        fireEvent.press(r.getByTestId('language_settings.option.ja'));
        expect(updateMe).not.toHaveBeenCalled();
    });
});

describe('設定→表示の言語の項目', () => {
    it('UT-301 項目 display_settings.language.option（ja=言語・en=Language）。押すと navigateToSettingsScreen(SETTINGS_DISPLAY_LANGUAGE)。info は現在の言語の自称', () => {
        expect((Screens as Record<string, unknown>).SETTINGS_DISPLAY_LANGUAGE).toBe('settings_display_language');
        const ja = withUserLocale('ja', <WeaverSettingsLanguageItem/>);
        expect(support.nodeText(support.findByTestId(ja.toJSON(), 'display_settings.language.option.label')[0])).toBe('言語');
        expect(support.nodeText(support.findByTestId(ja.toJSON(), 'display_settings.language.option.info')[0])).toBe('日本語');
        fireEvent.press(ja.getByTestId('display_settings.language.option'));
        expect(navigateToSettingsScreen).toHaveBeenCalledWith('settings_display_language');
        const en = renderWithIntlAndTheme(<WeaverSettingsLanguageItem/>);
        expect(support.nodeText(support.findByTestId(en.toJSON(), 'display_settings.language.option.label')[0])).toBe('Language');
    });

    it('UT-302 設定→表示の画面（Display）に言語の項目があり、ルートのファイルが存在する', () => {
        const r = renderWithIntlAndTheme(
            <Display
                hasMilitaryTimeFormat={false}
                isCRTEnabled={false}
                isCRTSwitchEnabled={false}
                isThemeSwitchingEnabled={false}
            />,
        );
        expect(r.queryByTestId('display_settings.language.option')).not.toBeNull();
        expect(support.exists('app/routes/(modals)/(settings)/settings_display_language.tsx')).toBe(true);
    });
});
