// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-79/R0 単体テスト（工程8①）: ワークフロー静的検査の規則（詳細設計 §4.1 の規則①〜⑫・§4.1.1・§4.3）。
// 規則はここ（テスト側）に持ち、実ワークフローは合格・改造コピーは規則ごとに失敗することを確かめる（陽性対照）。
// 実装（ワークフロー）を見て規則を決めない。規則の出典は設計書。

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const s = require('./android_test_support.cjs');

const SECRET_NAMES = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS'];
const NAMES = {
    verify: ['V1 Checkout', 'V1b Fetch reference commits', 'V2', 'V3', 'V4', 'V5', 'V6 Workflow lint (actionlint)', 'V7 Tracked secrets check'],
    preflight: ['Checkout (sparse)', 'Setup Java', 'Decide signing mode', 'Restore upload keystore', 'Check upload key (AG3 pre)', 'Delete keystore'],
    build: ['Checkout (sparse)', 'Prepare JS', 'Setup Java', 'Locate Android tools / Install SDK', 'Restore Gradle cache', 'Decide signing mode', 'Inject versionCode / versionName', 'Android guard (always)', 'Android guard (submission build)', 'Shared release guard (always)', 'Shared release guard (submission build)', 'Build AAB (bundleUnsigned)', 'Hash and upload unchecked AAB'],
    inspect: ['Checkout (sparse)', 'Setup Java', 'Decide signing mode', 'Locate Android tools', 'Install bundletool', 'Download unchecked AAB', 'Verify input AAB', 'Pre-sign checks', '16KB alignment', 'Output checked sha256', 'Facts artifact'],
    sign: ['Checkout (sparse)', 'Setup Java', 'Decide signing mode', 'Download unchecked AAB and facts', 'Verify AAB hash', 'Restore upload keystore', 'Sign AAB (jarsigner)', 'Delete keystore and confirm', 'Verify signature', 'Check certificate', 'Summary and final files', 'Play upload (reserved. manual upload only)', 'Upload final artifact'],
};
// 添字（P1〜P6・B1〜B14（B7欠番）・I1〜I11・G1〜G13）
const IDX = {
    preflight: (n) => n - 1,
    build: (n) => (n < 7 ? n - 1 : n - 2),
    inspect: (n) => n - 1,
    sign: (n) => n - 1,
};

const load = (text) => yaml.load(text);
const loadReal = () => load(s.read(s.WORKFLOW));
const clone = (d) => JSON.parse(JSON.stringify(d));
const jobsOf = (doc) => (doc && doc.jobs) || {};
const stepsOf = (doc, job) => ((jobsOf(doc)[job] || {}).steps || []);
const step = (doc, job, label) => {
    const list = stepsOf(doc, job);
    const m = /^([PBIG])(\d+)$/.exec(label);
    if (m) {
        const k = {P: 'preflight', B: 'build', I: 'inspect', G: 'sign'}[m[1]];
        const name = NAMES[k][IDX[k](Number(m[2]))];
        const hit = list.find((x) => x.name === name);
        if (!hit) {
            throw new Error(`${job} に ${label}（${name}）が無い`);
        }
        return hit;
    }
    const hit = list.find((x) => x.name === label);
    if (!hit) {
        throw new Error(`${job} に ${label} が無い`);
    }
    return hit;
};
const stepIndex = (doc, job, label) => stepsOf(doc, job).indexOf(step(doc, job, label));
const runOf = (st) => (typeof st.run === 'string' ? st.run : '');
const str = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const allOfStep = (st) => ['name', 'if', 'run', 'uses', 'env', 'with', 'id'].map((k) => str(st[k])).join('\n');
const SHA40 = /^[0-9a-f]{40}$/;

// ---- 走査: secrets の出現位置 ----
function secretRefs(doc) {
    const out = [];
    const scan = (where, job, stepName, val) => {
        const t = str(val);
        const re = /secrets(\.[A-Za-z0-9_]+|\[|\b)/g;
        let m;
        while ((m = re.exec(t))) {
            out.push({where, job: job || '', step: stepName || '', text: m[0]});
        }
    };
    if (doc.env) {
        scan('topenv', '', '', doc.env);
    }
    if (doc.defaults) {
        scan('defaults', '', '', doc.defaults);
    }
    for (const [jn, job] of Object.entries(jobsOf(doc))) {
        for (const [k, v] of Object.entries(job)) {
            if (k === 'steps') {
                continue;
            }
            if (k === 'secrets') {
                out.push({where: 'job-secrets-key', job: jn, step: '', text: 'secrets'});
            }
            scan(k === 'env' ? 'jobenv' : 'job-' + k, jn, '', v);
        }
        for (const st of job.steps || []) {
            for (const k of ['env', 'run', 'with', 'if', 'name', 'uses', 'id']) {
                scan(k, jn, st.name || '', st[k]);
            }
        }
    }
    return out;
}

// ---- 規則①〜⑫ ----
const checks = {};
checks.R1 = (doc) => {
    const refs = secretRefs(doc);
    const v = [];
    const allow = {preflight: ['Restore upload keystore', 'Check upload key (AG3 pre)'], sign: ['Restore upload keystore', 'Sign AAB (jarsigner)']};
    if (refs.length !== 6) {
        v.push(`R1: secrets の出現が ${refs.length} 件（正は6件）`);
    }
    for (const r of refs) {
        if (r.where !== 'env' || !(allow[r.job] || []).includes(r.step)) {
            v.push(`R1: secrets が許可外の位置 ${r.job}/${r.step}/${r.where}`);
        }
    }
    return v;
};
checks.R2 = (doc) => {
    const refs = secretRefs(doc).filter((r) => ['verify', 'build', 'inspect'].includes(r.job));
    return refs.map((r) => `R2: ${r.job} に secrets`);
};
checks.R3 = (doc) => {
    const v = [];
    for (const r of secretRefs(doc)) {
        const m = /^secrets\.([A-Za-z0-9_]+)$/.exec(r.text);
        if (!m || !SECRET_NAMES.includes(m[1])) {
            v.push(`R3: 許可外の secrets の形 ${r.text}`);
        }
    }
    const all = JSON.stringify(doc);
    if (/toJson\(\s*secrets/i.test(all)) {
        v.push('R3: toJson(secrets)');
    }
    if (/secrets\s*:\s*inherit/.test(all) || /"secrets":"inherit"/.test(all)) {
        v.push('R3: secrets: inherit');
    }
    return v;
};
checks.R4 = (doc) => secretRefs(doc).filter((r) => ['topenv', 'jobenv', 'with', 'defaults'].includes(r.where)).map((r) => `R4: ${r.where} に secrets`);
checks.R5 = (doc) => {
    const v = [];
    for (const jn of ['verify', 'build', 'inspect']) {
        const t = str((jobsOf(doc)[jn] || {}));
        for (const n of SECRET_NAMES) {
            if (t.includes(n)) {
                v.push(`R5: ${jn} に署名用Secretsの名前 ${n}`);
            }
        }
    }
    return v;
};
checks.R6 = (doc) => {
    const withEnv = Object.entries(jobsOf(doc)).filter(([, j]) => j.environment !== undefined).map(([k]) => k).sort();
    return JSON.stringify(withEnv) === JSON.stringify(['preflight', 'sign']) ? [] : [`R6: environment を持つjob = ${withEnv.join(',')}`];
};
checks.R7 = (doc) => {
    const v = [];
    for (const jn of ['preflight', 'inspect', 'sign']) {
        for (const st of stepsOf(doc, jn)) {
            if (typeof st.uses === 'string' && !st.uses.startsWith('./')) {
                const ref = st.uses.split('@')[1] || '';
                if (!SHA40.test(ref)) {
                    v.push(`R7: ${jn}/${st.name} の uses が SHA 固定でない (${st.uses})`);
                }
            }
        }
    }
    return v;
};
checks.R8 = (doc) => {
    const v = [];
    for (const jn of ['preflight', 'inspect', 'sign']) {
        for (const st of stepsOf(doc, jn)) {
            if (/\$\{\{/.test(runOf(st))) {
                v.push(`R8: ${jn}/${st.name} の run: に \${{ }}`);
            }
            const needsRefs = allOfStep(st).match(/needs\.[A-Za-z0-9_.]+/g) || [];
            for (const n of needsRefs) {
                const okRef = jn === 'sign' && st.name === 'Verify AAB hash' && n === 'needs.inspect.outputs.checked_sha256';
                if (!okRef) {
                    v.push(`R8: ${jn}/${st.name} に ${n}`);
                }
            }
        }
        const jobLevel = str(Object.fromEntries(Object.entries(jobsOf(doc)[jn]).filter(([k]) => k !== 'steps')));
        if (/needs\.[A-Za-z0-9_.]+\./.test(jobLevel.replace(/"needs":\[[^\]]*\]/, ''))) {
            v.push(`R8: ${jn} のjob直下に needs.* の参照`);
        }
    }
    return v;
};
const ALLOWED_USES = ['actions/checkout', 'actions/setup-node', 'actions/setup-java', 'actions/cache', 'actions/upload-artifact', 'actions/download-artifact'];
checks.R9 = (doc) => {
    const v = [];
    for (const [jn, job] of Object.entries(jobsOf(doc))) {
        for (const st of job.steps || []) {
            if (typeof st.uses !== 'string') {
                continue;
            }
            const name = st.uses.split('@')[0];
            if (!st.uses.startsWith('./') && !ALLOWED_USES.includes(name)) {
                v.push(`R9: ${jn} に許可外の第三者アクション ${name}`);
            }
            if (['preflight', 'inspect', 'sign'].includes(jn) && (name === 'actions/cache' || name === 'actions/setup-node' || st.uses.startsWith('./.github/actions/'))) {
                v.push(`R9: ${jn} に ${name}`);
            }
        }
    }
    return v;
};
// 環境ファイルへの書込（§4.1.1 の全数表）
const ENVFILE = /(GITHUB_ENV|GITHUB_OUTPUT|GITHUB_PATH)/;
function envWrites(doc) {
    const out = [];
    for (const jn of ['preflight', 'inspect', 'sign']) {
        for (const st of stepsOf(doc, jn)) {
            const body = runOf(st);
            const re = /(\w[\w\-\.\"\$\{\}\/ ]*)>>?\s*"?\$\{?(GITHUB_ENV|GITHUB_OUTPUT|GITHUB_PATH)\}?"?|"\$\{?(GITHUB_ENV|GITHUB_OUTPUT|GITHUB_PATH)\}?"/g;
            if (ENVFILE.test(body)) {
                const kind = (/GITHUB_ENV/.test(body) ? 'ENV' : '') + (/GITHUB_OUTPUT/.test(body) ? 'OUTPUT' : '') + (/GITHUB_PATH/.test(body) ? 'PATH' : '');
                const keys = [];
                for (const m of body.matchAll(/(?:echo|printf)[^\n]*?([A-Z][A-Z0-9_]*|signing|sha256)=[^\n]*?>>?\s*"?\$\{?(GITHUB_ENV|GITHUB_OUTPUT|GITHUB_PATH)/g)) {
                    keys.push(m[1] + ':' + m[2]);
                }
                if (/weaver_android_aab\.sh\s+tools[^\n]*>>\s*"?\$\{?GITHUB_ENV/.test(body)) {
                    for (const k of ['WEAVER_KEYTOOL', 'WEAVER_AAPT2', 'WEAVER_ZIPALIGN', 'WEAVER_DEXDUMP', 'WEAVER_OBJDUMP']) {
                        keys.push(k + ':GITHUB_ENV');
                    }
                }
                out.push({job: jn, step: st.name, kind, keys, body, re: re.source});
            }
        }
    }
    return out;
}
const ENV_TABLE = {
    'preflight/Decide signing mode': ['signing:GITHUB_OUTPUT'],
    'preflight/Restore upload keystore': ['WEAVER_KEYSTORE_PATH:GITHUB_ENV'],
    'inspect/Decide signing mode': ['signing:GITHUB_OUTPUT'],
    'inspect/Locate Android tools': ['WEAVER_KEYTOOL:GITHUB_ENV', 'WEAVER_AAPT2:GITHUB_ENV', 'WEAVER_ZIPALIGN:GITHUB_ENV', 'WEAVER_DEXDUMP:GITHUB_ENV', 'WEAVER_OBJDUMP:GITHUB_ENV'],
    'inspect/Install bundletool': ['WEAVER_BUNDLETOOL_JAR:GITHUB_ENV'],
    'inspect/Output checked sha256': ['sha256:GITHUB_OUTPUT'],
    'sign/Decide signing mode': ['signing:GITHUB_OUTPUT'],
    'sign/Restore upload keystore': ['WEAVER_KEYSTORE_PATH:GITHUB_ENV'],
};
checks.R10 = (doc) => {
    const v = [];
    for (const w of envWrites(doc)) {
        const key = `${w.job}/${w.step}`;
        if (!(key in ENV_TABLE)) {
            v.push(`R10: 表に無いステップ ${key} が環境ファイル(${w.kind})へ書く`);
            continue;
        }
        if (/GITHUB_PATH/.test(w.body)) {
            v.push(`R10: ${key} が GITHUB_PATH へ書く`);
        }
        const want = ENV_TABLE[key].slice().sort().join(',');
        const got = [...new Set(w.keys)].sort().join(',');
        if (got !== want) {
            v.push(`R10: ${key} の書込キー [${got}] が表 [${want}] と違う`);
        }
        if (/PASSWORD|KEY_ALIAS/.test(w.body.split('\n').filter((l) => ENVFILE.test(l)).join('\n'))) {
            v.push(`R10: ${key} がパスワード・別名を環境ファイルへ書く`);
        }
    }
    return v;
};
const SIGN_ALLOWED = ['sha256sum', 'ls', 'keytool', 'jarsigner', 'shred', 'rm', 'bash', 'cp', 'mkdir', 'echo', 'printf', 'test', 'cat', 'chmod', 'base64', 'tr', 'set', 'if', 'then', 'else', 'fi', 'exit', 'case', 'esac', 'for', 'do', 'done', 'cd', 'wc', 'head', 'tail', 'grep', 'sed', 'awk', 'cut', 'mv', 'basename', 'dirname', 'find', 'stat', 'date', 'umask', 'true', 'false', 'while', 'local', 'export', 'read', 'trap', 'return', 'unset', 'shift', '[', '[[', '{', '}', '(', ')', 'in', 'then', 'elif', 'printf'];
const SIGN_FORBIDDEN = [/\bbundletool\b/, /\baapt2\b/, /\bdexdump\b/, /\bllvm-objdump\b/, /\bzipalign\b/, /\bunzip\b/, /\bzipinfo\b/, /weaver_android_aab\.sh\s+(extract|tools|verify-input)/, /\badb\b/, /\bemulator\b/, /\bam start\b/, /\bgradlew\b/, /\bnpm\b/, /\bnode\b/, /\bnpx\b/, /java\s+-jar/];
checks.R11 = (doc) => {
    const v = [];
    for (const st of stepsOf(doc, 'sign')) {
        const body = runOf(st);
        for (const re of SIGN_FORBIDDEN) {
            if (re.test(body)) {
                v.push(`R11: sign/${st.name} に ${re}`);
            }
        }
        if (typeof st.uses === 'string' && /setup-node|cache|weaver-prepare-js/.test(st.uses)) {
            v.push(`R11: sign/${st.name} に ${st.uses}`);
        }
    }
    return v;
};
checks.R12 = (doc) => {
    const v = [];
    for (const jn of Object.keys(jobsOf(doc))) {
        const env = jobsOf(doc)[jn].env || {};
        for (const [k, val] of Object.entries(env)) {
            if (/\$\{\{\s*(runner|steps)\./.test(str(val))) {
                v.push(`R12: ${jn} のjob直下 env.${k} に runner./steps.`);
            }
        }
        for (const st of stepsOf(doc, jn)) {
            if (/download-artifact|upload-artifact/.test(st.uses || '')) {
                const p = str((st.with || {}).path);
                if (p && !/^\$\{\{ runner\.temp \}\}\//.test(p.split('\n')[0].trim())) {
                    v.push(`R12: ${jn}/${st.name} の with.path が runner.temp 形でない (${p})`);
                }
            }
        }
    }
    return v;
};
const ALL = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'];
const checkAll = (doc) => ALL.flatMap((k) => checks[k](doc));

// ---- 改造コピー（objectで作る）----
function mutate(doc, fn) {
    const d = clone(doc);
    fn(d);
    return d;
}

// ---- run: 本文の実行（スタブ・環境ファイル）----
function runStep(st, o = {}) {
    const work = o.cwd || s.tmp('k79-step-');
    const script = s.write(work, '.step.sh', runOf(st) + '\n');
    const env = {...process.env, ...(o.env || {})};
    if (o.stubDir) {
        env.PATH = s.posix(o.stubDir) + path.delimiter + env.PATH;
        env.STUB_LOG = s.posix(path.join(o.stubDir, 'stub.log'));
    }
    const outFile = path.join(work, '.github_output');
    const envFile = path.join(work, '.github_env');
    fs.writeFileSync(outFile, '');
    fs.writeFileSync(envFile, '');
    env.GITHUB_OUTPUT = s.posix(outFile);
    env.GITHUB_ENV = s.posix(envFile);
    env.GITHUB_PATH = s.posix(path.join(work, '.github_path'));
    fs.writeFileSync(path.join(work, '.github_path'), '');
    const r = require('child_process').spawnSync(s.BASH, ['--noprofile', '--norc', '-eo', 'pipefail', s.posix(script)], {cwd: work, env, encoding: 'utf8', timeout: o.timeout || 60000});
    return {
        rc: r.status,
        out: (r.stdout || '').replace(/\r/g, ''),
        err: (r.stderr || '').replace(/\r/g, ''),
        outputFile: fs.readFileSync(outFile, 'utf8'),
        envFile: fs.readFileSync(envFile, 'utf8'),
        pathFile: fs.readFileSync(path.join(work, '.github_path'), 'utf8'),
        work,
    };
}

module.exports = {SECRET_NAMES, NAMES, IDX, load, loadReal, clone, jobsOf, stepsOf, step, stepIndex, runOf, str, allOfStep, SHA40, secretRefs, checks, checkAll, ALL, mutate, runStep, envWrites, ENV_TABLE, ALLOWED_USES};
