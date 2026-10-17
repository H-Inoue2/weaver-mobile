// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: weaver_android_16k_check.sh（UT-223〜239）。詳細設計 §5.7
// L1: WEAVER_OBJDUMP・WEAVER_ZIPALIGN のスタブ。L2（UT-237・238）: WSL の gcc と GNU objdump で実 .so を作って解析器に通す。
// L2 の道具が無い環境は「【未実施（環境）】」とし、合格に数えない。

export {};

const s = require('./android_test_support.cjs');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

jest.setTimeout(300000);
afterAll(() => s.cleanup());

const load = (n: number) => `    LOAD off    0x0000000000000000 vaddr 0x0000000000000000 paddr 0x0000000000000000 align 2**${n}\n         filesz 0x0000000000001000 memsz 0x0000000000001000 flags r-x\n`;
const objOut = (aligns: number[]) => `\nProgram Header:\n${aligns.map(load).join('')}   DYNAMIC off    0x0000000000001000 vaddr 0x0000000000001000 paddr 0x0000000000001000 align 2**3\n`;

type K = {files: Record<string, number[] | null>; objRc?: Record<string, number>; zipRc?: number; apk?: boolean; noObjdumpEnv?: boolean; pathStub?: boolean};
function k16(o: K) {
    const st = s.makeStubs(['llvm-objdump', 'zipalign']);
    const work = s.tmp('k79-16k-');
    const dir = path.join(work, 'x');
    const rules: string[] = [];
    for (const [rel, aligns] of Object.entries(o.files)) {
        s.write(dir, rel, 'ELF');
        const outf = s.write(work, 'o-' + rel.replace(/[\/ ]/g, '_') + '.txt', aligns === null ? 'garbage\n' : objOut(aligns));
        const rc = (o.objRc || {})[rel] ?? 0;
        rules.push(`${rel}|||${rc}|||${s.posix(outf)}`);
    }
    const rulesFile = s.posix(s.write(work, 'obj.rules', rules.join('\n') + '\n'));
    const env: Record<string, string> = {STUB_LLVM_OBJDUMP_RULES: rulesFile, STUB_ZIPALIGN_RC: String(o.zipRc ?? 0)};
    if (!o.noObjdumpEnv) {
        env.WEAVER_OBJDUMP = s.posix(path.join(st.dir, 'llvm-objdump'));
    }
    env.WEAVER_ZIPALIGN = s.posix(path.join(st.dir, 'zipalign'));
    let input = s.posix(dir);
    if (o.apk) {
        const apk = path.join(work, 'in.apk');
        const entries: Record<string, string> = {};
        for (const rel of Object.keys(o.files)) {
            entries[rel] = 'ELF';
        }
        fs.writeFileSync(apk, s.zipBuf(entries));
        input = s.posix(apk);
    }
    const r = s.k16([input], {stubDir: st.dir, env});
    return {r, st, input};
}
const A64 = 'lib/arm64-v8a/liba.so';
const X64 = 'lib/x86_64/libb.so';
const V7 = 'lib/armeabi-v7a/libc.so';

describe('16KB 整列の検査（L1・スタブ）', () => {
    it('UT-223 64bit の .so 2つが全 LOAD で 2**14: rc=0・OK 行2件・末尾 P16 CHECKED: 2 shared object(s), violations: 0', () => {
        const {r} = k16({files: {[A64]: [14, 14], [X64]: [14]}});
        expect(r.rc).toBe(0);
        expect(r.out).toContain(`OK 2**14 ${A64}`);
        expect(r.out).toContain(`OK 2**14 ${X64}`);
        expect(r.out).toContain('P16 CHECKED: 2 shared object(s), violations: 0');
    });

    it('UT-224 1つの .so が 2**12: rc=1・FAIL 2**12 <パス>・violations: 1', () => {
        const {r} = k16({files: {[A64]: [14], [X64]: [12]}});
        expect(r.rc).toBe(1);
        expect(r.out).toContain(`FAIL 2**12 ${X64}`);
        expect(r.out).toContain('violations: 1');
    });

    it('UT-225 1つの .so に LOAD が2つ（2**14 と 2**12）: rc=1（全 LOAD が対象）', () => {
        expect(k16({files: {[A64]: [14, 12], [X64]: [14]}}).r.rc).toBe(1);
    });

    it('UT-226 align が 2**13／14／15／16: 2**13 のみ違反・他は OK（N≥14）', () => {
        for (const [n, rc] of [[13, 1], [14, 0], [15, 0], [16, 0]]) {
            expect([n, k16({files: {[A64]: [n], [X64]: [14]}}).r.rc]).toEqual([n, rc]);
        }
    });

    it('UT-227 armeabi-v7a だけ 2**12（64bit は 2**14）: rc=0・チェック数は2（32bit は数えない）', () => {
        const {r} = k16({files: {[A64]: [14], [X64]: [14], [V7]: [12]}});
        expect(r.rc).toBe(0);
        expect(r.out).toContain('P16 CHECKED: 2 shared object(s)');
        expect(r.out).not.toContain(V7);
    });

    it('UT-228 x86_64 だけ／arm64-v8a だけ 2**12: 2通りとも rc=1（64bit は両方が対象）', () => {
        expect(k16({files: {[A64]: [14], [X64]: [12]}}).r.rc).toBe(1);
        expect(k16({files: {[A64]: [12], [X64]: [14]}}).r.rc).toBe(1);
    });

    it('UT-229 64bit の .so が0件（armeabi-v7a のみ）／lib/ が無い: 2通りとも rc=1（空振り防止）', () => {
        expect(k16({files: {[V7]: [14]}}).r.rc).toBe(1);
        expect(k16({files: {'other/x.txt': [14]}}).r.rc).toBe(1);
    });

    it('UT-230 objdump の出力に LOAD 行が0件／objdump が rc≠0: 2通りとも rc=1（解析不能は違反）', () => {
        expect(k16({files: {[A64]: null, [X64]: [14]}}).r.rc).toBe(1);
        expect(k16({files: {[A64]: [14], [X64]: [14]}, objRc: {[X64]: 1}}).r.rc).toBe(1);
    });

    it('UT-231 入力が APK: zipalign が -c -P 16 -v 4 <apk> で呼ばれる。ELF が OK でも zipalign が rc=1 なら rc=1', () => {
        const ok = k16({files: {[A64]: [14], [X64]: [14]}, apk: true});
        expect(ok.r.rc).toBe(0);
        const calls = ok.st.calls('zipalign');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('-c -P 16 -v 4 ' + ok.input);
        expect(k16({files: {[A64]: [14], [X64]: [14]}, apk: true, zipRc: 1}).r.rc).toBe(1);
    });

    it('UT-239 zipalign 済み APK（Stored の .so・ローカルヘッダの extra が 0 埋めの整列パディング）でも lib/ の .so を全件読み、先頭から順読みで落ちない（K-79/R0 run 39027175202）', () => {
        const crcTable = Array.from({length: 256}, (_v, n) => {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            return c >>> 0;
        });
        const crc32 = (buf: Buffer) => {
            let c = 0xffffffff;
            for (const x of buf) {
                c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
            }
            return (c ^ 0xffffffff) >>> 0;
        };
        const entries: Array<[string, Buffer]> = [['AndroidManifest.xml', Buffer.from('m')], [A64, Buffer.from('ELF')], [X64, Buffer.from('ELF')]];
        const locals: Buffer[] = [];
        const centrals: Buffer[] = [];
        let off = 0;
        for (const [name, data] of entries) {
            const nameB = Buffer.from(name);
            const pad = (4096 - ((off + 30 + nameB.length) % 4096)) % 4096; // データ先頭を 4096 境界へ（zipalign と同じ 0 埋め）
            const lh = Buffer.alloc(30);
            lh.writeUInt32LE(0x04034b50, 0);
            lh.writeUInt16LE(10, 4);
            lh.writeUInt32LE(crc32(data), 14);
            lh.writeUInt32LE(data.length, 18);
            lh.writeUInt32LE(data.length, 22);
            lh.writeUInt16LE(nameB.length, 26);
            lh.writeUInt16LE(pad, 28);
            const local = Buffer.concat([lh, nameB, Buffer.alloc(pad), data]);
            const ch = Buffer.alloc(46);
            ch.writeUInt32LE(0x02014b50, 0);
            ch.writeUInt16LE(10, 4);
            ch.writeUInt16LE(10, 6);
            ch.writeUInt32LE(crc32(data), 16);
            ch.writeUInt32LE(data.length, 20);
            ch.writeUInt32LE(data.length, 24);
            ch.writeUInt16LE(nameB.length, 28);
            ch.writeUInt16LE(pad, 30);
            ch.writeUInt32LE(off, 42);
            centrals.push(Buffer.concat([ch, nameB, Buffer.alloc(pad)]));
            locals.push(local);
            off += local.length;
        }
        const cd = Buffer.concat(centrals);
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(0x06054b50, 0);
        eocd.writeUInt16LE(entries.length, 8);
        eocd.writeUInt16LE(entries.length, 10);
        eocd.writeUInt32LE(cd.length, 12);
        eocd.writeUInt32LE(off, 16);
        const apkBuf = Buffer.concat([...locals, cd, eocd]);

        const st = s.makeStubs(['llvm-objdump', 'zipalign']);
        const work = s.tmp('k79-16k-pad-');
        const rules = [A64, X64].map((rel) => `${rel}|||0|||${s.posix(s.write(work, 'o-' + rel.replace(/[\/ ]/g, '_') + '.txt', objOut([14])))}`);
        const rulesFile = s.posix(s.write(work, 'obj.rules', rules.join('\n') + '\n'));
        const apk = path.join(work, 'padded.apk');
        fs.writeFileSync(apk, apkBuf);
        const env = {STUB_LLVM_OBJDUMP_RULES: rulesFile, STUB_ZIPALIGN_RC: '0', WEAVER_OBJDUMP: s.posix(path.join(st.dir, 'llvm-objdump')), WEAVER_ZIPALIGN: s.posix(path.join(st.dir, 'zipalign'))};
        const r = s.k16([s.posix(apk)], {stubDir: st.dir, env});
        expect(r.out).toContain(`OK 2**14 ${A64}`);
        expect(r.out).toContain(`OK 2**14 ${X64}`);
        expect(r.out).toContain('P16 CHECKED: 2 shared object(s), violations: 0');
        expect(r.rc).toBe(0);
    });

    it('UT-232 入力が展開済みディレクトリ: zipalign の呼び出し0回', () => {
        const {r, st} = k16({files: {[A64]: [14], [X64]: [14]}});
        expect(r.rc).toBe(0);
        expect(st.calls('zipalign')).toHaveLength(0);
    });

    it('UT-233 ZIP 整列は OK（zipalign rc=0）だが ELF の LOAD が 2**12: rc=1（ZIP 整列だけで合格にしない）', () => {
        expect(k16({files: {[A64]: [12], [X64]: [14]}, apk: true, zipRc: 0}).r.rc).toBe(1);
    });

    it('UT-234 スクリプト本文: PAGE_ALIGNMENT_16K・bundletool dump config を判定に使う箇所が0件（コメント内のみ可）', () => {
        const body = s.read(s.SCRIPTS.k16);
        const code = body.split('\n').filter((l: string) => !/^\s*#/.test(l)).join('\n');
        expect(code).not.toContain('PAGE_ALIGNMENT_16K');
        expect(code).not.toMatch(/dump config/);
    });

    it('UT-235 WEAVER_OBJDUMP 未設定: PATH 上の llvm-objdump スタブが呼ばれ rc=0。どちらも無ければ rc=1', () => {
        const st = s.makeStubs(['llvm-objdump']);
        const work = s.tmp();
        const dir = path.join(work, 'x');
        s.write(dir, A64, 'ELF');
        s.write(dir, X64, 'ELF');
        const out = s.write(work, 'o.txt', objOut([14]));
        const rules = s.write(work, 'r.rules', `.so|||0|||${s.posix(out)}\n`);
        const r1 = s.k16([s.posix(dir)], {stubDir: st.dir, env: {STUB_LLVM_OBJDUMP_RULES: s.posix(rules)}, unsetEnv: ['WEAVER_OBJDUMP']});
        expect(r1.rc).toBe(0);
        expect(st.calls('llvm-objdump').length).toBeGreaterThanOrEqual(2);
        const r2 = s.k16([s.posix(dir)], {unsetEnv: ['WEAVER_OBJDUMP'], env: {PATH: '/usr/bin:/bin'}});
        expect(r2.rc).toBe(1);
    });

    it('UT-236 パスに空白を含む .so（lib/arm64-v8a/lib my.so）: 正しく処理され OK 行にそのパスが出る', () => {
        const name = 'lib/arm64-v8a/lib my.so';
        const {r} = k16({files: {[name]: [14], [X64]: [14]}});
        expect(r.rc).toBe(0);
        expect(r.out).toContain(`OK 2**14 ${name}`);
    });
});

// ---- L2: 実 objdump（WSL の gcc／binutils）----
const WSL = (cmd: string) => cp.spawnSync('wsl', ['-d', 'Ubuntu', '--', 'bash', '-c', cmd], {encoding: 'utf8', env: {...process.env, MSYS_NO_PATHCONV: '1'}, timeout: 120000});
const wslOk = (() => {
    try {
        const r = WSL('command -v gcc && command -v objdump');
        return r.status === 0 && (r.stdout || '').includes('objdump');
    } catch (e) {
        return false;
    }
})();
const itL2 = wslOk ? it : it.skip;

function l2(pageSize: string) {
    const d = s.tmp('k79-elf-');
    const w = d.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_m: string, x: string) => '/mnt/' + x.toLowerCase());
    const cmd = `set -e; cd '${w}'; mkdir -p x/lib/arm64-v8a x/lib/x86_64; echo 'int f(void){return 1;}' > a.c; gcc -shared -fPIC -Wl,-z,max-page-size=${pageSize} -o x/lib/arm64-v8a/liba.so a.c; cp x/lib/arm64-v8a/liba.so x/lib/x86_64/libb.so`;
    const b = WSL(cmd);
    if (b.status !== 0) {
        throw new Error('WSL でのビルドに失敗: ' + (b.stderr || ''));
    }
    const script = s.posix(s.abs(s.SCRIPTS.k16)).replace(/^([A-Za-z]):/, (_m: string, x: string) => '/mnt/' + x.toLowerCase());
    return WSL(`cd '${w}'; WEAVER_OBJDUMP=$(command -v objdump) bash '${script}' x`);
}

describe('16KB 整列の検査（L2・実 objdump。WSL）', () => {
    if (!wslOk) {
        // eslint-disable-next-line no-console
        console.warn(s.ENV_MISSING + ' UT-237・UT-238: WSL の gcc／objdump が使えない');
    }
    itL2('UT-237 max-page-size=0x4000 で作った .so: 実 objdump -p の LOAD 行を解析し 2**14 と判定（rc=0）', () => {
        const r = l2('0x4000');
        expect(r.stdout || '').toContain('OK 2**14');
        expect(r.status).toBe(0);
    });

    itL2('UT-238 max-page-size=0x1000 で作った .so: 2**12 と判定し rc=1', () => {
        const r = l2('0x1000');
        expect(r.stdout || '').toContain('FAIL 2**12');
        expect(r.status).toBe(1);
    });
});
