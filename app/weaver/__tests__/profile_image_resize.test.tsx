// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39 ビルド12: プロフィール写真の縮小（長辺512px・JPEG品質0.8）のテスト（UT-PR-01〜13。UT-PR-14は profile_image_picker_wiring.test.tsx）。
// 設計: .claude/outputs/mobile/K39_プロフィール写真縮小_テスト設計.md（Redmineリポジトリ）
// 方式: 縮小は react-native-image-picker のネイティブ機能（maxWidth/maxHeight/quality）に任せる。
//       FilePickerUtil の第3引数 {profileImage: true, onError?} がプロフィール写真モード。
//       通常モード（チャット添付）の挙動は変えない。縮小の結果が長辺512pxを超える／JPEG・PNG以外のときは
//       元画像を使わず onError を呼ぶ。

import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import Permissions from 'react-native-permissions';

import TestHelper from '@test/test_helper';
import {extractFileInfo} from '@utils/file';
import {getIntlShape} from '@utils/general';

import FilePickerUtil from '@utils/file/file_picker';

jest.mock('react-native-image-picker');
jest.mock('@react-native-documents/picker', () => ({
    pick: jest.fn(async () => []),
    keepLocalCopy: jest.fn(async () => []),
}));
jest.mock('@screens/navigation', () => ({
    dismissBottomSheet: jest.fn(),
    bottomSheet: jest.fn(),
}));
jest.mock('@utils/file', () => ({
    extractFileInfo: jest.fn(),
    lookupMimeType: jest.fn(),
}));
jest.mock('@mattermost/rnutils', () => ({
    getRealFilePath: jest.fn(),
    isRunningInSplitView: jest.fn().mockReturnValue({isSplit: false, isTablet: false}),
    getConstants: jest.fn().mockReturnValue({
        appGroupIdentifier: 'group.mattermost.rnbeta',
        appGroupSharedDirectory: {sharedDirectory: '', databasePath: ''},
    }),
}));

const intl = getIntlShape();
const uploadFiles = jest.fn();
const onError = jest.fn();

const profileOptions = {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.8,
    mediaType: 'photo',
};

const jpeg = (width?: number, height?: number, extra = {}) => ({uri: 'file://p.jpg', type: 'image/jpeg', fileName: 'p.jpg', width, height, ...extra});

const respondCamera = (response: object) => (launchCamera as jest.Mock).mockImplementation((_o, cb) => cb(response));
const respondGallery = (response: object) => (launchImageLibrary as jest.Mock).mockImplementation((_o, cb) => cb(response));

describe('プロフィール写真の縮小（FilePickerUtil profileImage モード）', () => {
    let util: FilePickerUtil;

    beforeEach(() => {
        (Permissions.check as jest.Mock).mockResolvedValue(Permissions.RESULTS.GRANTED);
        (extractFileInfo as jest.Mock).mockImplementation(async (files: any[]) => files.map((f) => ({uri: f.uri, type: f.type, width: f.width, height: f.height})));
        util = new FilePickerUtil(intl, uploadFiles, {profileImage: true, onError} as any);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('選択・撮影のオプション', () => {
        it('UT-PR-01 カメラ: 長辺512px・品質0.8・写真のみで起動する', async () => {
            respondCamera({didCancel: true});
            await util.attachFileFromCamera();
            expect(launchCamera).toHaveBeenCalledTimes(1);
            expect((launchCamera as jest.Mock).mock.calls[0][0]).toMatchObject(profileOptions);
        });

        it('UT-PR-02 ギャラリー: 長辺512px・品質0.8・写真のみ（video除外）・1枚・base64なし', async () => {
            respondGallery({didCancel: true});
            await util.attachFileFromPhotoGallery();
            expect(launchImageLibrary).toHaveBeenCalledTimes(1);
            expect((launchImageLibrary as jest.Mock).mock.calls[0][0]).toMatchObject({...profileOptions, selectionLimit: 1, includeBase64: false});
        });

        it('UT-PR-03 通常モード（第3引数なし）は従来のまま: ギャラリーは quality 1・mixed・縮小指定なし、カメラは quality 0.8・縮小指定なし', async () => {
            const normal = new FilePickerUtil(intl, uploadFiles);
            respondGallery({didCancel: true});
            respondCamera({didCancel: true});
            await normal.attachFileFromPhotoGallery();
            await normal.attachFileFromCamera();
            expect(launchImageLibrary).toHaveBeenCalledWith({quality: 1, mediaType: 'mixed', includeBase64: false, selectionLimit: 1}, expect.any(Function));
            const cameraOptions = (launchCamera as jest.Mock).mock.calls[0][0];
            expect(cameraOptions.quality).toBe(0.8);
            expect(cameraOptions.maxWidth).toBeUndefined();
            expect(cameraOptions.maxHeight).toBeUndefined();
        });
    });

    describe('縮小結果の検査（元画像を使わない）', () => {
        it('UT-PR-04 縮小済み（512x384 JPEG）はアップロードに渡る。onError は呼ばれない', async () => {
            respondGallery({assets: [jpeg(512, 384)]});
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(uploadFiles).toHaveBeenCalledTimes(1);
            expect(onError).not.toHaveBeenCalled();
        });

        it('UT-PR-05 小さい画像（200x150）は拡大されず、そのままアップロードに渡る（境界: 長辺が512以下なら通す）', async () => {
            respondCamera({assets: [jpeg(200, 150)]});
            await util.attachFileFromCamera();
            await TestHelper.wait(50);
            expect(uploadFiles).toHaveBeenCalledTimes(1);
            expect(onError).not.toHaveBeenCalled();
        });

        it.each([[513, 100], [100, 513], [3024, 4032]])('UT-PR-06 縮小されていない（%ix%i）とき、元画像を使わず onError を呼び、アップロードしない', async (w, h) => {
            respondGallery({assets: [jpeg(w, h)]});
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(uploadFiles).not.toHaveBeenCalled();
            expect(extractFileInfo).not.toHaveBeenCalled();
            expect(onError).toHaveBeenCalledTimes(1);
        });

        it('UT-PR-07 PNG（512x512）は通る（縮小後もPNGのまま。サーバーが受け付ける形式）', async () => {
            respondCamera({assets: [{uri: 'file://p.png', type: 'image/png', fileName: 'p.png', width: 512, height: 512}]});
            await util.attachFileFromCamera();
            await TestHelper.wait(50);
            expect(uploadFiles).toHaveBeenCalledTimes(1);
            expect(onError).not.toHaveBeenCalled();
        });

        it.each([['image/jpg'], ['image/jpeg'], ['image/png'], ['IMAGE/JPG']])('UT-PR-17 縮小済み（512x384）の type=%s は通る（iOSのピッカーは image/jpg を返す。実機ビルド12で判明）', async (type) => {
            respondGallery({assets: [{uri: 'file:///tmp/ABCD-1234.jpg', type, fileName: 'ABCD-1234.jpg', width: 512, height: 384}]});
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(uploadFiles).toHaveBeenCalledTimes(1);
            expect(onError).not.toHaveBeenCalled();
        });

        it.each([['image/gif'], ['image/webp'], ['image/heic'], ['']])('UT-PR-18 type=%p は縮小済みでも拒否する（onError・アップロードなし）', async (type) => {
            respondCamera({assets: [{uri: 'file:///tmp/x.gif', type, fileName: 'x', width: 100, height: 100}]});
            await util.attachFileFromCamera();
            await TestHelper.wait(50);
            expect(uploadFiles).not.toHaveBeenCalled();
            expect(onError).toHaveBeenCalledTimes(1);
        });

        it.each([['image/heic'], ['image/heif']])('UT-PR-08 変換されていない %s は、元画像を使わず onError を呼び、アップロードしない', async (type) => {
            respondGallery({assets: [{uri: 'file://p.heic', type, fileName: 'p.heic', width: 512, height: 384}]});
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(uploadFiles).not.toHaveBeenCalled();
            expect(onError).toHaveBeenCalledTimes(1);
        });
    });

    describe('失敗・取消', () => {
        it('UT-PR-09 カメラの失敗（errorCode）は onError を呼び、アップロードしない', async () => {
            respondCamera({errorCode: 'camera_unavailable', errorMessage: 'no camera'});
            await util.attachFileFromCamera();
            await TestHelper.wait(50);
            expect(onError).toHaveBeenCalledTimes(1);
            expect(uploadFiles).not.toHaveBeenCalled();
        });

        it('UT-PR-10 ギャラリーの失敗（errorMessage）は onError を呼び、アップロードしない', async () => {
            respondGallery({errorCode: 'others', errorMessage: 'resize failed'});
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(onError).toHaveBeenCalledTimes(1);
            expect(uploadFiles).not.toHaveBeenCalled();
        });

        it('UT-PR-11 取消（didCancel）はエラーにしない。onError もアップロードも無し（カメラ・ギャラリーとも）', async () => {
            respondCamera({didCancel: true});
            respondGallery({didCancel: true});
            await util.attachFileFromCamera();
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(onError).not.toHaveBeenCalled();
            expect(uploadFiles).not.toHaveBeenCalled();
        });

        it('UT-PR-12 取消でも失敗でもないのに画像が0件のときは onError を呼び、アップロードしない', async () => {
            respondGallery({assets: []});
            await util.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(onError).toHaveBeenCalledTimes(1);
            expect(uploadFiles).not.toHaveBeenCalled();
        });

        it('UT-PR-13 onError を渡さなくても、失敗時に例外を出さず、アップロードもしない', async () => {
            const noHandler = new FilePickerUtil(intl, uploadFiles, {profileImage: true} as any);
            respondGallery({assets: [jpeg(4000, 3000)]});
            await expect(noHandler.attachFileFromPhotoGallery()).resolves.not.toThrow();
            await TestHelper.wait(50);
            expect(uploadFiles).not.toHaveBeenCalled();
        });
    });

    describe('失敗文言（言語別）', () => {
        it.each([['ja', '写真を設定できませんでした。別の写真を選ぶか、もう一度お試しください。'], ['en', 'The photo could not be prepared. Please choose another photo (JPEG or PNG) and try again.']])('UT-PR-16 失敗時に onError へ渡る Error の文言（%s）が weaver 文言表の値と一致する', async (locale, message) => {
            const localized = new FilePickerUtil(getIntlShape(locale), uploadFiles, {profileImage: true, onError} as any);
            respondGallery({assets: [jpeg(4000, 3000)]});
            await localized.attachFileFromPhotoGallery();
            await TestHelper.wait(50);
            expect(onError).toHaveBeenCalledTimes(1);
            expect((onError.mock.calls[0][0] as Error).message).toBe(message);
        });
    });
});
