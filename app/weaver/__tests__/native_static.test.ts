// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// グループN（UT-123〜UT-136）: ネイティブ設定の静的検査（実ファイルを読む。pbxproj・Info.plist・InfoPlist.strings）
// 作業ツリーは CRLF（core.autocrlf=true）のため、読み込みは CR を除く。pbxproj の値は独立した実装で読む（ガードの実装と共有しない）。

export {};

const support = require('./weaver_test_support.cjs');

const PBX = 'ios/Mattermost.xcodeproj/project.pbxproj';
const PLIST = 'ios/Mattermost/Info.plist';

const tdfValues = (): string[] => {
    const text: string = support.read(PBX);
    const re = /TARGETED_DEVICE_FAMILY(?:\[[^\]]*\])?\s*=\s*([^;]*);/g;
    const out: string[] = [];
    let m = re.exec(text);
    while (m) {
        out.push(m[1].replace(/[\s"'()]/g, '').replace(/,$/, ''));
        m = re.exec(text);
    }
    return out;
};

const plistStrings = (): Record<string, string> => {
    const text: string = support.read(PLIST);
    const re = /<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g;
    const out: Record<string, string> = {};
    let m = re.exec(text);
    while (m) {
        out[m[1]] = m[2];
        m = re.exec(text);
    }
    return out;
};

describe('project.pbxproj（C-6）', () => {
    it('UT-123 TARGETED_DEVICE_FAMILY の全件の値（引用符・括弧・空白を除く）がすべて 1', () => {
        const values = tdfValues();
        expect(values.length).toBeGreaterThan(0);
        expect(values.filter((v) => v !== '1')).toEqual([]);
    });

    it('UT-124 TARGETED_DEVICE_FAMILY はちょうど6件（3ターゲット×Debug/Release。増減を検出）', () => {
        expect(tdfValues()).toHaveLength(6);
    });

    it('UT-125 PRODUCT_NAME: 本体の2行（Debug・Release）が PRODUCT_NAME = Mattermost; のまま（変えない方針）', () => {
        const lines: string[] = support.read(PBX).split('\n').map((l: string) => l.trim());
        expect(lines.filter((l) => l === 'PRODUCT_NAME = Mattermost;')).toHaveLength(2);
    });
});

describe('Info.plist（C-9・C-6）', () => {
    const p = plistStrings;

    it('UT-126 NSAppleMusicUsageDescription', () => {
        expect(p().NSAppleMusicUsageDescription).toBe('Enabling access to your media library means you can attach files from your media library to your messages in Weaver.');
    });
    it('UT-127 NSFaceIDUsageDescription', () => {
        expect(p().NSFaceIDUsageDescription).toBe('Enabling access to your Face ID means we can restrict unauthorized users from accessing Weaver on your device.');
    });
    it('UT-128 NSMicrophoneUsageDescription', () => {
        expect(p().NSMicrophoneUsageDescription).toBe('Enabling access to your device\'s microphones means you can capture audio for calls or videos to share in Weaver.');
    });
    it('UT-129 NSPhotoLibraryAddUsageDescription', () => {
        expect(p().NSPhotoLibraryAddUsageDescription).toBe('Enabling write access to your photo library means you can save downloaded photos and videos from Weaver to your device.');
    });
    it('UT-130 NSSpeechRecognitionUsageDescription', () => {
        expect(p().NSSpeechRecognitionUsageDescription).toBe('Enabling your device to send user data to Apple means you can send voice messages to Weaver.');
    });

    it('UT-131 Camera・PhotoLibrary・BluetoothAlways・BluetoothPeripheral・LocationWhenInUse の5キーは現行のまま不変', () => {
        const v = p();
        expect(v.NSCameraUsageDescription).toBe('Allowing access to your camera enables you to take photos or videos and attach them to messages.');
        expect(v.NSPhotoLibraryUsageDescription).toBe('Allowing access to your photo library enables you to select photos or videos and attach them to messages.');
        expect(v.NSBluetoothAlwaysUsageDescription).toBe('Enabling access to Bluetooth means we can synchronize content across your devices and clients.');
        expect(v.NSBluetoothPeripheralUsageDescription).toBe('Enabling access to Bluetooth means we can connect to audio peripherals for calls, and synchronize content across your devices and clients.');
        expect(v.NSLocationWhenInUseUsageDescription).toBe('Your location can be used to report the Wi-Fi network name to your administrator when required by your organization\'s security policy.');
    });

    it('UT-132 全 NS*UsageDescription（10キー）の値に $(PRODUCT_NAME) と mattermost（大文字小文字不問）が無い', () => {
        const entries = Object.entries(p()).filter(([k]) => (/^NS.*UsageDescription$/).test(k));
        expect(entries).toHaveLength(10);
        for (const [k, v] of entries) {
            expect({k, bad: v.includes('$(PRODUCT_NAME)') || (/mattermost/i).test(v)}).toEqual({k, bad: false});
        }
    });

    it('UT-133 CFBundleName は $(PRODUCT_NAME) のまま、CFBundleDisplayName は Weaver', () => {
        expect(p().CFBundleName).toBe('$(PRODUCT_NAME)');
        expect(p().CFBundleDisplayName).toBe('Weaver');
    });

    it('UT-134 URLスキーム: CFBundleURLSchemes は mattermost・mmauthbeta・weaver（意図的に残す。M-31）、URLName は com.mattermost', () => {
        const text: string = support.read(PLIST);
        const m = /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text);
        expect(m).not.toBeNull();
        const schemes = [...(m as RegExpExecArray)[1].matchAll(/<string>([^<]*)<\/string>/g)].map((x) => x[1]);
        expect(schemes).toEqual(['mattermost', 'mmauthbeta', 'weaver']);
        expect(p().CFBundleURLName).toBe('com.mattermost');
    });

    it('UT-135 iPad 関連: UIDeviceFamily が無く、UISupportedInterfaceOrientations~ipad と UIRequiresFullScreen が残っている（触らない決定）', () => {
        const text: string = support.read(PLIST);
        expect(text).not.toContain('<key>UIDeviceFamily</key>');
        expect(text).toContain('<key>UISupportedInterfaceOrientations~ipad</key>');
        expect(text).toContain('<key>UIRequiresFullScreen</key>');
    });
});

describe('InfoPlist.strings（C-9。M-33）', () => {
    it('UT-136 22言語の InfoPlist.strings に Mattermost を含むものが0件（空のまま）', () => {
        const files: string[] = support.walk('ios/Mattermost/i18n', ['InfoPlist.strings']);
        expect(files).toHaveLength(22);
        const hits = files.filter((f) => (/mattermost/i).test(support.read(f)));
        expect(hits).toEqual([]);
    });
});
