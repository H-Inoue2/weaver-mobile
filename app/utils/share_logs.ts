// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-39, 2026-10): default support link and email subject use Weaver instead of Mattermost.

import TurboLogger from '@mattermost/react-native-turbo-log';
import {defineMessages} from 'react-intl';
import {Alert} from 'react-native';
import Share from 'react-native-share';

import {pathWithPrefix} from '@utils/file';

import {APP_NAME, SUPPORT_URL} from '../weaver/constants';

import type {ReportAProblemMetadata} from '@typings/screens/report_a_problem';

const buildEmailBody = (metadata: ReportAProblemMetadata) => [
    'Please share a description of the problem with reproduction steps:',
    '',
    '',
    'You may also attach the mobile logs and any relevant screen captures.',
    '',
    'App metadata',
    metadataToString(metadata),
].join('\n');

export const shareLogs = async (metadata: ReportAProblemMetadata, siteName: string | undefined, reportAProblemMail: string | undefined, excludeLogs: boolean = false) => {
    try {
        const logPaths = await TurboLogger.getLogPaths();
        const attachments = excludeLogs ? [] : logPaths.map((path) => pathWithPrefix('file://', path));
        await Share.open({
            subject: `Problem with ${siteName || APP_NAME} mobile app`,
            email: reportAProblemMail,
            failOnCancel: false,
            urls: attachments.length ? attachments : undefined,
            message: buildEmailBody(metadata),
        });
    } catch (e: unknown) {
        Alert.alert('Error', `${e}`);
    }
};

export const emailLogs = async (metadata: ReportAProblemMetadata, siteName: string | undefined, reportAProblemMail: string | undefined, excludeLogs: boolean = false) => {
    try {
        const logPaths = await TurboLogger.getLogPaths();
        const attachments = excludeLogs ? [] : logPaths.map((path) => pathWithPrefix('file://', path));
        await Share.shareSingle({
            social: Share.Social.EMAIL as any, // The type is not correct in the library
            subject: `Problem with ${siteName || APP_NAME} mobile app`,
            email: reportAProblemMail,
            urls: attachments.length ? attachments : undefined,
            message: buildEmailBody(metadata),
        });
    } catch (e: unknown) {
        Alert.alert('Error', `${e}`);
    }
};

// The argument is kept for signature compatibility with the callers; Weaver uses one support page for both editions.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getDefaultReportAProblemLink = (isLicensed: boolean) => {
    return SUPPORT_URL;
};

export function metadataToString(metadata: ReportAProblemMetadata): string {
    return Object.entries(metadata).
        map(([key, value]) => `${reportAProblemMessages[key as keyof ReportAProblemMetadata].defaultMessage}: ${value}`).
        join('\n');
}

export const reportAProblemMessages = defineMessages({
    currentUserId: {
        id: 'report_a_problem.metadata.currentUserId',
        defaultMessage: 'Current User ID',
    },
    currentTeamId: {
        id: 'report_a_problem.metadata.currentTeamId',
        defaultMessage: 'Current Team ID',
    },
    serverVersion: {
        id: 'report_a_problem.metadata.serverVersion',
        defaultMessage: 'Server Version',
    },
    appVersion: {
        id: 'report_a_problem.metadata.appVersion',
        defaultMessage: 'App Version',
    },
    appPlatform: {
        id: 'report_a_problem.metadata.appPlatform',
        defaultMessage: 'App Platform',
    },
    deviceModel: {
        id: 'report_a_problem.metadata.deviceModel',
        defaultMessage: 'Device Model',
    },
});
