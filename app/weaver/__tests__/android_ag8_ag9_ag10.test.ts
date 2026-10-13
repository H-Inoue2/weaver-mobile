// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: AG8 rnbeta（UT-148〜154）・AG9 端末種別（UT-155〜160）・AG10 秘密の追跡検出（UT-161〜171・343）
// 詳細設計 §5.3.8・§5.3.11・§5.3.12。AG10 は使い捨ての Git リポジトリ（git init）で追跡の有無を作る。
// 鍵・秘密は書かない: 秘密に見えるファイルは名前だけ・内容はカナリア文字列（CANARYKEYBODY…）。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const cp = require('child_process');

jest.setTimeout(240000);
afterAll(() => s.cleanup());

describe('AG8 rnbeta（詳細設計 §5.3.8）', () => {
    const pre = (gradle: string) => {
        const root = s.tmp();
        s.write(root, 'android/app/build.gradle', gradle);
        return s.guard(['ag8', '--phase', 'pre', '--root', s.posix(root)]);
    };
    const gradleApp = (raw: string) => s.buildGradle({appIdRaw: raw});

    it('UT-148 pre: applicationId＝com.metarchitect.Weaver・namespace＝com.mattermost.rnbeta: rc=0（namespace の rnbeta は検査しない）', () => {
        expect(pre(s.buildGradle()).rc).toBe(0);
    });

    it('UT-149 applicationId が com.mattermost.rnbeta／com.metarchitect.Weaver.rnbeta／rnbeta.x（先頭・途中・末尾）: 3通りとも rc=1・出力に値', () => {
        for (const id of ['com.mattermost.rnbeta', 'com.metarchitect.Weaver.rnbeta', 'rnbeta.x']) {
            const r = pre(s.buildGradle({applicationId: id}));
            expect([id, r.rc]).toEqual([id, 1]);
            expect(r.out).toContain(id);
        }
    });

    it('UT-150 applicationId が0件／2件／applicationId = "…"（=付き）: 3通りとも rc=1', () => {
        const zero = s.buildGradle().replace(/^.*applicationId.*\n/m, '');
        const two = s.buildGradle().replace(/^(.*applicationId.*\n)/m, '$1$1');
        const eq = gradleApp('= "com.metarchitect.Weaver"');
        for (const g of [zero, two, eq]) {
            expect(pre(g).rc).toBe(1);
        }
    });

    it("UT-151 applicationId が単一引用符 'com.metarchitect.Weaver': rc=0", () => {
        expect(pre(gradleApp("'com.metarchitect.Weaver'")).rc).toBe(0);
    });

    const post = (d: string, id = 'com.metarchitect.Weaver') => s.guard(['ag8', '--phase', 'post', '--dir', s.posix(d), '--application-id', id]);

    it('UT-152 post: マージ後マニフェストのルート package＝com.metarchitect.Weaver・--application-id 同じ: rc=0', () => {
        expect(post(s.extractDir()).rc).toBe(0);
    });

    it('UT-153 post: ルート package が com.mattermost.rnbeta／com.metarchitect.Other／属性なし: 3通りとも rc=1', () => {
        expect(post(s.extractDir({pkg: 'com.mattermost.rnbeta'})).rc).toBe(1);
        expect(post(s.extractDir({pkg: 'com.metarchitect.Other'})).rc).toBe(1);
        const noPkg = s.extractDir();
        fs.writeFileSync(noPkg + '/manifest.xml', fs.readFileSync(noPkg + '/manifest.xml', 'utf8').replace(/ package="[^"]*"/, ''));
        expect(post(noPkg).rc).toBe(1);
    });

    it('UT-154 post: ルート package は正しく <activity> 名に rnbeta を含む: rc=0（ルートの package 属性だけが対象）', () => {
        const d = s.extractDir();
        expect(fs.readFileSync(d + '/manifest.xml', 'utf8')).toContain('rnbeta.MainActivity');
        expect(post(d).rc).toBe(0);
    });
});

describe('AG9 端末種別（詳細設計 §5.3.11）', () => {
    const pre = (manifest: string | null) => {
        const root = s.tmp();
        s.write(root, '.github/placeholder', '');
        if (manifest !== null) {
            s.write(root, 'android/app/src/main/AndroidManifest.xml', manifest);
        }
        return s.guard(['ag9', '--phase', 'pre', '--root', s.posix(root)]);
    };
    const post = (d: string) => s.guard(['ag9', '--phase', 'post', '--dir', s.posix(d)]);

    it('UT-155 pre: <application … android:resizeableActivity="false" …>（属性が複数行の後ろにある形）: rc=0', () => {
        expect(pre(s.manifestXml({app: {resizeable: 'false'}})).rc).toBe(0);
    });

    it('UT-156 resizeableActivity="true"（現行）／属性なし／<activity> だけに false（<application> には無し）: 3通りとも rc=1', () => {
        expect(pre(s.manifestXml({app: {resizeable: 'true'}})).rc).toBe(1);
        expect(pre(s.manifestXml({app: {resizeable: null}})).rc).toBe(1);
        expect(pre(s.manifestXml({app: {resizeable: null}, rawApp: ['        <activity android:name=".Other" android:resizeableActivity="false" />']})).rc).toBe(1);
    });

    it('UT-157 pre: マニフェスト無し・<application が見つからない: 2通りとも rc=1（空振り防止）', () => {
        expect(pre(null).rc).toBe(1);
        expect(pre('<manifest xmlns:android="http://schemas.android.com/apk/res/android" />\n').rc).toBe(1);
    });

    it('UT-158 post: マージ後マニフェストの <application> が resizeableActivity="false": rc=0', () => {
        expect(post(s.extractDir({resizeable: 'false'})).rc).toBe(0);
    });

    it('UT-159 post: マージ後が "true"（ライブラリが上書き）／属性なし: 2通りとも rc=1', () => {
        expect(post(s.extractDir({resizeable: 'true'})).rc).toBe(1);
        const d = s.extractDir();
        fs.writeFileSync(d + '/manifest.xml', fs.readFileSync(d + '/manifest.xml', 'utf8').replace(/ android:resizeableActivity="[^"]*"/, ''));
        expect(post(d).rc).toBe(1);
    });

    it('UT-160 <supports-screens android:largeScreens="true"> を持つマニフェスト（resizeableActivity=false）: rc=0（supports-screens は検査しない）', () => {
        expect(pre(s.manifestXml({app: {resizeable: 'false'}, supportsScreens: true})).rc).toBe(0);
    });
});

// ---- AG10: 使い捨ての Git リポジトリ ----
function gitIn(dir: string, args: string[]) {
    return cp.spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args], {cwd: dir, encoding: 'utf8'});
}
function repo(tracked: Record<string, string>, o: {untracked?: Record<string, string>; gitignore?: string; skipWorktree?: string[]; deleteTracked?: string[]} = {}) {
    const dir = s.tmp('k79-git-');
    gitIn(dir, ['init', '-q']);
    for (const [rel, content] of Object.entries(tracked)) {
        s.write(dir, rel, content);
    }
    if (o.gitignore) {
        s.write(dir, '.gitignore', o.gitignore);
        gitIn(dir, ['add', '.gitignore']);
    }
    for (const rel of Object.keys(tracked)) {
        gitIn(dir, ['add', '-f', rel]);
    }
    gitIn(dir, ['commit', '-q', '-m', 'init']);
    for (const rel of o.skipWorktree || []) {
        gitIn(dir, ['update-index', '--skip-worktree', rel]);
        fs.rmSync(dir + '/' + rel);
    }
    for (const rel of o.deleteTracked || []) {
        fs.rmSync(dir + '/' + rel);
    }
    for (const [rel, content] of Object.entries(o.untracked || {})) {
        s.write(dir, rel, content);
    }
    return dir;
}
const ag10 = (dir: string) => s.guard(['ag10', '--root', s.posix(dir)]);
const DK = 'android/app/debug.keystore';
const BASEFILES = {'README.md': '# readme\n', [DK]: 'debug-keystore-bytes'};

describe('AG10 秘密の追跡検出（詳細設計 §5.3.12）', () => {
    it('UT-161 README.md と android/app/debug.keystore だけを追跡: rc=0（debug.keystore は例外の1件）', () => {
        expect(ag10(repo(BASEFILES)).rc).toBe(0);
    });

    it('UT-162 追跡ファイル a.jks／b.p12／c.pem／d.p8／e.keystore を1つずつ: 5通りとも rc=1・出力にファイル名', () => {
        for (const name of ['a.jks', 'b.p12', 'c.pem', 'd.p8', 'e.keystore']) {
            const r = ag10(repo({...BASEFILES, [name]: 'x'}));
            expect([name, r.rc]).toEqual([name, 1]);
            expect(r.out).toContain(name);
        }
    });

    it('UT-163 追跡ファイル keys/my-service-account-123.json: rc=1', () => {
        expect(ag10(repo({...BASEFILES, 'keys/my-service-account-123.json': '{}'})).rc).toBe(1);
    });

    it('UT-164 ①service_account.json ②firebase-adminsdk-abc.json ③a/my_service-account.json は rc=1（ファイル名が出る）、④notes-service-account.txt（.json でない）は rc=0', () => {
        for (const name of ['service_account.json', 'firebase-adminsdk-abc.json', 'a/my_service-account.json']) {
            const r = ag10(repo({...BASEFILES, [name]: '{}'}));
            expect([name, r.rc]).toEqual([name, 1]);
            expect(r.out).toContain(name.split('/').pop());
        }
        expect(ag10(repo({...BASEFILES, 'notes-service-account.txt': 'x'})).rc).toBe(0);
    });

    it('UT-165 android/debug.keystore（例外パスと違う）は rc=1。android/app/debug.keystore と other.keystore の両方は rc=1 で違反名は other.keystore だけ', () => {
        expect(ag10(repo({'README.md': 'x', 'android/debug.keystore': 'x'})).rc).toBe(1);
        const r = ag10(repo({...BASEFILES, 'other.keystore': 'x'}));
        expect(r.rc).toBe(1);
        expect(r.out).toContain('other.keystore');
        expect(s.failLines(r, 'AG10').join('\n')).not.toContain('android/app/debug.keystore');
    });

    it('UT-166 追跡ファイル notes.txt に -----BEGIN RSA PRIVATE KEY----- と本文 CANARYKEYBODY123: rc=1・出力に notes.txt・本文は出力に0件', () => {
        const r = ag10(repo({...BASEFILES, 'notes.txt': '-----BEGIN RSA PRIVATE KEY-----\nCANARYKEYBODY123\n-----END RSA PRIVATE KEY-----\n'}));
        expect(r.rc).toBe(1);
        expect(r.out).toContain('notes.txt');
        expect(s.all(r)).not.toContain('CANARYKEYBODY123');
    });

    it('UT-167 内容に BEGIN EC／OPENSSH／（無印）PRIVATE KEY・"private_key": 4通りとも rc=1', () => {
        for (const body of ['-----BEGIN EC PRIVATE KEY-----\nX\n', '-----BEGIN OPENSSH PRIVATE KEY-----\nX\n', '-----BEGIN PRIVATE KEY-----\nX\n', '{"private_key": "X"}\n']) {
            const r = ag10(repo({...BASEFILES, 'n.txt': body}));
            expect([body.slice(0, 20), r.rc]).toEqual([body.slice(0, 20), 1]);
        }
    });

    it('UT-168 secret.jks が作業ツリーにあるが未追跡／.gitignore で無視: rc=0（追跡だけを見る）', () => {
        expect(ag10(repo(BASEFILES, {untracked: {'secret.jks': 'x'}})).rc).toBe(0);
        expect(ag10(repo(BASEFILES, {gitignore: '*.jks\n', untracked: {'secret.jks': 'x'}})).rc).toBe(0);
    });

    it('UT-169 ROOT が Git リポジトリでない: rc=1（fail-closed）', () => {
        const d = s.tmp('k79-nogit-');
        s.write(d, 'a.txt', 'x');
        expect(ag10(d).rc).toBe(1);
    });

    it('UT-170 skip-worktree（git ls-files -v のタグ S）にした追跡ファイル ios/x.txt が作業ツリーに無い: rc=0・NOTE: AG10: skipped (sparse): 1', () => {
        const r = ag10(repo({...BASEFILES, 'ios/x.txt': 'x'}, {skipWorktree: ['ios/x.txt']}));
        expect(r.rc).toBe(0);
        expect(r.out).toContain('NOTE: AG10: skipped (sparse): 1');
    });

    it('UT-171 現行の実リポジトリ（git ls-files）: rc=0（追跡の鍵ファイルは android/app/debug.keystore の1件のみ）', () => {
        const r = s.guard(['ag10', '--root', s.posix(s.ROOT)]);
        expect(r.rc).toBe(0);
    });

    it('UT-343 ①追跡されているが作業ツリーに無く S でないファイルは rc=1（notes.txt）。②S で作業ツリーに無い ios/secret.jks は名前の検査で rc=1。③S で無い ios/ok.txt は rc=0＋NOTE: skipped (sparse): 1', () => {
        const one = ag10(repo({...BASEFILES, 'notes.txt': 'x'}, {deleteTracked: ['notes.txt']}));
        expect(one.rc).toBe(1);
        expect(one.out).toContain('notes.txt');
        const two = ag10(repo({...BASEFILES, 'ios/secret.jks': 'x'}, {skipWorktree: ['ios/secret.jks']}));
        expect(two.rc).toBe(1);
        expect(two.out).toContain('ios/secret.jks');
        const three = ag10(repo({...BASEFILES, 'ios/ok.txt': 'x'}, {skipWorktree: ['ios/ok.txt']}));
        expect(three.rc).toBe(0);
        expect(three.out).toContain('NOTE: AG10: skipped (sparse): 1');
    });
});
