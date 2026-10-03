// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループK（UT-103〜UT-106）: システム投稿アバター（C-7）
// 画像 WEAVER_LOGO・32×32・borderRadius 16・背景 theme.centerChannelBg。theme プロップの署名は維持。
// 差し込み先 app/components/system_avatar/index.tsx（SystemAvatar）を通して検査する。

import React from 'react';

import CompassIcon from '@components/compass_icon';
import SystemAvatar from '@components/system_avatar';
import {Preferences} from '@constants';
import {renderWithIntl} from '@test/intl-test-helper';

import {WEAVER_LOGO} from '../images';

const support = require('./weaver_test_support.cjs');

const theme = Preferences.THEMES.denim;
type R = ReturnType<typeof renderWithIntl>;
const logoNodes = (r: R) => r.UNSAFE_root.findAll((n) => Boolean(n.props) && n.props.source === WEAVER_LOGO);
const hostImageCount = (r: R) => {
    let count = 0;
    support.walkJson(r.toJSON(), (n: {props?: {source?: unknown}}) => {
        if (n.props && n.props.source !== undefined) {
            count += 1;
        }
    });
    return count;
};

describe('SystemAvatar（C-7）', () => {
    it('UT-103 CompassIcon が無く、画像が1つ', () => {
        const r = renderWithIntl(<SystemAvatar theme={theme}/>);
        // eslint-disable-next-line new-cap
        expect(r.UNSAFE_queryAllByType(CompassIcon)).toHaveLength(0);
        expect(hostImageCount(r)).toBe(1);
    });

    it('UT-104 画像の style は width=32・height=32・borderRadius=16、source=WEAVER_LOGO', () => {
        const r = renderWithIntl(<SystemAvatar theme={theme}/>);
        expect(logoNodes(r).length).toBeGreaterThan(0);
        expect(support.flattenStyle(logoNodes(r)[0].props.style)).toEqual(expect.objectContaining({width: 32, height: 32, borderRadius: 16}));
    });

    it('UT-105 背景色は theme.centerChannelBg（画像または囲みの View のどちらかに指定されている）', () => {
        const r = renderWithIntl(<SystemAvatar theme={theme}/>);
        const withBg = r.UNSAFE_root.findAll((n) => Boolean(n.props) && support.flattenStyle(n.props.style).backgroundColor === theme.centerChannelBg);
        expect(withBg.length).toBeGreaterThan(0);
    });

    it('UT-106 theme を渡して描画しても console.error・console.warn が0回', () => {
        const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            renderWithIntl(<SystemAvatar theme={theme}/>);
            expect(err).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            err.mockRestore();
            warn.mockRestore();
        }
    });
});
