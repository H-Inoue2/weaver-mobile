// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: weaver_android_aab.sh（UT-208〜222・350・351・365・366・371）。詳細設計 §5.6・§4.6
// サブコマンド: tools／extract／verify-input／verify-hash／facts／summary。外部ツールは PATH 先頭のスタブで模擬する。
// 秘密は使わない（使い捨ての名前・カナリアのパスだけ）。facts の形式は測定の実行までは暫定。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

jest.setTimeout(300000);
afterAll(() => s.cleanup());

const NDK = '27.1.12297006';
const TOOLS = ['zipalign', 'aapt2', 'dexdump', 'llvm-objdump', 'keytool'] as const;
const KEYS = ['WEAVER_KEYTOOL', 'WEAVER_AAPT2', 'WEAVER_ZIPALIGN', 'WEAVER_DEXDUMP', 'WEAVER_OBJDUMP'];

function androidHome(missing: string[] = [], bt = ['36.0.0']) {
    const home = s.tmp('k79-home-');
    for (const v of bt) {
        for (const t of ['zipalign', 'aapt2', 'dexdump']) {
            if (!missing.includes(t)) {
                s.write(home, `build-tools/${v}/${t}`, '#!/bin/sh\nexit 0\n');
            }
        }
    }
    if (!missing.includes('llvm-objdump')) {
        s.write(home, `ndk/${NDK}/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-objdump`, '#!/bin/sh\nexit 0\n');
    }
    return home;
}
function toolsRun(o: {missing?: string[]; bt?: string[]} = {}) {
    const st = s.makeStubs(o.missing?.includes('keytool') ? [] : ['keytool']);
    const home = androidHome(o.missing, o.bt);
    return s.aab(['tools', '--ndk-version', NDK], {stubDir: st.dir, env: {ANDROID_HOME: s.posix(home), ANDROID_SDK_ROOT: s.posix(home)}});
}

describe('tools（UT-208〜211）', () => {
    it('UT-208 5つの道具がそろう: 標準出力に KEY=VALUE の5行・各値のファイルが存在・rc=0', () => {
        const r = toolsRun();
        expect(r.rc).toBe(0);
        const kv = r.out.split('\n').filter((l: string) => /^WEAVER_[A-Z0-9_]+=/.test(l));
        expect(kv.map((l: string) => l.split('=')[0]).sort()).toEqual([...KEYS].sort());
        for (const l of kv) {
            const v = l.slice(l.indexOf('=') + 1);
            expect([l, fs.existsSync(v.replace(/^\/([a-z])\//, '$1:/'))]).toEqual([l, true]);
        }
    });

    it('UT-209 5つのうち1つずつ欠落（5通り）: 全て rc=1・出力に欠けたツール名', () => {
        for (const t of TOOLS) {
            const r = toolsRun({missing: [t]});
            expect([t, r.rc]).toEqual([t, 1]);
            expect(s.all(r)).toContain(t);
        }
    });

    it('UT-210 build-tools が 35.0.0 だけ／37.0.0 だけ: 2通りとも rc=1（版固定）', () => {
        expect(toolsRun({bt: ['35.0.0']}).rc).toBe(1);
        expect(toolsRun({bt: ['37.0.0']}).rc).toBe(1);
    });

    it('UT-211 ①5つそろう: 出力は KEY=VALUE の5行ちょうどで WEAVER_BUNDLETOOL_JAR は0件 ②1つだけ無い5通りは rc=1・見つからなかったキー名が出る', () => {
        const ok = toolsRun();
        expect(ok.rc).toBe(0);
        expect(ok.out.split('\n').filter((l: string) => /^[A-Z_]+=/.test(l))).toHaveLength(5);
        expect(ok.out).not.toContain('WEAVER_BUNDLETOOL_JAR');
        const keyOf: Record<string, string> = {keytool: 'WEAVER_KEYTOOL', aapt2: 'WEAVER_AAPT2', zipalign: 'WEAVER_ZIPALIGN', dexdump: 'WEAVER_DEXDUMP', 'llvm-objdump': 'WEAVER_OBJDUMP'};
        for (const t of TOOLS) {
            const r = toolsRun({missing: [t]});
            expect([t, r.rc]).toEqual([t, 1]);
            expect(s.all(r)).toContain(keyOf[t]);
        }
    });
});

// ---- extract ----
const DEX_LIST = 'base/dex/classes.dex\nbase/dex/classes2.dex\n';
const ZIPL = ['  Length      Date    Time    Name', '---------  ---------- -----   ----', '   100  2026-10-13 00:00   lib/arm64-v8a/liba.so', '   100  2026-10-13 00:00   lib/armeabi-v7a/libb.so', '   100  2026-10-13 00:00   lib/x86_64/libc.so', ''].join('\n');
const DEXDUMP = "Class #0            -\n  Class descriptor  : 'Lcom/mattermost/rnbeta/MainActivity;'\nClass #1 -\n  Class descriptor  : 'Lcom/mattermost/rnbeta/MainApplication;'\n";

type Ex = {signing?: 'signed' | 'unsigned'; fail?: string; empty?: string; env?: Record<string, string>; dexdump?: string; ziplist?: string; keytoolRc?: number; noJar?: boolean};
function extract(o: Ex = {}) {
    const st = s.makeStubs(['java', 'dexdump', 'aapt2', 'keytool', 'unzip']);
    const work = s.tmp('k79-ex-');
    const f = (name: string, text: string) => s.posix(s.write(work, name, text));
    const manifest = f('manifest.src', '<manifest package="com.metarchitect.Weaver" android:versionCode="1234" android:versionName="2.45.0" />\n');
    const resources = f('resources.src', 'string/project_id: weaver-test\nstring/google_app_id: 1:1:android:abc\n');
    const nsc = f('nsc.src', '<network-security-config />\n');
    const cert = f('cert.src', s.certTxt({}));
    const dexOut = f('dex.src', o.dexdump ?? DEXDUMP);
    const dexList = f('dexlist.src', DEX_LIST);
    const zl = f('zl.src', o.ziplist ?? ZIPL);
    const empty = (k: string) => (o.empty === k ? f('zero.src', '') : null);
    // java -jar bundletool: 引数の中身で出力を切り替える（ルール: 含まれる文字列|||終了コード|||出力ファイル）
    const rule = (name: string, rows: Array<[string, number, string | null]>) => s.posix(s.write(work, name, rows.map(([p, rc, of]) => `${p}|||${rc}|||${of ?? ''}`).join('\n') + '\n'));
    const javaRows: Array<[string, number, string | null]> = [
        ['dump manifest', o.fail === 'manifest' ? 1 : 0, empty('manifest') ?? manifest],
        ['dump resources', o.fail === 'resources' ? 1 : 0, empty('resources') ?? resources],
        ['build-apks', o.fail === 'universal' ? 1 : 0, null],
    ];
    const keyRows: Array<[string, number, string | null]> = [
        ['-printcert', o.keytoolRc ?? (o.fail === 'cert' ? 1 : 0), empty('cert') ?? cert],
        ['-genkeypair', 0, null],
        ['-genkey', 0, null],
    ];
    const aaptRows: Array<[string, number, string | null]> = [['', o.fail === 'nsc' ? 1 : 0, empty('nsc') ?? nsc]];
    const unzipRows: Array<[string, number, string | null]> = [['-Z1', 0, dexList], ['-l', 0, zl], ['-p', 0, dexOut]];
    const dexdumpRows: Array<[string, number, string | null]> = [['', o.fail === 'dex' ? 1 : 0, empty('dex') ?? dexOut]];
    const aab = s.write(work, 'in.aab', s.smallAab());
    const universal = s.write(work, 'universal.src', 'APK');
    const outDir = path.join(work, 'out');
    const tmpdir = s.tmp('k79-tmpdir-');
    const env: Record<string, string> = {
        STUB_JAVA_RULES: rule('java.rules', javaRows),
        STUB_KEYTOOL_RULES: rule('key.rules', keyRows),
        STUB_AAPT2_RULES: rule('aapt.rules', aaptRows),
        STUB_UNZIP_RULES: rule('unzip.rules', unzipRows),
        STUB_DEXDUMP_RULES: rule('dexdump.rules', dexdumpRows),
        STUB_JAVA_COPY_OUTPUT: s.posix(universal),
        WEAVER_KEYTOOL: s.posix(path.join(st.dir, 'keytool')),
        WEAVER_AAPT2: s.posix(path.join(st.dir, 'aapt2')),
        WEAVER_DEXDUMP: s.posix(path.join(st.dir, 'dexdump')),
        WEAVER_KEYSTORE_FILE: '/canary/secret-keystore-path.jks',
        TMPDIR: s.posix(tmpdir),
        ...(o.env || {}),
    };
    if (o.fail === 'abis') {
        env.STUB_UNZIP_RULES = rule('unzip2.rules', [['-Z1', 0, dexList], ['-l', 1, null], ['-p', 0, dexOut]]);
    }
    const args = ['extract', '--aab', s.posix(aab), ...(o.noJar ? [] : ['--bundletool-jar', s.posix(s.write(work, 'bundletool.jar', 'JAR'))]), '--signing', o.signing || 'signed', '--out', s.posix(outDir)];
    const r = s.aab(args, {stubDir: st.dir, env});
    return {r, outDir, tmpdir, st, work};
}
const SIX = ['manifest.xml', 'cert.txt', 'universal.apk', 'nsc.txt', 'dex-classes.txt', 'abis.txt'];

describe('extract（UT-212〜218・補助2件）', () => {
    it('UT-212 署名ありの extract: --out に6ファイル（＋resources.txt）が全て非空で存在・rc=0', () => {
        const {r, outDir} = extract();
        expect(r.rc).toBe(0);
        for (const n of [...SIX, 'resources.txt']) {
            const p = path.join(outDir, n);
            expect([n, fs.existsSync(p) && fs.statSync(p).size > 0]).toEqual([n, true]);
        }
    });

    it('UT-213 6つの取り出しのうち1つずつスタブが失敗（6通り）: 全て rc=1・失敗した項目名が出力に出る', () => {
        const map: Array<[string, string]> = [['manifest', 'manifest'], ['cert', 'cert'], ['universal', 'universal'], ['nsc', 'nsc'], ['dex', 'dex-classes'], ['abis', 'abis']];
        for (const [fail, label] of map) {
            const {r} = extract({fail});
            expect([fail, r.rc]).toEqual([fail, 1]);
            expect(s.all(r)).toContain(label);
        }
    });

    it('UT-214 スタブが成功扱いで0バイトを出力（取り出し6つのうち1つ）: 全て rc=1（空のファイルを成功にしない）', () => {
        for (const k of ['manifest', 'cert', 'nsc', 'dex']) {
            expect([k, extract({empty: k}).r.rc]).toEqual([k, 1]);
        }
    });

    it('UT-215 unsigned: keytool -printcert が rc=1 でも rc=0 で cert.txt に出力を保存。signed: 同じ失敗は rc=1', () => {
        const u = extract({signing: 'unsigned', keytoolRc: 1});
        expect(u.r.rc).toBe(0);
        expect(fs.existsSync(path.join(u.outDir, 'cert.txt'))).toBe(true);
        expect(fs.statSync(path.join(u.outDir, 'cert.txt')).size).toBeGreaterThan(0);
        expect(extract({signing: 'signed', keytoolRc: 1}).r.rc).toBe(1);
    });

    it('UT-216 使い捨て鍵: WEAVER_KEYSTORE_FILE のカナリアのパスが引数に0件。実行後 --out と一時領域に .jks・.keystore が0件（失敗終了でも）', () => {
        for (const o of [{}, {fail: 'dex'}]) {
            const {r, outDir, tmpdir, st} = extract(o);
            expect(r.rc).toBe(o.fail ? 1 : 0);
            expect(st.log()).not.toContain('secret-keystore-path');
            expect(s.all(r)).not.toContain('secret-keystore-path');
            const left: string[] = [];
            const walk = (d: string) => {
                if (!fs.existsSync(d)) {
                    return;
                }
                for (const e of fs.readdirSync(d, {withFileTypes: true})) {
                    const p = path.join(d, e.name);
                    if (e.isDirectory()) {
                        walk(p);
                    } else if (/\.(jks|keystore)$/.test(e.name)) {
                        left.push(p);
                    }
                }
            };
            walk(outDir);
            walk(tmpdir);
            expect(left).toEqual([]);
        }
    });

    it('UT-217 dex-classes.txt: dexdump 出力の Class descriptor が com.mattermost.rnbeta.MainActivity の行になる（L／;／スラッシュ0件・複数 dex の内容が両方）', () => {
        const {r, outDir} = extract();
        expect(r.rc).toBe(0);
        const t = fs.readFileSync(path.join(outDir, 'dex-classes.txt'), 'utf8').replace(/\r/g, '');
        expect(t.split('\n')).toContain('com.mattermost.rnbeta.MainActivity');
        const rows = t.split('\n').filter(Boolean);
        expect(rows.some((l: string) => /^L|\/|;/.test(l))).toBe(false);
        expect(rows.length).toBeGreaterThanOrEqual(4);
    });

    it('UT-218 abis.txt: lib/arm64-v8a・armeabi-v7a・x86_64 の3行（x86 単独の行は0件）', () => {
        const {outDir} = extract();
        const rows = fs.readFileSync(path.join(outDir, 'abis.txt'), 'utf8').replace(/\r/g, '').split('\n').filter(Boolean).sort();
        expect(rows).toEqual(['arm64-v8a', 'armeabi-v7a', 'x86_64']);
    });

    it('UT-補1（設計外の補助）extract の入力: --bundletool-jar が無い・読めない場合は rc=1（inspect だけが使う）。--aab が存在しない場合も rc=1', () => {
        expect(extract({noJar: true}).r.rc).toBe(1);
        const st = s.makeStubs(['java']);
        const out = s.tmp();
        const r = s.aab(['extract', '--aab', s.posix(path.join(out, 'none.aab')), '--bundletool-jar', s.posix(path.join(out, 'none.jar')), '--signing', 'signed', '--out', s.posix(out + '/o')], {stubDir: st.dir});
        expect(r.rc).toBe(1);
    });

    it('UT-補2（設計外の補助）extract はAABを展開して実行しない: スタブの引数に unzip -d／unzip（-p・-Z1・-l 以外）／chmod +x／bash・sh の実行が0件', () => {
        const {r, st} = extract();
        expect(r.rc).toBe(0);
        const log = st.log();
        expect(log).not.toMatch(/unzip\b[^\n]*\s-d\s/);
        for (const l of st.calls('unzip')) {
            expect(l).toMatch(/\s-(p|Z1|l)\b/);
        }
        expect(log).not.toMatch(/^(bash|sh|chmod)\b/m);
    });
});

// ---- verify-input / verify-hash（UT-350・351・365・366）----
function sha(buf: Buffer) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}
type Vi = {sha?: string; max?: number; link?: boolean; dir?: boolean; extra?: string[]};
function vi(aab: Buffer | null, o: Vi = {}) {
    const d = s.tmp('k79-vi-');
    const p = path.join(d, 'in.aab');
    if (o.dir) {
        fs.mkdirSync(p);
    } else if (o.link) {
        const real = s.write(d, 'real.aab', aab);
        if (!s.trySymlink(real, p)) {
            return null;
        }
    } else if (aab) {
        fs.writeFileSync(p, aab);
    }
    const shaFile = s.write(d, 'aab.sha256', (o.sha ?? (aab ? sha(aab) : '0'.repeat(64))) + '  in.aab\n');
    const st = s.makeStubs(['unzip', 'bundletool', 'aapt2']);
    const r = s.aab(['verify-input', '--aab', s.posix(p), '--sha256-file', s.posix(shaFile), '--max-bytes', String(o.max ?? 1048576), ...(o.extra || [])], {stubDir: st.dir});
    return {...r, st, size: aab ? aab.length : 0};
}
const SIGBLOCKS = ['META-INF/X.RSA', 'META-INF/X.SF', 'META-INF/X.DSA', 'META-INF/X.EC', 'META-INF/x.sf', 'META-INF/X.Rsa', 'META-INF/SIG-X', 'META-INF/SIG-A.sig'];

describe('verify-input（UT-350・351）', () => {
    const good = s.smallAab();

    it('UT-350 6項目を1つずつ破る: ①シンボリックリンク②ディレクトリ③sha256違い④サイズ+1⑤署名ブロック8通り⑥絶対パス⑦../⑧空ZIP は rc=1・FAIL: INPUT:。⑨--expect-sha256（廃止）は rc=2。unzip の展開（-d）0件', () => {
        const rows: Array<[string, any]> = [
            ['③sha', vi(good, {sha: 'f'.repeat(64)})],
            ['②dir', vi(null, {dir: true})],
            ['⑥abs', vi(s.smallAab({'/etc/x': 'x'}))],
            ['⑦..', vi(s.smallAab({'../x': 'x'}))],
            ['⑧empty', vi(s.zipBuf({}))],
        ];
        const lk = vi(good, {link: true});
        if (lk) {
            rows.push(['①symlink', lk]);
        }
        for (const n of SIGBLOCKS) {
            rows.push(['⑤' + n, vi(s.smallAab({[n]: 'x'}))]);
        }
        const r4 = vi(good, {max: good.length - 1});
        rows.push(['④size', r4]);
        for (const [n, r] of rows) {
            expect([n, r.rc]).toEqual([n, 1]);
            expect(r.out).toContain('FAIL: INPUT:');
            expect(r.st.log()).not.toMatch(/unzip[^\n]*\s-d\s/);
        }
        expect(vi(good, {extra: ['--expect-sha256', sha(good)]})!.rc).toBe(2);
    });

    it('UT-351 正常と境界・陽性対照: ①正常 rc=0 ②サイズが --max-bytes ちょうど rc=0 ③base/root/META-INF/MANIFEST.MF（ルート直下でない）rc=0 ④META-INF/MANIFEST.MF rc=0 ⑤META-INF/SIGNATURE-NOTES.txt rc=0 ⑥陽性対照（署名ブロックあり）は rc=1。PASSED 行', () => {
        const ok = vi(good)!;
        expect(ok.rc).toBe(0);
        expect(ok.out).toMatch(/PASSED/);
        expect(vi(good, {max: good.length})!.rc).toBe(0);
        expect(vi(s.smallAab({'base/root/META-INF/MANIFEST.MF': 'x'}))!.rc).toBe(0);
        expect(vi(s.smallAab({'META-INF/MANIFEST.MF': 'x'}))!.rc).toBe(0);
        expect(vi(s.smallAab({'META-INF/SIGNATURE-NOTES.txt': 'x'}))!.rc).toBe(0);
        expect(vi(s.smallAab({'META-INF/X.RSA': 'x'}))!.rc).toBe(1);
    });
});

describe('verify-hash（UT-365・366）', () => {
    function hv(aabBuf: Buffer | null, exp: string, o: {link?: boolean; dir?: boolean; missing?: boolean} = {}) {
        const d = s.tmp('k79-vh-');
        const p = path.join(d, 'in.aab');
        if (o.dir) {
            fs.mkdirSync(p);
        } else if (o.link) {
            s.write(d, 'real.aab', aabBuf);
            if (!s.trySymlink(path.join(d, 'real.aab'), p)) {
                return null;
            }
        } else if (!o.missing) {
            fs.writeFileSync(p, aabBuf);
        }
        const st = s.makeStubs(['unzip', 'bundletool', 'aapt2']);
        const envFiles = {GITHUB_ENV: s.posix(s.write(d, 'env', '')), GITHUB_OUTPUT: s.posix(s.write(d, 'out', ''))};
        const r = s.aab(['verify-hash', '--aab', s.posix(p), '--expect-sha256', exp], {stubDir: st.dir, env: envFiles});
        return {...r, st, envText: fs.readFileSync(path.join(d, 'env'), 'utf8') + fs.readFileSync(path.join(d, 'out'), 'utf8')};
    }
    const b = s.smallAab();

    it('UT-365 ①1バイト違い②別AABのsha③〜⑦形式違い（大文字・63桁・65桁・空・g混入）④⑧シンボリックリンク⑨ディレクトリ⑩存在しない: ①②⑧⑨⑩は rc=1（FAIL: HASH:）、③〜⑦は rc=2（FAIL 行0件・usage）。ZIP操作のスタブ呼び出し0件・環境ファイルへ書かない', () => {
        const flipped = Buffer.from(b);
        flipped[flipped.length - 1] ^= 1;
        const rc1: Array<[string, any]> = [
            ['①flip', hv(flipped, sha(b))],
            ['②other', hv(b, sha(Buffer.from('other')))],
            ['⑨dir', hv(null, sha(b), {dir: true})],
            ['⑩missing', hv(b, sha(b), {missing: true})],
        ];
        const lk = hv(b, sha(b), {link: true});
        if (lk) {
            rc1.push(['⑧symlink', lk]);
        }
        for (const [n, r] of rc1) {
            expect([n, r.rc]).toEqual([n, 1]);
            expect(r.out).toContain('FAIL: HASH:');
        }
        for (const v of [sha(b).toUpperCase(), sha(b).slice(1), sha(b) + 'a', '', 'g' + sha(b).slice(1)]) {
            const r = hv(b, v)!;
            expect([JSON.stringify(v), r.rc]).toEqual([JSON.stringify(v), 2]);
            expect(s.failLines(r)).toHaveLength(0);
            expect(s.all(r)).toMatch(/usage/i);
        }
        const any = hv(b, sha(b))!;
        expect(any.st.log()).toBe('');
        expect(any.envText).toBe('');
    });

    it('UT-366 ①正しいsha rc=0・PASSED ②1バイトのAABでも一致なら rc=0 ③陽性対照（1バイト変更）は rc=1 ④"<hex> <name>" を渡すと rc=2', () => {
        const r = hv(b, sha(b))!;
        expect(r.rc).toBe(0);
        expect(r.out).toMatch(/PASSED/);
        const one = Buffer.from('x');
        expect(hv(one, sha(one))!.rc).toBe(0);
        const flipped = Buffer.from(b);
        flipped[flipped.length - 1] ^= 1;
        expect(hv(flipped, sha(b))!.rc).toBe(1);
        expect(hv(b, sha(b) + '  in.aab')!.rc).toBe(2);
    });
});

// ---- facts ----
function factsRun(dirOpts: {versionCode?: number | string; versionName?: string; manifestXml?: string}, run: string | number, o: {out?: string} = {}) {
    const d = s.extractDir(dirOpts);
    const out = path.join(s.tmp('k79-facts-'), 'facts.txt');
    const r = s.aab(['facts', '--dir', s.posix(d), '--run', String(run), '--out', s.posix(o.out || out)]);
    return {r, out: o.out || out};
}
describe('facts（UT-371）', () => {
    it('UT-371（facts側）正常: version・versionCode・run の3行ちょうど・1KB以下・制御文字なし。違反（versionName に改行／33桁超／versionCode が11桁／run が abc／キー追加）は書かずに rc=1・ファイルが出来ない', () => {
        const ok = factsRun({versionCode: 1234, versionName: '2.45.0'}, 234);
        expect(ok.r.rc).toBe(0);
        const t = fs.readFileSync(ok.out, 'utf8');
        expect(t.replace(/\n$/, '').split('\n')).toEqual(['version=2.45.0', 'versionCode=1234', 'run=234']);
        expect(t.length).toBeLessThanOrEqual(1024);
        expect(/[\x00-\x09\x0b-\x1f\x7f]/.test(t)).toBe(false);
        const bads = [
            factsRun({versionName: '2.45.0\nX=1'}, 234),
            factsRun({versionName: '1.' + '0'.repeat(40)}, 234),
            factsRun({versionCode: '12345678901'}, 234),
            factsRun({}, 'abc'),
            factsRun({versionName: 'v2.45.0;rm'}, 234),
        ];
        for (const b of bads) {
            expect(b.r.rc).toBe(1);
            expect(fs.existsSync(b.out)).toBe(false);
        }
    });
});

// ---- summary ----
const FACT_OK = 'version=2.45.0\nversionCode=1234\nrun=234\n';
function summary(o: {facts?: string; signing?: 'signed' | 'unsigned'; kind?: string; run?: string; ev?: string; evc?: string; cert?: string | null; extra?: string[]} = {}) {
    const d = s.tmp('k79-sum-');
    const facts = s.write(d, 'facts.txt', o.facts ?? FACT_OK);
    const signing = o.signing || 'unsigned';
    const args = ['summary', '--facts', s.posix(facts), '--signing', signing, '--kind', o.kind || 'unsigned-verification-only', '--run', o.run || '234', '--expect-version', o.ev || '2.45.0', '--expect-version-code', o.evc || '1234', '--out', s.posix(path.join(d, 'summary.txt'))];
    if (signing === 'signed' && o.cert !== null) {
        args.push('--cert', s.posix(s.write(d, 'cert.txt', o.cert ?? s.certTxt({}))));
    }
    const r = s.aab([...args, ...(o.extra || [])]);
    return {r, outFile: path.join(d, 'summary.txt')};
}
describe('summary（UT-219〜222・FACTS）', () => {
    it('UT-219 署名なし: 出力が §4.6 の書式で行ごとに正確に一致・末尾に This AAB is not signed…。--out のファイルと標準出力が同一', () => {
        const {r, outFile} = summary();
        expect(r.rc).toBe(0);
        const want = [
            'ANDROID BUILD SUMMARY',
            'kind: unsigned-verification-only',
            'version: 2.45.0',
            'versionCode: 1234',
            'run: 234',
            'cert_sha256: UNSIGNED — verification only',
            'aab: weaver-android-2.45.0-1234-unsigned-verification-only.aab',
            'This AAB is not signed and cannot be uploaded to Google Play.',
        ];
        expect(r.out.replace(/\n+$/, '').split('\n')).toEqual(want);
        expect(fs.readFileSync(outFile, 'utf8').replace(/\r/g, '')).toBe(r.out);
        for (const l of want) {
            expect(l).toBe(l.trim());
        }
    });

    it('UT-220 署名あり・confirm: cert_sha256 は64桁の大文字16進（コロンなし）・署名なし用の末尾文言は出ない・versionCode と run は別の値で両方出る', () => {
        const {r} = summary({signing: 'signed', kind: 'confirm', facts: 'version=2.45.0\nversionCode=1234\nrun=234\n'});
        expect(r.rc).toBe(0);
        const m = /^cert_sha256: ([0-9A-F]{64})$/m.exec(r.out);
        expect(m).not.toBeNull();
        expect(r.out).not.toContain('cannot be uploaded');
        expect(r.out).toMatch(/^versionCode: 1234$/m);
        expect(r.out).toMatch(/^run: 234$/m);
    });

    it('UT-221 facts に versionCode 無し／署名ありで cert に SHA256: 無し／--kind が不正値: 3通りとも rc=1', () => {
        expect(summary({facts: 'version=2.45.0\nrun=234\n'}).r.rc).toBe(1);
        expect(summary({signing: 'signed', kind: 'confirm', cert: 'Owner: x\n'}).r.rc).toBe(1);
        expect(summary({kind: 'bogus'}).r.rc).toBe(1);
    });

    it('UT-222 versionCode は run から計算せず facts／期待値から取る: run=234・versionCode=1999 → versionCode: 1999・run: 234', () => {
        const {r} = summary({facts: 'version=2.45.0\nversionCode=1999\nrun=234\n', evc: '1999'});
        expect(r.rc).toBe(0);
        expect(r.out).toMatch(/^versionCode: 1999$/m);
        expect(r.out).toMatch(/^run: 234$/m);
    });

    it('UT-371（summary側。D-K79R0-64）summary は facts を信頼しない: 3行以外・許可外キー・重複キー・制御文字・1KB超・--run／--expect-version／--expect-version-code と不一致は全て rc=1・FAIL: FACTS:', () => {
        const cases: string[] = [
            'version=2.45.0\nversionCode=1234\n',
            'version=2.45.0\nversionCode=1234\nrun=234\nextra=1\n',
            'version=2.45.0\nversionCode=1234\nfoo=234\n',
            'version=2.45.0\nversion=2.45.0\nrun=234\n',
            'version=2.45.0\nversionCode=1234\nrun=234\u0007\n',
            'version=2.45.0\nversionCode=1234\nrun=' + '9'.repeat(2000) + '\n',
        ];
        for (const c of cases) {
            const {r} = summary({facts: c});
            expect([c.slice(0, 30), r.rc]).toEqual([c.slice(0, 30), 1]);
            expect(r.out).toContain('FAIL: FACTS:');
        }
        expect(summary({run: '999'}).r.rc).toBe(1);
        expect(summary({ev: '2.46.0'}).r.rc).toBe(1);
        expect(summary({evc: '9999'}).r.rc).toBe(1);
    });
});
