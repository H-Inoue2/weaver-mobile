// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// 結合テスト（回帰・実装前から通る）: IT-01・IT-05・IT-06（About 画面。帰属表記と既存表示の不変）
// Weaver の新規モジュールを import しない（G区分として記録するため）。
// 設定→About の画面全体を、expo-application・サーバー設定を差し替えて描画する。

import React from 'react';

import About from '@screens/settings/about/about';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

const support = require('./weaver_test_support.cjs');

const setAppId = (id?: string) => {
    (global as unknown as Record<string, unknown>).__weaverMockAppId = id;
};

jest.mock('expo-application', () => ({
    get applicationId() {
        return (global as unknown as Record<string, unknown>).__weaverMockAppId || 'com.met-architect.Weaver';
    },
    nativeApplicationVersion: '2.45.0',
    nativeBuildVersion: '7',
}));
jest.mock('@actions/remote/license', () => ({getLicenseLoadMetric: jest.fn(() => Promise.resolve(null))}));
jest.mock('@utils/url', () => ({tryOpenURL: jest.fn()}));
jest.mock('@screens/navigation', () => ({navigateBack: jest.fn()}));
jest.mock('@hooks/android_back_handler', () => ({__esModule: true, default: jest.fn()}));

const textOf = (r: ReturnType<typeof renderWithIntlAndTheme>, id: string) => support.nodeText(support.findByTestId(r.toJSON(), id)[0]);
const renderAbout = (config = support.makeAboutConfig(), license?: Partial<ClientLicense>) => renderWithIntlAndTheme(
    <About
        config={config as ClientConfig}
        license={license as ClientLicense}
    />,
);

describe('About 画面の回帰（G）', () => {
    beforeEach(() => {
        setAppId();
    });

    it('IT-01 帰属表記が消えていない: powered_by・copyright・notice_text', () => {
        const r = renderAbout();
        expect(textOf(r, 'about.powered_by')).toBe('Weaver is powered by Mattermost');
        expect(textOf(r, 'about.copyright')).toBe(`Copyright 2015-${new Date().getFullYear()} Mattermost, Inc. All rights reserved`);
        expect(r.queryByTestId('about.notice_text')).not.toBeNull();
    });

    it('IT-05 既存表示の不変: 版・サーバー版・DB・スキーマ版', () => {
        const r = renderAbout();
        expect(textOf(r, 'about.app_version.value')).toBe('2.45.0 (Build 7)');
        expect(textOf(r, 'about.server_version.value')).toBe('10.5.0');
        expect(textOf(r, 'about.database.value')).toBe('mysql');
        expect(textOf(r, 'about.database_schema_version.value')).toBe('1');
    });

    it('IT-06 applicationId=com.mattermost.rn のとき about.powered_by が無い（既存の挙動）', () => {
        setAppId('com.mattermost.rn');
        const r = renderAbout();
        expect(r.queryByTestId('about.powered_by')).toBeNull();
    });
});
