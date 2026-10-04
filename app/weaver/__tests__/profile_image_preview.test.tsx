// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39 ビルド13: プロフィール写真を選んだ直後のプレビュー（UT-PV-01〜04）。
// 期待仕様: 選んだ（縮小済みの）画像の直後に、アバターが「選んだ画像」の表示に変わる。
//   サーバーの画像と同じキャッシュキー（cacheKey）のまま別URIを渡すと、expo-imageはキャッシュ済みのサーバー画像を出し続けるため、
//   プレビューのときはキャッシュキーを、サーバー画像（user-<id>-<最終更新>）と必ず別にする。
//   保存を押すまではアップロードしない（onUpdateProfilePicture で localPath を親に渡すだけ）。画面を閉じれば（作り直せば）元のサーバー画像に戻る。

import {act, screen} from '@testing-library/react-native';
import React from 'react';

import EditProfilePicture from '@screens/edit_profile/components/edit_profile_picture';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

let mockUploadFiles: ((files: any[]) => void) | undefined;
jest.mock('@screens/edit_profile/components/profile_image_picker', () => ({
    __esModule: true,
    default: ({uploadFiles}: {uploadFiles: (files: any[]) => void}) => {
        mockUploadFiles = uploadFiles;
        return null;
    },
}));
jest.mock('@actions/remote/user', () => ({
    buildProfileImageUrlFromUser: jest.fn(() => '/api/v4/users/u1/image?_=1700000000000'),
    uploadUserProfileImage: jest.fn(),
}));

const user = {id: 'u1', lastPictureUpdate: 1700000000000} as any;
const LOCAL = 'file:///var/mobile/Containers/tmp/ABCD-1234.jpg';

// 描画された画像のうち、source を持つもの（サーバー画像またはプレビュー）を返す
const imageSources = (root: any) => {
    const found: any[] = [];
    root.findAll((n: any) => n.props && n.props.source && (Array.isArray(n.props.source) || typeof n.props.source === 'object')).forEach((n: any) => {
        const s = Array.isArray(n.props.source) ? n.props.source[0] : n.props.source;
        if (s && s.uri) {
            found.push(s);
        }
    });
    return found;
};

describe('プロフィール写真のプレビュー', () => {
    beforeEach(() => {
        mockUploadFiles = undefined;
    });

    it('UT-PV-01 選ぶ前は、サーバーの画像（/api/v4/users/u1/image）を表示する', () => {
        const {UNSAFE_root} = renderWithIntlAndTheme(
            <EditProfilePicture
                user={user}
                onUpdateProfilePicture={jest.fn()}
                onError={jest.fn()}
            />,
        );
        const uris = imageSources(UNSAFE_root).map((s) => s.uri);
        expect(uris.some((u) => u.includes('/api/v4/users/u1/image'))).toBe(true);
    });

    it('UT-PV-02 選んだ直後に、選んだ画像のURIを表示する（サーバー画像のURIは出ない）', () => {
        const {UNSAFE_root} = renderWithIntlAndTheme(
            <EditProfilePicture
                user={user}
                onUpdateProfilePicture={jest.fn()}
                onError={jest.fn()}
            />,
        );
        act(() => {
            mockUploadFiles!([{localPath: LOCAL}]);
        });
        const uris = imageSources(UNSAFE_root).map((s) => s.uri);
        expect(uris.some((u) => u.includes('ABCD-1234.jpg'))).toBe(true);
        expect(uris.some((u) => u.includes('/api/v4/users/u1/image'))).toBe(false);
    });

    it('UT-PV-03 プレビューの cacheKey は、サーバー画像の cacheKey と異なる（同じだとキャッシュ済みのサーバー画像が出続ける）', () => {
        const {UNSAFE_root} = renderWithIntlAndTheme(
            <EditProfilePicture
                user={user}
                onUpdateProfilePicture={jest.fn()}
                onError={jest.fn()}
            />,
        );
        const before = imageSources(UNSAFE_root).find((s) => s.uri.includes('/api/v4/') && s.cacheKey)?.cacheKey;
        act(() => {
            mockUploadFiles!([{localPath: LOCAL}]);
        });
        const preview = imageSources(UNSAFE_root).find((s) => s.uri.includes('ABCD-1234.jpg') && s.cacheKey);
        expect(before).toBeDefined();
        expect(preview).toBeDefined();
        expect(preview!.cacheKey).not.toBe(before);
    });

    it('UT-PV-04 選んだだけではアップロードしない（親へ localPath を渡すだけ）。画面を作り直すと元のサーバー画像に戻る', () => {
        const onUpdate = jest.fn();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const {uploadUserProfileImage} = require('@actions/remote/user');
        const first = renderWithIntlAndTheme(
            <EditProfilePicture
                user={user}
                onUpdateProfilePicture={onUpdate}
                onError={jest.fn()}
            />,
        );
        act(() => {
            mockUploadFiles!([{localPath: LOCAL}]);
        });
        expect(onUpdate).toHaveBeenCalledWith({isRemoved: false, localPath: LOCAL});
        expect(uploadUserProfileImage).not.toHaveBeenCalled();
        first.unmount();

        const second = renderWithIntlAndTheme(
            <EditProfilePicture
                user={user}
                onUpdateProfilePicture={jest.fn()}
                onError={jest.fn()}
            />,
        );
        const uris = imageSources(second.UNSAFE_root).map((s) => s.uri);
        expect(uris.some((u) => u.includes('/api/v4/users/u1/image'))).toBe(true);
        expect(uris.some((u) => u.includes('ABCD-1234.jpg'))).toBe(false);
        expect(screen).toBeDefined();
    });
});
