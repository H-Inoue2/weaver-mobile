// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39/R1 テスト共通部品。
// 拡張子を .cjs にしているのは、jest の既定 testMatch が __tests__ 内の .ts/.tsx/.js をすべて
// テストとして拾うため（テストの無いスイートは失敗する）。ここはテストではなく部品。

const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASH = process.env.WEAVER_TEST_BASH || 'bash';
const GUARD_REL = '.github/scripts/weaver_release_guard.sh';
// テストハーネスの確認用に、別の場所のスクリプトを指定できる（環境変数 WEAVER_GUARD_SCRIPT。通常は未指定で実リポジトリのスクリプト）
const guardAbs = () => process.env.WEAVER_GUARD_SCRIPT || path.join(ROOT, GUARD_REL);

const posix = (p) => p.replace(/\\/g, '/');
const abs = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));
const readRaw = (rel) => fs.readFileSync(abs(rel));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8').replace(/\r/g, '');

function walk(relDir, exts, out = []) {
    const dir = abs(relDir);
    if (!fs.existsSync(dir)) {
        return out;
    }
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        if (e.name === 'node_modules' || e.name === '.git') {
            continue;
        }
        const rel = posix(path.join(relDir, e.name));
        if (e.isDirectory()) {
            walk(rel, exts, out);
        } else if (!exts || exts.some((x) => rel.endsWith(x))) {
            out.push(rel);
        }
    }
    return out;
}

const TEST_HELPER_NAMES = ['test.ts', 'test_manual.ts', 'create_test_connection.ts'];
function isTestFile(rel) {
    return (/\.test\.tsx?$/).test(rel) || rel.includes('/__tests__/') || TEST_HELPER_NAMES.includes(path.basename(rel));
}
function isCommentLine(line) {
    return (/^\s*(\*|\/\/|\/\*)/).test(line);
}

// ---- 描画結果（react-test-renderer の toJSON）の読み取り ----
function nodeText(node) {
    if (node == null) {
        return '';
    }
    if (typeof node === 'string') {
        return node;
    }
    if (Array.isArray(node)) {
        return node.map(nodeText).join('');
    }
    return nodeText(node.children);
}
function walkJson(node, fn) {
    if (node == null || typeof node === 'string') {
        return;
    }
    if (Array.isArray(node)) {
        node.forEach((n) => walkJson(n, fn));
        return;
    }
    fn(node);
    walkJson(node.children, fn);
}
function findByTestId(json, id) {
    const found = [];
    walkJson(json, (n) => {
        if (n.props && n.props.testID === id) {
            found.push(n);
        }
    });
    return found;
}
function allTestIds(json) {
    const ids = [];
    walkJson(json, (n) => {
        if (n.props && typeof n.props.testID === 'string') {
            ids.push(n.props.testID);
        }
    });
    return ids;
}
function flattenStyle(style) {
    if (Array.isArray(style)) {
        return style.reduce((acc, s) => ({...acc, ...flattenStyle(s)}), {});
    }
    return style && typeof style === 'object' ? style : {};
}

// ---- ガード用フィクスチャ ----
const CONST_NAMES = ['APP_NAME', 'PRIVACY_POLICY_URL', 'TERMS_OF_SERVICE_URL', 'SUPPORT_URL', 'REPORT_A_PROBLEM_EMAIL', 'NOTIFICATION_HELP_URL', 'ACCOUNT_DELETION_URL'];
const N_CONSTANTS = {
    APP_NAME: 'Weaver',
    PRIVACY_POLICY_URL: 'https://weaver.example/privacy',
    TERMS_OF_SERVICE_URL: '',
    SUPPORT_URL: 'https://weaver.example/support',
    REPORT_A_PROBLEM_EMAIL: 'support@weaver.example',
    NOTIFICATION_HELP_URL: '',
    ACCOUNT_DELETION_URL: '',
};
const WEAVER_KEYS = {
    NSAppleMusicUsageDescription: 'Enabling access to your media library means you can attach files from your media library to your messages in Weaver.',
    NSFaceIDUsageDescription: 'Enabling access to your Face ID means we can restrict unauthorized users from accessing Weaver on your device.',
    NSMicrophoneUsageDescription: 'Enabling access to your device\'s microphones means you can capture audio for calls or videos to share in Weaver.',
    NSPhotoLibraryAddUsageDescription: 'Enabling write access to your photo library means you can save downloaded photos and videos from Weaver to your device.',
    NSSpeechRecognitionUsageDescription: 'Enabling your device to send user data to Apple means you can send voice messages to Weaver.',
};
const PLAIN_KEYS = {
    NSBluetoothAlwaysUsageDescription: 'Enabling access to Bluetooth means we can synchronize content across your devices and clients.',
    NSBluetoothPeripheralUsageDescription: 'Enabling access to Bluetooth means we can connect to audio peripherals for calls, and synchronize content across your devices and clients.',
    NSCameraUsageDescription: 'Allowing access to your camera enables you to take photos or videos and attach them to messages.',
    NSLocationWhenInUseUsageDescription: 'Your location can be used to report the Wi-Fi network name to your administrator when required by your organization\'s security policy.',
    NSPhotoLibraryUsageDescription: 'Allowing access to your photo library enables you to select photos or videos and attach them to messages.',
};

const tdfLine = (raw) => `\t\t\t\tTARGETED_DEVICE_FAMILY = ${raw};`;

function pbxprojText(lines) {
    const blocks = lines.map((l, i) => [
        `\t\tAAAA${i} /* cfg${i} */ = {`,
        '\t\t\tisa = XCBuildConfiguration;',
        '\t\t\tbuildSettings = {',
        '\t\t\t\tPRODUCT_NAME = Mattermost;',
        l,
        '\t\t\t};',
        '\t\t\tname = Debug;',
        '\t\t};',
    ].join('\n'));
    return ['// !$*UTF8*$!', '{', '\tobjects = {', ...blocks, '\t};', '}', ''].join('\n');
}

function plistText(overrides = {}, extra = '') {
    const keys = {...WEAVER_KEYS, ...PLAIN_KEYS, ...overrides};
    const body = Object.keys(keys).sort().map((k) => `\t<key>${k}</key>\n\t<string>${keys[k]}</string>`).join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        '\t<key>CFBundleDisplayName</key>',
        '\t<string>Weaver</string>',
        '\t<key>CFBundleName</key>',
        '\t<string>$(PRODUCT_NAME)</string>',
        '\t<key>CFBundleURLTypes</key>',
        '\t<array>',
        '\t\t<dict>',
        '\t\t\t<key>CFBundleURLName</key>',
        '\t\t\t<string>com.mattermost</string>',
        '\t\t\t<key>CFBundleURLSchemes</key>',
        '\t\t\t<array>',
        '\t\t\t\t<string>mattermost</string>',
        '\t\t\t\t<string>mmauthbeta</string>',
        '\t\t\t\t<string>weaver</string>',
        '\t\t\t</array>',
        '\t\t</dict>',
        '\t</array>',
        body,
        extra,
        '</dict>',
        '</plist>',
        '',
    ].join('\n');
}

function constantsText(values = {}, rawLines = {}) {
    const merged = {...N_CONSTANTS, ...values};
    return CONST_NAMES.map((n) => {
        if (Object.prototype.hasOwnProperty.call(rawLines, n)) {
            return rawLines[n];
        }
        return `export const ${n} = '${merged[n]}';`;
    }).filter((l) => l !== null).join('\n') + '\n';
}

/**
 * opts:
 *  pbx: 生の値の配列（既定: '1' を6件）／pbxLines: 行そのものの配列（pbx より優先）
 *  plist: キー上書き／plistExtra: 末尾に足す生テキスト
 *  consts: 定数の値上書き／constRaw: 定数の行そのものの上書き（null で行を消す）／constantsFile: ファイル全体の上書き
 *  messages: messages.ts の中身
 *  files: {相対パス: 中身} の追加
 *  omit: ['pbxproj','plist','constants'] で作らない
 *  crlf: 全ファイルを CRLF にする
 */
function makeFixture(opts = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wvguard-'));
    const files = {};
    const omit = opts.omit || [];
    if (!omit.includes('pbxproj')) {
        const lines = opts.pbxLines || (opts.pbx || ['1', '1', '1', '1', '1', '1']).map(tdfLine);
        files['ios/Mattermost.xcodeproj/project.pbxproj'] = pbxprojText(lines);
    }
    if (!omit.includes('plist')) {
        files['ios/Mattermost/Info.plist'] = plistText(opts.plist, opts.plistExtra || '');
    }
    if (!omit.includes('constants')) {
        files['app/weaver/constants.ts'] = opts.constantsFile === undefined ? constantsText(opts.consts, opts.constRaw) : opts.constantsFile;
    }
    files['app/weaver/messages.ts'] = opts.messages === undefined ? 'export const WEAVER_MESSAGES = {en: {}, ja: {}};\n' : opts.messages;
    Object.assign(files, opts.files || {});
    for (const rel of Object.keys(files)) {
        const p = path.join(root, rel);
        fs.mkdirSync(path.dirname(p), {recursive: true});
        const text = opts.crlf ? files[rel].replace(/\r?\n/g, '\r\n') : files[rel];
        fs.writeFileSync(p, text);
    }
    return root;
}

function removeFixture(root) {
    fs.rmSync(root, {recursive: true, force: true});
}

function runGuard(args = [], opts = {}) {
    const argv = args.map((a) => (a.startsWith('--') ? a : posix(a)));
    const r = spawnSync(BASH, [posix(guardAbs()), ...argv], {
        cwd: opts.cwd || ROOT,
        encoding: 'utf8',
        timeout: 60000,
    });
    return {status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error};
}

// ESLint を子プロセスで実行（jest の VM 内では ESM の設定ファイルを読めないため）
function lintText(text, rel) {
    const r = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--stdin', '--stdin-filename', rel, '--format', 'json'], {
        cwd: ROOT,
        input: text,
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 64 * 1024 * 1024,
    });
    let parsed;
    try {
        parsed = JSON.parse(r.stdout);
    } catch (e) {
        throw new Error(`eslint の出力を解析できない: status=${r.status} stderr=${r.stderr}`);
    }
    return parsed[0].messages;
}


// コメント行と import 行を除いたソース（ヘッダーの "Mattermost" や @mattermost/ の import を検査から外すため）
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
}
function codeOnly(src) {
    return stripComments(src).split('\n').filter((l) => !(/\bfrom\s+['"][^'"]+['"];?\s*$/).test(l) && !(/^\s*import\s+['"]/).test(l)).join('\n');
}

// 描画結果の Text（最外のもの）の文字を、出現順に集める
function textNodes(json) {
    const out = [];
    const rec = (node) => {
        if (node == null || typeof node === 'string') {
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(rec);
            return;
        }
        if (node.type === 'Text') {
            out.push(nodeText(node.children));
            return;
        }
        rec(node.children);
    };
    rec(json);
    return out;
}

// ../constants の jest.mock 用。値は constOverrides で差し替える（getter なので、描画時に読まれる）
// jest.isolateModules 内で再読込されても値が残るよう、global に置く
const constOverrides = global.__WEAVER_CONST_OVERRIDES__ || (global.__WEAVER_CONST_OVERRIDES__ = {});
function constantsMockModule(actual) {
    const m = {__esModule: true, ...actual};
    CONST_NAMES.forEach((n) => {
        Object.defineProperty(m, n, {
            enumerable: true,
            get() {
                return Object.prototype.hasOwnProperty.call(constOverrides, n) ? constOverrides[n] : actual[n];
            },
        });
    });
    return m;
}

// About 画面の結合テスト用の config（ClientConfig の一部）
function makeAboutConfig(overrides = {}) {
    return {
        SiteName: 'Weaver',
        Version: '10.5.0',
        BuildNumber: '10.5.0',
        SQLDriverName: 'mysql',
        SchemaVersion: '1',
        BuildHash: 'hash1',
        BuildHashEnterprise: 'hash2',
        BuildDate: '2026-01-01',
        BuildEnterpriseReady: 'false',
        TermsOfServiceLink: '',
        PrivacyPolicyLink: '',
        ...overrides,
    };
}

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
function pngInfo(rel) {
    const b = readRaw(rel);
    return {sigOk: PNG_SIG.every((v, i) => b[i] === v), width: b.readUInt32BE(16), height: b.readUInt32BE(20), size: b.length, buffer: b};
}

module.exports = {
    ROOT, BASH, GUARD_REL, guardAbs, posix, abs, exists, read, readRaw, walk, isTestFile, isCommentLine,
    nodeText, walkJson, findByTestId, allTestIds, flattenStyle, stripComments, codeOnly, textNodes, constOverrides, constantsMockModule, makeAboutConfig,
    CONST_NAMES, N_CONSTANTS, WEAVER_KEYS, PLAIN_KEYS, tdfLine, pbxprojText, plistText, constantsText,
    makeFixture, removeFixture, runGuard, lintText, pngInfo,
};
