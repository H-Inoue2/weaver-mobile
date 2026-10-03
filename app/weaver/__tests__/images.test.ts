// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループD（UT-43〜UT-50, UT-236）: 画像と images.ts（静的検査＋export の確認）。
// 前提（P0）: node scripts/generate-assets.js を先に実行（dist/assets/images へ反映）。

import crypto from 'crypto';

const support = require('./weaver_test_support.cjs');

const LOGO = [['Weaver_Logo.png', 80], ['Weaver_Logo@2x.png', 160], ['Weaver_Logo@3x.png', 240]] as Array<[string, number]>;
const ICON = [['Icon_Weaver.png', 18], ['Icon_Weaver@2x.png', 36], ['Icon_Weaver@3x.png', 54]] as Array<[string, number]>;
const NEW6 = [...LOGO, ...ICON];
const CURRENT_ICON_SHA256 = '1899f7d2de7d4fd0f517b29f6eb9a0be1f0ba360ca781d582f8f932dba8c5db2';

describe('画像（assets/base/images）', () => {
    it('UT-43 新規6ファイルがある', () => {
        for (const [name] of NEW6) {
            expect(support.exists(`assets/base/images/${name}`)).toBe(true);
        }
    });

    it.each(NEW6)('UT-44 %s の寸法は %i×%i', (name, size) => {
        const info = support.pngInfo(`assets/base/images/${name}`);
        expect([info.width, info.height]).toEqual([size, size]);
    });

    it.each(NEW6)('UT-45 %s の先頭8バイトが PNG 署名', (name) => {
        expect(support.pngInfo(`assets/base/images/${name}`).sigOk).toBe(true);
    });

    it('UT-46 icon.png は 152×152 で、現行（fe4a861a）から上書きされている', () => {
        const info = support.pngInfo('assets/base/images/icon.png');
        expect([info.width, info.height]).toEqual([152, 152]);
        expect(crypto.createHash('sha256').update(info.buffer).digest('hex')).not.toBe(CURRENT_ICON_SHA256);
    });

    it('UT-47 app/weaver の @assets/images 参照先がすべて実在し、images.ts が Weaver_Logo と Icon_Weaver を参照', () => {
        const files: string[] = support.walk('app/weaver', ['.ts', '.tsx']).filter((f: string) => !support.isTestFile(f));
        expect(files).toContain('app/weaver/images.ts');
        const refs: Array<[string, string]> = [];
        for (const f of files) {
            const src: string = support.read(f);
            const re = /require\(\s*['"]@assets\/images\/([^'"]+)['"]\s*\)/g;
            let m = re.exec(src);
            while (m) {
                refs.push([f, m[1]]);
                m = re.exec(src);
            }
        }
        for (const [f, name] of refs) {
            expect({f, name, exists: support.exists(`assets/base/images/${name}`)}).toEqual({f, name, exists: true});
        }
        const imagesSrc: string = support.read('app/weaver/images.ts');
        expect(imagesSrc).toMatch(/Weaver_Logo/);
        expect(imagesSrc).toMatch(/Icon_Weaver/);
    });

    it('UT-48 dist/assets/images に新規6ファイルがある（無ければ generate-assets を先に実行）', () => {
        const missing = NEW6.map(([n]) => n).filter((n) => !support.exists(`dist/assets/images/${n}`));
        if (missing.length) {
            throw new Error(`dist/assets/images に無い: ${missing.join(', ')}。node scripts/generate-assets.js を先に実行してください`);
        }
    });

    it('UT-49 WEAVER_SSO_ICON が export され undefined でない', () => {
        const images = require('../images');
        expect(images.WEAVER_SSO_ICON).toBeDefined();
    });

    it('UT-236 WEAVER_LOGO が export され undefined でない', () => {
        const images = require('../images');
        expect(images.WEAVER_LOGO).toBeDefined();
    });

    it('UT-50 Icon_Gitlab.png（3サイズ）は削除せず残っている', () => {
        for (const n of ['Icon_Gitlab.png', 'Icon_Gitlab@2x.png', 'Icon_Gitlab@3x.png']) {
            expect(support.exists(`assets/base/images/${n}`)).toBe(true);
        }
    });
});
