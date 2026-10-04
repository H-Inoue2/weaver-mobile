// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import {pick, keepLocalCopy, type DocumentPickerResponse, type FileToCopy} from '@react-native-documents/picker';
import {applicationName} from 'expo-application';
import {Alert, Linking, Platform, StatusBar} from 'react-native';
import {type Asset, type CameraOptions, type ImageLibraryOptions, type ImagePickerResponse, launchCamera, launchImageLibrary} from 'react-native-image-picker';
import Permissions from 'react-native-permissions';

import {dismissBottomSheet} from '@screens/navigation';
import {extractFileInfo, lookupMimeType} from '@utils/file';
import {logWarning} from '@utils/log';
import {safeDecodeURIComponent} from '@utils/url';

import {getWeaverMessage} from '../../../weaver/messages';

import type {IntlShape} from 'react-intl';

type PermissionSource = 'camera' | 'storage' | 'photo_android' | 'photo_ios' | 'photo';

// Weaver K-39 ビルド12: プロフィール写真モード。縮小は react-native-image-picker のネイティブ機能に任せ、
// 結果（失敗・0件・512px超・JPEG/PNG以外）を検査して、満たさなければ元画像を使わず onError を呼ぶ。
export type FilePickerOptions = {
    profileImage?: boolean;
    onError?: (error: unknown) => void;
};

const PROFILE_IMAGE_MAX_SIZE = 512;
const PROFILE_IMAGE_QUALITY = 0.8;
const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png'];

export default class FilePickerUtil {
    private readonly uploadFiles: (files: ExtractedFileInfo[]) => void;
    private readonly intl: IntlShape;
    private readonly profileImage: boolean;
    private readonly onError?: (error: unknown) => void;

    constructor(
        intl: IntlShape,
        uploadFiles: (files: ExtractedFileInfo[]) => void,
        options?: FilePickerOptions) {
        this.intl = intl;
        this.uploadFiles = uploadFiles;
        this.profileImage = Boolean(options?.profileImage);
        this.onError = options?.onError;
    }

    private getPermissionMessages = (source: PermissionSource) => {
        const {formatMessage} = this.intl;
        const permissions: Record<string, { title: string; text: string }> = {
            camera: {
                title: formatMessage(
                    {
                        id: 'mobile.camera_photo_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your camera',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.camera_photo_permission_denied_description',
                    defaultMessage:
                        'Take photos and upload them to your server or save them to your device. Open Settings to grant {applicationName} read and write access to your camera.',
                }, {applicationName}),
            },
            storage: {
                title: formatMessage(
                    {
                        id: 'mobile.storage_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your files',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.storage_permission_denied_description',
                    defaultMessage:
                        'Upload files to your server. Open Settings to grant {applicationName} Read and Write access to files on this device.',
                }, {applicationName}),
            },
            photo_ios: {
                title: formatMessage(
                    {
                        id: 'mobile.ios.photos_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.ios.photos_permission_denied_description',
                    defaultMessage:
                        'Upload photos and videos to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your photo and video library.',
                }, {applicationName}),
            },
            photo_android: {
                title: formatMessage(
                    {
                        id: 'mobile.android.photos_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.android.photos_permission_denied_description',
                    defaultMessage:
                        'Upload photos to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your photo library.',
                }, {applicationName}),
            },
        };

        return permissions[source];
    };

    private prepareFileUpload = async (files: Array<Asset | DocumentPickerResponse>) => {
        const out = await extractFileInfo(files);

        if (out.length > 0) {
            await dismissBottomSheet();
            this.uploadFiles(out);
        }
    };

    // プロフィール写真: 検査に通らない理由（通れば undefined）。寸法が取れない場合は通す（Android未確認のため）。
    private getProfileImageProblem = (files: Asset[]) => {
        if (files.length === 0) {
            return 'no assets';
        }

        for (const file of files) {
            const type = (file.type || '').toLowerCase();
            if (!PROFILE_IMAGE_TYPES.includes(type)) {
                return `unsupported type: ${type}`;
            }
            if ((typeof file.width === 'number' && file.width > PROFILE_IMAGE_MAX_SIZE) || (typeof file.height === 'number' && file.height > PROFILE_IMAGE_MAX_SIZE)) {
                return `not resized: ${file.width}x${file.height}`;
            }
        }

        return undefined;
    };

    private failProfileImage = async (reason: string) => {
        logWarning('profile image rejected', reason);
        await dismissBottomSheet();
        this.onError?.(new Error(getWeaverMessage(this.intl.locale, 'weaver.profile_image.resize_failed')));
    };

    private handleProfileImageResponse = async (response: ImagePickerResponse) => {
        if (response.didCancel) {
            return;
        }

        if (response.errorCode || response.errorMessage) {
            await this.failProfileImage(`picker error: ${response.errorCode || ''} ${response.errorMessage || ''}`);
            return;
        }

        try {
            const files = await this.getFilesFromResponse(response);
            const problem = this.getProfileImageProblem(files);
            if (problem) {
                await this.failProfileImage(problem);
                return;
            }
            await this.prepareFileUpload(files);
        } catch (error) {
            await this.failProfileImage(`exception: ${String(error)}`);
        }
    };

    private getPermissionDeniedMessage = (source?: PermissionSource) => {
        const sources = ['camera', 'storage'];
        const deniedSource: PermissionSource = Platform.select({android: 'photo_android', ios: 'photo_ios'})!;
        const msgForSource = source && sources.includes(source) ? source : deniedSource;

        return this.getPermissionMessages(msgForSource);
    };

    private getFilesFromResponse = async (response: ImagePickerResponse): Promise<Asset[]> => {
        if (!response?.assets?.length) {
            logWarning('no assets in response');
            return [];
        }

        const files: Asset[] = [];

        await Promise.all((response.assets.map(async (file) => {
            if (Platform.OS === 'ios') {
                files.push(file);
            } else if (file.uri) {
                const uri = await RNUtils.getRealFilePath(file.uri);
                const type = file.type || lookupMimeType(uri);
                let fileName = file.fileName;
                if (type.includes('video/') && uri) {
                    fileName = safeDecodeURIComponent(uri.split('\\').pop()?.split('/').pop() || '');
                }

                if (uri) {
                    files.push({...file, fileName, uri, type, width: file.width, height: file.height});
                } else {
                    logWarning('attaching file reponse return empty uri', file);
                }
            }
        })));

        return files;
    };

    private hasPhotoPermission = async (source: PermissionSource) => {
        let permissionRequest;

        const targetSource = Platform.select({
            ios: source === 'camera' ? Permissions.PERMISSIONS.IOS.CAMERA : Permissions.PERMISSIONS.IOS.PHOTO_LIBRARY,
            default: Permissions.PERMISSIONS.ANDROID.CAMERA,
        });

        const hasPhotoLibraryPermission = await Permissions.check(targetSource);

        switch (hasPhotoLibraryPermission) {
            case Permissions.RESULTS.DENIED:
                permissionRequest = await Permissions.request(targetSource);
                return permissionRequest === Permissions.RESULTS.GRANTED;
            case Permissions.RESULTS.BLOCKED: {
                const grantOption = {
                    text: this.intl.formatMessage({
                        id: 'mobile.permission_denied_retry',
                        defaultMessage: 'Settings',
                    }),
                    onPress: () => Permissions.openSettings(),
                };

                const {title, text} = this.getPermissionDeniedMessage(source);

                Alert.alert(title, text, [
                    grantOption,
                    {
                        text: this.intl.formatMessage({
                            id: 'mobile.permission_denied_dismiss',
                            defaultMessage: "Don't Allow",
                        }),
                    },
                ]);
                return false;
            }
            default: return true;
        }
    };

    private hasStoragePermission = async () => {
        if (Platform.OS === 'android' && Platform.Version < 32) {
            const storagePermission = Permissions.PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
            let permissionRequest;
            const hasPermissionToStorage = await Permissions.check(storagePermission);
            switch (hasPermissionToStorage) {
                case Permissions.RESULTS.DENIED:
                    permissionRequest = await Permissions.request(storagePermission);
                    return permissionRequest === Permissions.RESULTS.GRANTED;
                case Permissions.RESULTS.BLOCKED: {
                    const {title, text} = this.getPermissionDeniedMessage();

                    Alert.alert(title, text, [
                        {
                            text: this.intl.formatMessage({
                                id: 'mobile.permission_denied_dismiss',
                                defaultMessage: "Don't Allow",
                            }),
                        },
                        {
                            text: this.intl.formatMessage({
                                id: 'mobile.permission_denied_retry',
                                defaultMessage: 'Settings',
                            }),
                            onPress: () => Linking.openSettings(),
                        },
                    ]);
                    return false;
                }
                default: return true;
            }
        }

        return true;
    };

    attachFileFromCamera = async (customOptions?: CameraOptions) => {
        let options = customOptions;
        if (!options && this.profileImage) {
            options = {
                maxWidth: PROFILE_IMAGE_MAX_SIZE,
                maxHeight: PROFILE_IMAGE_MAX_SIZE,
                quality: PROFILE_IMAGE_QUALITY,
                mediaType: 'photo',
                saveToPhotos: false,
            };
        }
        if (!options) {
            options = {
                quality: 0.8,
                videoQuality: 'high',
                mediaType: 'photo',
                saveToPhotos: true,
            };
        }

        const hasCameraPermission = await this.hasPhotoPermission('camera');

        if (hasCameraPermission) {
            launchCamera(options, async (response: ImagePickerResponse) => {
                StatusBar.setHidden(false);

                if (this.profileImage) {
                    await this.handleProfileImageResponse(response);
                    return;
                }

                if (response.errorCode || response.didCancel) {
                    return;
                }

                const files = await this.getFilesFromResponse(response);
                await this.prepareFileUpload(files);
            });
        }
    };

    attachFileFromFiles = async (browseFileType?: string, allowMultiSelection = false) => {
        const hasPermission = await this.hasStoragePermission();
        const fileType = browseFileType ?? Platform.select({ios: 'public.item', default: '*/*'});

        if (hasPermission) {
            try {
                const picks = (await pick({allowMultiSelection, type: [fileType]}));
                const picksMap = new Map<string, DocumentPickerResponse>(picks.map((p) => [p.uri, p]));
                const files = Array.from(picksMap.values()).map((p): FileToCopy => ({
                    uri: p.uri,
                    fileName: p.name ?? 'fallbackName',
                }));

                if (files.length === 0) {
                    return {error: undefined};
                }

                const docResponse = await keepLocalCopy({
                    files: files as [FileToCopy, ...FileToCopy[]],
                    destination: 'cachesDirectory',
                });

                const proDocs = docResponse.map((d) => {
                    const source = picksMap.get(d.sourceUri);
                    if (d.status === 'success' && source) {
                        return {
                            ...source,
                            uri: d.localUri,
                        };
                    }

                    return undefined;
                });

                const docs = proDocs.filter(
                    (item): item is DocumentPickerResponse => item !== undefined,
                );

                await this.prepareFileUpload(docs);
                return {error: undefined};
            } catch (error) {
                return {error};
            }
        }

        return {error: 'no permission'};
    };

    attachFileFromPhotoGallery = async (selectionLimit = 1) => {
        const options: ImageLibraryOptions = this.profileImage ? {
            maxWidth: PROFILE_IMAGE_MAX_SIZE,
            maxHeight: PROFILE_IMAGE_MAX_SIZE,
            quality: PROFILE_IMAGE_QUALITY,
            mediaType: 'photo',
            includeBase64: false,
            selectionLimit: 1,
        } : {
            quality: 1,
            mediaType: 'mixed',
            includeBase64: false,
            selectionLimit,
        };

        const hasPermission = await this.hasPhotoPermission('photo');
        if (hasPermission) {
            launchImageLibrary(options, async (response: ImagePickerResponse) => {
                StatusBar.setHidden(false);
                if (this.profileImage) {
                    await this.handleProfileImageResponse(response);
                    return;
                }

                if (response.errorMessage || response.didCancel) {
                    logWarning('Attach failed', response.errorMessage || (response.didCancel ? 'cancelled' : ''));
                    return;
                }

                const files = await this.getFilesFromResponse(response);
                await this.prepareFileUpload(files);
            });
        }
    };
}
