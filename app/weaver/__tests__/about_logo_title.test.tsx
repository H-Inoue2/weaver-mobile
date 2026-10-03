// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループF（UT-62〜UT-65）: app/weaver/components/about_logo_title.tsx（C-3）
// 画像（testID about.logo。80×80・borderRadius 18）＋タイトル（testID about.title。APP_NAME）。

import React from 'react';

import CompassIcon from '@components/compass_icon';
import {Preferences} from '@constants';
import {ThemeContext} from '@context/theme';
import {renderWithIntl} from '@test/intl-test-helper';

import WeaverAboutLogoTitle from '../components/about_logo_title';
import {WEAVER_LOGO} from '../images';

const support = require('./weaver_test_support.cjs');

const renderWithTheme = (theme: Theme) => renderWithIntl(
    <ThemeContext.Provider value={theme}>
        <WeaverAboutLogoTitle/>
    </ThemeContext.Provider>,
);

type R = ReturnType<typeof renderWithIntl>;
const logoInstances = (r: R) => r.UNSAFE_root.findAll((n) => Boolean(n.props) && n.props.source === WEAVER_LOGO);
const logoStyle = (r: R) => support.flattenStyle(logoInstances(r)[0]?.props.style);
const titleText = (r: R) => support.nodeText(support.findByTestId(r.toJSON(), 'about.title')[0]);

describe('WeaverAboutLogoTitle', () => {
    it('UT-62 testID about.logo が画像（CompassIcon でない）で source=WEAVER_LOGO、80×80・borderRadius 18', () => {
        const r = renderWithTheme(Preferences.THEMES.denim);
        expect(r.UNSAFE_root.findAll((n) => Boolean(n.props) && n.props.testID === 'about.logo').length).toBeGreaterThan(0);
        // eslint-disable-next-line new-cap
        expect(r.UNSAFE_queryAllByType(CompassIcon)).toHaveLength(0);
        expect(logoInstances(r).length).toBeGreaterThan(0);
        expect(logoStyle(r)).toEqual(expect.objectContaining({width: 80, height: 80, borderRadius: 18}));
    });

    it('UT-63 about.title の文字全体が Weaver（エディション・Mattermost を含まない）', () => {
        const r = renderWithTheme(Preferences.THEMES.denim);
        const t = titleText(r);
        expect(t.trim()).toBe('Weaver');
        expect(t).not.toMatch(/mattermost|team edition|enterprise edition/i);
    });

    it('UT-64 ライト・ダークでロゴの style が同一で tintColor が無い。タイトル色は centerChannelColor', () => {
        const light = renderWithTheme(Preferences.THEMES.denim);
        const dark = renderWithTheme(Preferences.THEMES.onyx);
        expect(logoStyle(light)).toEqual(logoStyle(dark));
        expect(logoStyle(light)).not.toHaveProperty('tintColor');
        expect(logoInstances(light)[0].props.tintColor).toBeUndefined();
        const titleColor = (r: R, theme: Theme) => {
            const node = support.findByTestId(r.toJSON(), 'about.title')[0];
            expect(support.flattenStyle(node.props.style).color).toBe(theme.centerChannelColor);
        };
        titleColor(light, Preferences.THEMES.denim);
        titleColor(dark, Preferences.THEMES.onyx);
    });

    it('UT-65 ソース静的: CompassIcon と mattermost（コメント・import を除く）が0件', () => {
        const src: string = support.codeOnly(support.read('app/weaver/components/about_logo_title.tsx'));
        expect(src).not.toMatch(/CompassIcon/);
        expect(src).not.toMatch(/mattermost/i);
    });
});
