// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: abi（同梱 ABI）（UT-338・339）。詳細設計 §5.3.13
// 入力: --dir の abis.txt。--abis A,B,C で既定（arm64-v8a,armeabi-v7a,x86_64）を上書き可。順序・重複は無視。完全一致。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const path = require('path');

jest.setTimeout(120000);
afterAll(() => s.cleanup());

function abi(text: string | null, extra: string[] = []) {
    const d = s.tmp('k79-abi-');
    if (text !== null) {
        s.write(d, 'abis.txt', text);
    }
    return s.guard(['abi', '--dir', s.posix(d), ...extra]);
}

describe('abi（詳細設計 §5.3.13）', () => {
    it('UT-338 正常: ①3行 ②順序入れ替え・重複行つき ③--abis arm64-v8a を指定して abis.txt が arm64-v8a のみ: 3通りとも rc=0', () => {
        expect(abi('arm64-v8a\narmeabi-v7a\nx86_64\n').rc).toBe(0);
        expect(abi('x86_64\narm64-v8a\narmeabi-v7a\narm64-v8a\n').rc).toBe(0);
        expect(abi('arm64-v8a\n', ['--abis', 'arm64-v8a']).rc).toBe(0);
    });

    it('UT-339 異常: ①abis.txt が無い ②空 ③x86 が加わった4行 ④x86_64 が欠けた2行: 4通りとも rc=1。③の出力に x86・④の出力に欠けた x86_64', () => {
        expect(abi(null).rc).toBe(1);
        expect(abi('').rc).toBe(1);
        const three = abi('arm64-v8a\narmeabi-v7a\nx86_64\nx86\n');
        expect(three.rc).toBe(1);
        expect(three.out).toContain('x86');
        const four = abi('arm64-v8a\narmeabi-v7a\n');
        expect(four.rc).toBe(1);
        expect(four.out).toContain('x86_64');
    });
});
