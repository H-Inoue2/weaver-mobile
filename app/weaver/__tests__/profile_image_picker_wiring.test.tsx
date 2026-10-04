// Copyright (c) 2026-present H.I. MET Architect (Weaver). See LICENSE.txt for license information.
// Part of Weaver, which is based on Mattermost Mobile (Apache-2.0).

// K-39 ビルド12: UT-PR-14 ProfileImagePicker は FilePickerUtil を profileImage モードで作り、onError を渡す
// （縮小・選択に失敗したとき、画面にエラーを出す経路。onError の先は edit_profile の resetScreen）。

import React from 'react';

import ProfileImagePicker from '@screens/edit_profile/components/profile_image_picker';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';
import FilePickerUtil from '@utils/file/file_picker';

jest.mock('@utils/file/file_picker', () => ({__esModule: true, default: jest.fn()}));

describe('プロフィール写真ピッカー画面の配線', () => {
    it('UT-PR-14 FilePickerUtil を {profileImage: true, onError} で作る', () => {
        const handler = jest.fn();
        renderWithIntlAndTheme(
            <ProfileImagePicker
                user={{id: 'u1', lastPictureUpdate: 0} as any}
                uploadFiles={jest.fn()}
                onRemoveProfileImage={jest.fn()}
                {...({onError: handler} as any)}
            />,
        );
        expect(FilePickerUtil).toHaveBeenCalled();
        const third = (FilePickerUtil as unknown as jest.Mock).mock.calls[0][2];
        expect(third.profileImage).toBe(true);
        expect(third.onError).toBe(handler);
    });
});
