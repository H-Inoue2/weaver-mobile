// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG5 ブランド（UT-108〜117）。詳細設計 §5.3.5・§5.8.3
// app_name は app/weaver/constants.ts の APP_NAME と完全一致（確認用は警告・提出用は違反）。
// ハッシュ一覧の画像が一覧と同一（上流のまま）なら確認用は警告・提出用は違反。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

const IMG = 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png';
const ag5 = (root: string, mode: string, hashRel: string = s.HASHES_REL) => s.guard(['ag5', '--mode', mode, '--root', s.posix(root), '--hash-list', s.posix(root + '/' + hashRel)]);
// 画像1枚＋ハッシュ一覧（listed は一覧に書くハッシュの元の内容。actual は木に置く内容）
function treeWithImage(actual: string, listed: string, o: Record<string, unknown> = {}) {
    const root = s.goodTree(o);
    s.write(root, IMG, actual);
    s.write(root, s.HASHES_REL, `${s.sha256Buf(Buffer.from(listed))}  ${IMG}\n`);
    return root;
}

describe('AG5 ブランド（詳細設計 §5.3.5）', () => {
    it('UT-108 app_name＝Weaver・APP_NAME＝Weaver・ハッシュ一覧は変更済み画像（実ファイルと不一致）・submission: rc=0', () => {
        const root = treeWithImage('replaced-image', 'upstream-image');
        const r = ag5(root, 'submission');
        expect(r.rc).toBe(0);
        expect(r.out).toContain('ANDROID GUARD AG5 PASSED');
    });

    it('UT-109 app_name＝Mattermost Beta・confirm: rc=0＋WARN: AG5: app_name（確認用は警告）', () => {
        const root = treeWithImage('replaced-image', 'upstream-image', {appName: 'Mattermost Beta'});
        const r = ag5(root, 'confirm');
        expect(r.rc).toBe(0);
        expect(s.warnLines(r, 'AG5').join('\n')).toContain('app_name');
    });

    it('UT-110 同じ app_name・submission: rc=1・出力に app_name', () => {
        const root = treeWithImage('replaced-image', 'upstream-image', {appName: 'Mattermost Beta'});
        const r = ag5(root, 'submission');
        expect(r.rc).toBe(1);
        expect(s.failLines(r, 'AG5').join('\n')).toContain('app_name');
    });

    it('UT-111 constants.ts が無い／APP_NAME 行が無い: confirm・submission の両方で全て rc=1（比較元が無ければ違反）', () => {
        for (const label of ['no-file', 'no-line']) {
            for (const mode of ['confirm', 'submission']) {
                const root = treeWithImage('replaced-image', 'upstream-image');
                if (label === 'no-file') {
                    fs.rmSync(root + '/app/weaver/constants.ts');
                } else {
                    fs.writeFileSync(root + '/app/weaver/constants.ts', 'export const OTHER = 1;\n');
                }
                expect([label, mode, ag5(root, mode).rc]).toEqual([label, mode, 1]);
            }
        }
    });

    it('UT-112 APP_NAME が二重引用符 export const APP_NAME = "Weaver";: rc=1（1行・単一引用符の書式のみ読む）', () => {
        const root = treeWithImage('replaced-image', 'upstream-image');
        fs.writeFileSync(root + '/app/weaver/constants.ts', 'export const APP_NAME = "Weaver";\n');
        expect(ag5(root, 'submission').rc).toBe(1);
    });

    it('UT-113 app_name が weaver／末尾空白／Weaver&amp;・submission: 3通りとも rc=1（完全一致）', () => {
        for (const name of ['weaver', 'Weaver ', 'Weaver&amp;']) {
            const root = treeWithImage('replaced-image', 'upstream-image', {appName: name});
            expect([name, ag5(root, 'submission').rc]).toEqual([name, 1]);
        }
    });

    it('UT-114 app_restrictions.xml に英語の Mattermost が残る（app_name は Weaver）: rc=0（MDM用文言は対象外）', () => {
        const root = treeWithImage('replaced-image', 'upstream-image');
        s.write(root, 'android/app/src/main/res/xml/app_restrictions.xml', '<restrictions><restriction android:title="Mattermost server URL" /></restrictions>\n');
        expect(ag5(root, 'submission').rc).toBe(0);
    });

    it('UT-115 ハッシュ一覧の1件の画像が一覧と同一（上流のまま）: confirm は rc=0＋WARN にパス、submission は rc=1', () => {
        const root = treeWithImage('upstream-image', 'upstream-image');
        const c = ag5(root, 'confirm');
        expect(c.rc).toBe(0);
        expect(s.warnLines(c, 'AG5').join('\n')).toContain('ic_launcher.png');
        expect(ag5(root, 'submission').rc).toBe(1);
    });

    it('UT-116 一覧の1件のファイルが木に無い／一覧が空／書式不正行（ハッシュ63桁）: 3通りとも confirm・submission で rc=1', () => {
        const mk = (label: string) => {
            const root = treeWithImage('replaced-image', 'upstream-image');
            if (label === 'missing') {
                fs.rmSync(root + '/' + IMG);
            } else if (label === 'empty') {
                fs.writeFileSync(root + '/' + s.HASHES_REL, '');
            } else {
                fs.writeFileSync(root + '/' + s.HASHES_REL, `${'a'.repeat(63)}  ${IMG}\n`);
            }
            return root;
        };
        for (const label of ['missing', 'empty', 'bad-row']) {
            for (const mode of ['confirm', 'submission']) {
                expect([label, mode, ag5(mk(label), mode).rc]).toEqual([label, mode, 1]);
            }
        }
    });

    it('UT-117【基】基点コミットのツリー（strings.xml・画像35件）× 作成予定のハッシュ一覧: confirm は rc=0＋WARN（app_name と画像35件）、submission は rc=1 で FAIL 行が36行', () => {
        expect(s.exists(s.HASHES_REL)).toBe(true);
        const root = s.baseTree(['android/app/src/main/res', 'app/weaver/constants.ts']);
        const hashes = s.read(s.HASHES_REL);
        s.write(root, s.HASHES_REL, hashes);
        const c = ag5(root, 'confirm');
        expect(c.rc).toBe(0);
        expect(s.warnLines(c, 'AG5').length).toBeGreaterThanOrEqual(36);
        const sub = ag5(root, 'submission');
        expect(sub.rc).toBe(1);
        expect(s.failLines(sub, 'AG5')).toHaveLength(36);
        expect(sub.out).toContain('(36 violation(s))');
    });
});
