// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Modified for Weaver (K-39, 2026-10): SSO redirect URLs are ignored before any deep link handling (no invalid-link alert after login).

import {Linking} from 'react-native';
import urlParse from 'url-parse';

import {DEFAULT_LOCALE} from '@i18n';
import {alertInvalidDeepLink, parseAndHandleDeepLink} from '@utils/deep_link';
import {getIntlShape} from '@utils/general';
import {logDebug} from '@utils/log';

import {isSsoCallbackUrl} from '../weaver/sso_callback_url';

/**
 * Custom native intent handler for expo-router
 * This replaces expo-router's default deep link handling with our custom logic
 *
 * Expo-router will use this instead of setting up its own Linking.addEventListener
 * This prevents the "multiple linking configurations" error
 */

const handleUrl = async (event: {url: string}) => {
    if (__DEV__) {
        // Development only. The query string (login code, tokens) is never logged.
        logDebug('[weaver] handleUrl', event.url?.split('?')[0], 'sso:', isSsoCallbackUrl(event.url));
    }

    // Ignore SSO redirect URLs (with or without the scheme). The SSO screen handles them.
    if (isSsoCallbackUrl(event.url)) {
        return true;
    }

    const parsed = urlParse(event.url);
    if (parsed.protocol && !parsed.host) {
        return false;
    }

    if (event.url) {
        const {error} = await parseAndHandleDeepLink(
            event.url,
            undefined,
            undefined,
            true,
        );

        if (error) {
            alertInvalidDeepLink(getIntlShape(DEFAULT_LOCALE));
            return false;
        }

        return true;
    }

    return false;
};

/**
 * Set up custom deep link event listener
 * Expo-router calls this function to subscribe to URL events
 */
export const addEventListener = () => {
    // Set up our custom deep link listener
    // Subscribe to URL events
    const subscription = Linking.addEventListener('url', handleUrl);

    // Return unsubscribe function
    return () => {
        subscription.remove();
    };
};

/**
 * Optional: Redirect system paths if needed
 * We don't need custom redirection, so just return the path as-is
 *
 * Exception: SSO callback URLs (mmauth://, mmauthbeta://) are consumed by the
 * SSO screen's own Linking listener. If they reach expo-router they resolve to
 * an unregistered route. Returning null keeps the app on its current path.
 */
export async function redirectSystemPath(options: {path: string; initial: boolean}) {
    const handled = await handleUrl({url: options.path});
    if (handled) {
        return null;
    }

    return options.path;
}
