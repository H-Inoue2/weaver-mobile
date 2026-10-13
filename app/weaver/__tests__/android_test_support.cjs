// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 Android版テスト共通部品（工程8①）。
// 拡張子を .cjs にしているのは、jest が __tests__ 内の .ts/.tsx/.js をテストとして拾うため（部品はテストではない）。
// ここには秘密の値を書かない・読まない。パスワード等はカナリア文字列（CANARY_*）だけを使う。

const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
// Windows では PATH を最小化した試験（UT-018・235）でも bash を見つけられるよう、Git の bash.exe を絶対パスで解決する（D-S2-13）
// WEAVER_TEST_BASH は MSYS 形式（/c/Program Files/…）でも Windows 形式でもよい。Git の bin/bash.exe（ランチャー）は PATH の先頭に mingw64 等を足して
// スタブ（PATH 先頭に置く mv・git・unzip ほか）より本物を先に見つけてしまうため、同じ Git の usr/bin/bash.exe に読み替える（原因調査 2026-10-14）。
const normalizeBash = (p) => {
    if (!p || process.platform !== 'win32') {
        return p;
    }
    let w = p.replace(/^\/([a-zA-Z])\//, '$1:/').split('\\').join('/');
    const m = /^(.*\/Git)\/(bin|usr\/bin)\/bash(\.exe)?$/i.exec(w);
    if (m && fs.existsSync(m[1] + '/usr/bin/bash.exe')) {
        w = m[1] + '/usr/bin/bash.exe';
    }
    return w;
};
const BASH = normalizeBash(process.env.WEAVER_TEST_BASH) || (() => {
    // PATH を最小化した試験（UT-018・235）でも bash を見つけられるよう、今の PATH から bash の絶対パスを解決しておく（D-S2-13）
    if (process.platform !== 'win32') {
        return 'bash';
    }
    for (const d of (process.env.PATH || '').split(';')) {
        const p = d.replace(/\+$/, '') + '/bash.exe';
        if (d && fs.existsSync(p)) {
            return p;
        }
    }
    return 'bash';
})();
const posix = (p) => p.replace(/\\/g, '/');
const abs = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8').replace(/\r/g, '');
const readBuf = (rel) => fs.readFileSync(abs(rel));

// 基点コミット（S1前）・上流コミット（詳細設計 §3.1。40桁固定）
const BASE_SHA = '01fbf86bb8ed42e66ecf1e0f33485ebd4b9c37af';
const UPSTREAM_SHA = '0c0d6c48ecd1432a80ecdbe69aafa394af49d03c';

const SCRIPTS = {
    guard: '.github/scripts/weaver_android_guard.sh',
    inject: '.github/scripts/weaver_android_inject_version.sh',
    aab: '.github/scripts/weaver_android_aab.sh',
    k16: '.github/scripts/weaver_android_16k_check.sh',
    shared: '.github/scripts/weaver_release_guard.sh',
};
const WORKFLOW = '.github/workflows/weaver-android-aab.yml';
const SMOKE = '.github/workflows/weaver-android-smoke-trial.yml';
const COMPOSITE = '.github/actions/weaver-prepare-js/action.yml';
const ALLOWLIST_REL = '.github/android_permissions_allowlist.txt';
const BASELINE_REL = '.github/android_baseline.json';
const HASHES_REL = '.github/android_upstream_asset_hashes.txt';
const STAGE_REL = '.github/android_stage.txt';

// ---- 一時ディレクトリ ----
const tmpDirs = [];
function tmp(prefix = 'k79-') {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
}
function cleanup() {
    while (tmpDirs.length) {
        const d = tmpDirs.pop();
        try {
            fs.rmSync(d, {recursive: true, force: true});
        } catch (e) {
            // 後始末の失敗はテストの結果に影響させない
        }
    }
}
function write(root, rel, content, enc) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), {recursive: true});
    fs.writeFileSync(p, content, enc);
    return p;
}
function readAt(root, rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}
function trySymlink(target, linkPath) {
    try {
        fs.symlinkSync(target, linkPath);
        return true;
    } catch (e) {
        return false;
    }
}

// ---- スクリプトの実行 ----
function run(scriptRel, args = [], opts = {}) {
    const script = posix(abs(scriptRel));
    const env = {...process.env, ...(opts.env || {})};
    if (opts.stubDir) {
        env.PATH = posix(opts.stubDir) + path.delimiter + env.PATH;
        env.STUB_LOG = posix(path.join(opts.stubDir, 'stub.log'));
    }
    for (const k of opts.unsetEnv || []) {
        delete env[k];
    }
    const r = spawnSync(BASH, [script, ...args.map(String)], {
        encoding: 'utf8',
        cwd: opts.cwd || ROOT,
        env,
        input: opts.input,
        timeout: opts.timeout || 120000,
    });
    return {rc: r.status, out: (r.stdout || '').replace(/\r/g, ''), err: (r.stderr || '').replace(/\r/g, ''), signal: r.signal};
}
const guard = (args, opts) => run(SCRIPTS.guard, args, opts);
const aab = (args, opts) => run(SCRIPTS.aab, args, opts);
const inject = (args, opts) => run(SCRIPTS.inject, args, opts);
const k16 = (args, opts) => run(SCRIPTS.k16, args, opts);
const shared = (args, opts) => run(SCRIPTS.shared, args, opts);
const scriptExists = (rel) => fs.existsSync(abs(rel));

// 出力の検査部品
const failLines = (r, label) => r.out.split('\n').filter((l) => l.startsWith('FAIL: ' + (label ? label + ':' : '')));
const warnLines = (r, label) => r.out.split('\n').filter((l) => l.startsWith('WARN: ' + (label ? label + ':' : '')));
const noteLines = (r, label) => r.out.split('\n').filter((l) => l.startsWith('NOTE: ' + (label ? label + ':' : '')));
const failedLabels = (r) => [...new Set(failLines(r).map((l) => (/^FAIL: ([A-Za-z0-9]+):/).exec(l)).filter(Boolean).map((m) => m[1]))].sort();
const all = (r) => r.out + '\n' + r.err;

// ---- スタブ（PATH先頭に置く記録型。引数を stub.log へ追記し、STUB_<NAME>_RC / _OUT で挙動を指定）----
function makeStubs(names) {
    const dir = tmp('k79-stub-');
    const body = [
        '#!/usr/bin/env bash',
        'name=$(basename "$0")',
        'name=${name%.sh}',
        'printf \'%s %s\\n\' "$name" "$*" >> "$STUB_LOG"',
        'up=$(printf \'%s\' "$name" | tr \'a-z-\' \'A-Z_\')',
        'rcv="STUB_${up}_RC"; outv="STUB_${up}_OUT"; fileout="STUB_${up}_OUTFILE"; rulesv="STUB_${up}_RULES"; copyv="STUB_${up}_COPY_OUTPUT"',
        '# ルール（1行＝「引数に含まれる文字列|||終了コード|||出力に使うファイル」。最初に当たった行を使う）',
        'if [ -n "${!rulesv:-}" ] && [ -f "${!rulesv}" ]; then',
        '  while IFS= read -r line; do',
        '    pat="${line%%|||*}"; rest="${line#*|||}"; rrc="${rest%%|||*}"; rof="${rest#*|||}"',
        '    case "$*" in *"$pat"*) if [ -n "$rof" ] && [ -f "$rof" ]; then cat "$rof"; fi; exit "${rrc:-0}";; esac',
        '  done < "${!rulesv}"',
        'fi',
        '# --output=PATH／--output PATH の指定があれば、STUB_<NAME>_COPY_OUTPUT のファイルをそこへ複製する（build-apks の模擬）',
        'if [ -n "${!copyv:-}" ] && [ -f "${!copyv}" ]; then',
        '  prev=""; for a in "$@"; do',
        '    case "$a" in --output=*) cp "${!copyv}" "${a#--output=}";; esac',
        '    if [ "$prev" = "--output" ]; then cp "${!copyv}" "$a"; fi',
        '    prev="$a"',
        '  done',
        'fi',
        'if [ -n "${!fileout:-}" ] && [ -f "${!fileout}" ]; then cat "${!fileout}"; fi',
        'if [ -n "${!outv:-}" ]; then printf \'%s\\n\' "${!outv}"; fi',
        'exit "${!rcv:-0}"',
        '',
    ].join('\n');
    for (const n of names) {
        write(dir, n, body);
    }
    write(dir, 'stub.log', '');
    return {
        dir,
        log: () => fs.readFileSync(path.join(dir, 'stub.log'), 'utf8').replace(/\r/g, ''),
        calls: (name) => fs.readFileSync(path.join(dir, 'stub.log'), 'utf8').replace(/\r/g, '').split('\n').filter((l) => l.startsWith(name + ' ') || l === name),
        clear: () => fs.writeFileSync(path.join(dir, 'stub.log'), ''),
    };
}

// ---- ディレクトリ全体のハッシュ（相対パス＋内容。読み取り専用の確認）----
function hashTree(dir) {
    const crypto = require('crypto');
    const h = crypto.createHash('sha256');
    const walkDir = (d, rel) => {
        for (const e of fs.readdirSync(d, {withFileTypes: true}).sort((a, b) => (a.name < b.name ? -1 : 1))) {
            const p = path.join(d, e.name);
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) {
                walkDir(p, r);
            } else if (e.isFile()) {
                h.update(r + '\0');
                h.update(fs.readFileSync(p));
            }
        }
    };
    walkDir(dir, '');
    return h.digest('hex');
}
function sha256File(p) {
    return require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
function sha256Buf(b) {
    return require('crypto').createHash('sha256').update(b).digest('hex');
}

// ---- git ----
function git(args, opts = {}) {
    const r = spawnSync('git', args, {encoding: 'buffer', cwd: opts.cwd || ROOT, input: opts.input});
    return {rc: r.status, out: r.stdout || Buffer.alloc(0), err: (r.stderr || Buffer.alloc(0)).toString()};
}
function gitShow(sha, rel) {
    const r = git(['show', `${sha}:${rel}`]);
    if (r.rc !== 0) {
        throw new Error(`git show ${sha.slice(0, 10)}:${rel} が失敗（CIではV1bのfetchが要る）: ${r.err}`);
    }
    return r.out;
}
function gitShowText(sha, rel) {
    return gitShow(sha, rel).toString('utf8').replace(/\r/g, '');
}
// 基点のツリーの一部を一時ディレクトリへ展開（git archive | tar）
function baseTree(paths, sha = BASE_SHA) {
    const dir = tmp('k79-base-');
    const a = spawnSync('git', ['archive', '--format=tar', sha, ...paths], {cwd: ROOT, maxBuffer: 512 * 1024 * 1024});
    if (a.status !== 0) {
        throw new Error('git archive が失敗: ' + (a.stderr || '').toString());
    }
    const t = spawnSync('tar', ['-x', '-C', posix(dir)], {input: a.stdout, maxBuffer: 512 * 1024 * 1024});
    if (t.status !== 0) {
        throw new Error('tar 展開が失敗: ' + (t.stderr || '').toString());
    }
    return dir;
}

// ---- 段階値（詳細設計 §1.4。`.github/android_stage.txt`。無ければ失敗）----
function stage() {
    if (!exists(STAGE_REL)) {
        throw new Error('段階値ファイル ' + STAGE_REL + ' が無い（S1で作る）');
    }
    const v = read(STAGE_REL).trim();
    if (!(/^S[1-4]$/).test(v)) {
        throw new Error('段階値が S1〜S4 でない: ' + JSON.stringify(v));
    }
    return v;
}

// ---- XML の部品 ----
const A18 = [
    ['INTERNET'], ['ACCESS_NETWORK_STATE'], ['CAMERA'], ['POST_NOTIFICATIONS'], ['VIBRATE'], ['RECEIVE_BOOT_COMPLETED'],
    ['FOREGROUND_SERVICE'], ['FOREGROUND_SERVICE_DATA_SYNC'], ['WRITE_EXTERNAL_STORAGE', 32], ['READ_EXTERNAL_STORAGE', 32],
    ['ACCESS_FINE_LOCATION'], ['ACCESS_WIFI_STATE'], ['RECORD_AUDIO'], ['MODIFY_AUDIO_SETTINGS'],
    ['BLUETOOTH', 30], ['BLUETOOTH_ADMIN', 30], ['BLUETOOTH_CONNECT'], ['READ_MEDIA_AUDIO'],
];
const permName = (n) => (n.includes('.') ? n : 'android.permission.' + n);
function permLine(p) {
    const [n, max] = Array.isArray(p) ? p : [p];
    return `    <uses-permission android:name="${permName(n)}"${max ? ` android:maxSdkVersion="${max}"` : ''} />`;
}
function manifestXml(o = {}) {
    const perms = o.perms || A18;
    const app = {
        name: '.MainApplication', resizeable: 'false', cleartext: 'false', analytics: true,
        activities: ['.MainActivity'], services: ['.NotificationDismissService'], receivers: ['.NotificationReplyBroadcastReceiver'],
        ...(o.app || {}),
    };
    const attr = (k, v) => (v === null || v === undefined ? '' : ` ${k}="${v}"`);
    const lines = [
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"' + (o.pkg ? ` package="${o.pkg}"` : '') + '>',
        ...perms.map(permLine),
        ...(o.removedPerms || []).map((n) => `    <uses-permission android:name="${permName(n)}" tools:node="remove" />`),
        ...(o.rawTop || []),
        o.supportsScreens ? '    <supports-screens android:largeScreens="true" />' : '',
        `    <application android:name="${app.name}"${attr('android:resizeableActivity', app.resizeable)}${attr('android:usesCleartextTraffic', app.cleartext)} android:label="@string/app_name"` +
        '\n        android:allowBackup="false">',
        ...(app.analytics === true ? ['        <meta-data android:name="firebase_analytics_collection_deactivated" android:value="true" />'] : []),
        ...(app.analytics === 'false' ? ['        <meta-data android:name="firebase_analytics_collection_deactivated" android:value="false" />'] : []),
        ...app.activities.map((n) => `        <activity android:name="${n}" android:exported="true" />`),
        ...app.services.map((n) => `        <service android:name="${n}" android:exported="false"${o.serviceType ? ` android:foregroundServiceType="${o.serviceType}"` : ''} />`),
        ...app.receivers.map((n) => `        <receiver android:name="${n}" android:exported="false" />`),
        ...(o.rawApp || []),
        '    </application>',
        '</manifest>',
    ];
    return lines.filter((l) => l !== '').join('\n') + '\n';
}
function nscXml(o = {}) {
    const ct = o.cleartext === undefined ? 'false' : o.cleartext;
    const user = o.userCa === undefined ? '<certificates src="user" />' : o.userCa;
    return [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<network-security-config>',
        `    <base-config cleartextTrafficPermitted="${ct}">`,
        '        <trust-anchors>',
        '            <certificates src="system" />',
        ...(user ? ['            ' + user] : []),
        '        </trust-anchors>',
        '    </base-config>',
        '</network-security-config>',
        '',
    ].join('\n');
}
function allowlistTxt(o = {}) {
    const a = o.a || A18.map(([n, m]) => `A ${permName(n)}${m ? ` maxSdk=${m}` : ''}`);
    const b = o.b || ['B android.permission.WAKE_LOCK', 'B {APPLICATION_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'];
    const c = o.c || ['C android.permission.FOREGROUND_SERVICE_MICROPHONE', 'C android.permission.FOREGROUND_SERVICE_SPECIAL_USE'];
    return ['# test allowlist', ...a, ...b, ...c].join(o.eol || '\n') + (o.eol || '\n');
}
function buildGradle(o = {}) {
    const ns = o.namespace === undefined ? 'com.mattermost.rnbeta' : o.namespace;
    const lines = [
        'apply plugin: "com.android.application"',
        'android {',
        ...(ns === null ? [] : [`    namespace "${ns}"`]),
        ...(o.nsExtra || []),
        '    defaultConfig {',
        `        applicationId ${o.appIdRaw || `"${o.applicationId || 'com.metarchitect.Weaver'}"`}`,
        ...(o.versionCodeLines || [`        versionCode ${o.versionCode === undefined ? 1001 : o.versionCode}`]),
        ...(o.versionNameLines || [`        versionName "${o.versionName || '2.45.0'}"`]),
        '    }',
        '}',
        ...(o.tail || []),
    ];
    return lines.join(o.eol || '\n') + (o.eol || '\n');
}
function googleServices(o = {}) {
    const j = {
        project_info: {project_number: o.projectNumber || '000000000000', project_id: o.projectId || 'DUMMY-weaver-unsigned-verification', storage_bucket: o.bucket || 'x.appspot.com'},
        client: o.clients || [{
            client_info: {mobilesdk_app_id: o.appId || '1:000000000000:android:DUMMY0000000000000000', android_client_info: {package_name: 'com.metarchitect.Weaver'}},
            oauth_client: [{client_id: o.clientId || 'DUMMY-client-id', client_type: 3}],
            api_key: [{current_key: o.key || 'DUMMY-NOT-A-REAL-API-KEY'}],
        }],
        configuration_version: '1',
    };
    return JSON.stringify(j, null, 2) + '\n';
}
const REAL = {projectId: 'weaver-test-proj', projectNumber: '123456789012', appId: '1:123456789012:android:abcdef0123456789', clientId: '123-abc.apps.googleusercontent.com', key: 'AIzaTESTKEY000000000000000000000000000', bucket: 'weaver-test-proj.appspot.com'};
const KOTLIN_FILES = ['MainApplication.kt', 'MainActivity.kt', 'CustomPushNotification.kt', 'ReceiptDelivery.java', 'NotificationDismissService.java', 'NotificationReplyBroadcastReceiver.java'];

// 総合フィクスチャ木（全AGが緑になる最小のリポジトリ木。各テストはこれを複製して1か所だけ壊す）
function goodTree(o = {}) {
    const root = tmp('k79-tree-');
    const fx = o.files || {};
    const written = new Set();
    const put = (rel, content) => {
        written.add(rel);
        return write(root, rel, Object.prototype.hasOwnProperty.call(fx, rel) ? fx[rel] : content);
    };
    put('android/app/build.gradle', buildGradle(o.gradle || {}));
    for (const f of KOTLIN_FILES) {
        const ext = f.endsWith('.java') ? ';' : '';
        put('android/app/src/main/java/com/mattermost/rnbeta/' + f, `// Copyright\n\npackage com.mattermost.rnbeta${ext}\n\nclass X\n`);
    }
    put('android/app/src/androidTest/java/com/mattermost/rnbeta/DetoxTest.java', 'package com.mattermost.rnbeta;\n\nclass DetoxTest {}\n');
    put('android/app/src/main/java/com/mattermost/helpers/Helper.kt', 'package com.mattermost.helpers\n\nclass Helper\n');
    put('android/app/src/main/AndroidManifest.xml', manifestXml(o.manifest || {}));
    put('android/app/src/main/res/xml/network_security_config.xml', nscXml(o.nsc || {}));
    put('android/app/src/main/res/values/strings.xml', `<resources>\n    <string name="app_name">${o.appName || 'Weaver'}</string>\n</resources>\n`);
    put('android/app/src/main/assets/sentry.options.json', JSON.stringify({dsn: '', ...(o.sentry || {})}) + '\n');
    put('assets/base/config.json', JSON.stringify({SentryEnabled: false, SentryDsnAndroid: '', RudderApiKey: '', ...(o.config || {})}) + '\n');
    put('android/app/google-services.json', googleServices(o.gs || {}));
    put('app/weaver/constants.ts', "export const APP_NAME = 'Weaver';\n");
    put(ALLOWLIST_REL, allowlistTxt(o.allow || {}));
    put(HASHES_REL, o.hashes || '');
    put(BASELINE_REL, JSON.stringify({tsc_errors: 45, jest_passed: 297, jest_pending: 1}) + '\n');
    // 固定の一覧に無いファイル（テストが足すクラス・画像など）も書く（D-S2-06）
    for (const [rel, content] of Object.entries(fx)) {
        if (!written.has(rel)) {
            write(root, rel, content);
        }
    }
    return root;
}

// post 用の取り出しフィクスチャ（aab.sh extract の出力。詳細設計 §5.6）
const CLASSES4 = [
    'com.mattermost.rnbeta.MainApplication', 'com.mattermost.rnbeta.MainActivity',
    'com.mattermost.rnbeta.NotificationDismissService', 'com.mattermost.rnbeta.NotificationReplyBroadcastReceiver',
];
const SHA_OK = '3A:1B:5C:7D:9E:0F:12:34:56:78:9A:BC:DE:F0:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:AB:CD';
const SHA_OK_PLAIN = SHA_OK.replace(/:/g, '');
function certTxt(o = {}) {
    if (o.unsigned) {
        return 'jar is unsigned.\n';
    }
    return [`Owner: ${o.owner || 'CN=Weaver Upload, O=MET Architect'}`, 'Issuer: CN=Weaver Upload', 'Certificate fingerprints:', `\t SHA1: AA:BB`, `\t SHA256: ${o.sha || SHA_OK}`, ''].join('\n');
}
function extractDir(o = {}) {
    const d = tmp('k79-extract-');
    const man = o.manifestXml || [
        `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${o.pkg || 'com.metarchitect.Weaver'}" android:versionCode="${o.versionCode === undefined ? 1001 : o.versionCode}" android:versionName="${o.versionName || '2.45.0'}">`,
        `    <uses-sdk android:minSdkVersion="${o.minSdk || 30}" android:targetSdkVersion="${o.targetSdk || 36}" />`,
        // マージ後のマニフェストは（a）∪（b）と完全一致する（AG1 merged）。fixture の許可リストの（b）の2件も含める（D-S2-05）
        ...(o.perms || [...A18, ['WAKE_LOCK'], ['com.metarchitect.Weaver.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']]).concat(o.extraPerms || []).map(permLine),
        `    <application android:name="com.mattermost.rnbeta.MainApplication" android:resizeableActivity="${o.resizeable || 'false'}" android:usesCleartextTraffic="${o.cleartext || 'false'}">`,
        '        <activity android:name="com.mattermost.rnbeta.MainActivity" />',
        '        <service android:name="com.mattermost.rnbeta.NotificationDismissService" />',
        '        <receiver android:name="com.mattermost.rnbeta.NotificationReplyBroadcastReceiver" />',
        '    </application>',
        '</manifest>',
        '',
    ].join('\n');
    write(d, 'manifest.xml', man);
    write(d, 'cert.txt', o.certTxt === undefined ? certTxt({unsigned: o.signed !== true}) : o.certTxt);
    write(d, 'nsc.txt', o.nscTxt === undefined ? 'A: cleartextTrafficPermitted=false (Raw: "false")\n  E: certificates src="user"\n' : o.nscTxt);
    write(d, 'dex-classes.txt', o.dexClasses === undefined ? CLASSES4.join('\n') + '\n' : o.dexClasses);
    write(d, 'abis.txt', o.abis === undefined ? 'arm64-v8a\narmeabi-v7a\nx86_64\n' : o.abis);
    write(d, 'resources.txt', o.resources === undefined ? 'string/project_id: DUMMY-weaver-unsigned-verification\nstring/google_app_id: 1:000000000000:android:DUMMY0000000000000000\n' : o.resources);
    return d;
}

// ---- ZIP（AAB の代用。fflate）----
function zipBuf(entries) {
    const {zipSync} = require('fflate');
    const o = {};
    for (const [k, v] of Object.entries(entries)) {
        o[k] = typeof v === 'string' ? Buffer.from(v) : v;
    }
    return Buffer.from(zipSync(o, {level: 0}));
}
function smallAab(extra = {}) {
    return zipBuf({'BundleConfig.pb': 'bc', 'base/manifest/AndroidManifest.xml': 'm', 'base/dex/classes.dex': 'dex', ...extra});
}

// ---- L2（実ツール）: 無ければ「未実施（環境）」にする（SKIPを緑に数えない）----
const L2_KEYTOOL = process.env.WEAVER_KEYTOOL || '/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe';
const L2_JARSIGNER = process.env.WEAVER_JARSIGNER || '/c/Program Files/Android/Android Studio/jbr/bin/jarsigner.exe';
function toolOk(p) {
    try {
        const wp = p.replace(/^\/([a-z])\//, '$1:/');
        return fs.existsSync(wp);
    } catch (e) {
        return false;
    }
}
const ENV_MISSING = '【未実施（環境）】';


// ---- 使い捨て Git リポジトリ・フルツリー（pre の集約用。AG10 は Git リポジトリを要求する）----
function gitIn(dir, args) {
    return spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args], {cwd: dir, encoding: 'utf8'});
}
function gitInitCommit(dir) {
    gitIn(dir, ['init', '-q']);
    gitIn(dir, ['add', '-A', '-f']);
    gitIn(dir, ['commit', '-q', '-m', 'init']);
    return dir;
}
const IMG_REL = 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png';
// pre の集約が全AGで緑になる Git リポジトリ（画像1枚＋ハッシュ一覧は上流と別の内容）。o.real=true で目印＋実キー形式の google-services.json。
function fullTree(o = {}) {
    const files = {...(o.files || {})};
    const root = goodTree({...o, files, hashes: `${sha256Buf(Buffer.from('upstream-image'))}  ${IMG_REL}\n`});
    write(root, IMG_REL, 'replaced-image');
    if (o.real) {
        write(root, 'android/app/google-services.json', googleServices(REAL));
        write(root, '.github/android_firebase_real', '');
    }
    return gitInitCommit(root);
}
// 実リポジトリの一部を複製して Git リポジトリにする（段階別の pre 用）
function copyRepoSubset(rels) {
    const dir = tmp('k79-copy-');
    for (const rel of rels) {
        const src = abs(rel);
        if (!fs.existsSync(src)) {
            continue;
        }
        fs.cpSync(src, path.join(dir, rel), {recursive: true});
    }
    return gitInitCommit(dir);
}

module.exports = {
    ROOT, BASH, posix, abs, exists, read, readBuf, BASE_SHA, UPSTREAM_SHA, SCRIPTS, WORKFLOW, SMOKE, COMPOSITE,
    ALLOWLIST_REL, BASELINE_REL, HASHES_REL, STAGE_REL,
    tmp, cleanup, write, readAt, trySymlink, run, guard, aab, inject, k16, shared, scriptExists,
    failLines, warnLines, noteLines, failedLabels, all, makeStubs, hashTree, sha256File, sha256Buf,
    git, gitShow, gitShowText, baseTree, stage, gitIn, gitInitCommit, fullTree, copyRepoSubset, IMG_REL,
    A18, permName, permLine, manifestXml, nscXml, allowlistTxt, buildGradle, googleServices, REAL, KOTLIN_FILES, goodTree,
    CLASSES4, SHA_OK, SHA_OK_PLAIN, certTxt, extractDir, zipBuf, smallAab,
    L2_KEYTOOL, L2_JARSIGNER, toolOk, ENV_MISSING,
};
