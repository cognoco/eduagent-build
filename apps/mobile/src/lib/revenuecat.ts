// ---------------------------------------------------------------------------
// RevenueCat SDK configuration — native in-app purchases (Epic 9)
//
// Apple/Google require native IAP for digital services (AI tutoring).
// Existing Stripe code stays intact for future web client.
// ---------------------------------------------------------------------------

import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * Returns the platform-specific RevenueCat API key.
 * Reads environment variables at call time so tests can set them dynamically.
 * Returns an empty string for unsupported platforms (web).
 */
export function getRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? '';
  }
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? '';
  }
  return '';
}

/**
 * Configures the RevenueCat SDK with the platform-specific API key.
 *
 * Call once at app startup, before auth providers render.
 * No-ops gracefully when API key is not set (e.g. dev/web).
 *
 * Log level: DEBUG in dev builds, WARN in production.
 */
export function configureRevenueCat(): void {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey) {
    // BUG-78: Always log when API key is missing, not just in dev.
    // On web this is expected (no native IAP), but on iOS/Android a missing
    // key means purchases are silently broken.
    if (Platform.OS === 'web') {
      return; // expected — web has no native IAP
    }
    const message = `[RevenueCat] API key not configured for ${Platform.OS}; purchases are disabled in this build`;
    if (__DEV__) {
      console.warn(message);
    } else {
      // Production: use console.error so crash reporters / log aggregators
      // surface the misconfiguration rather than silently disabling purchases.
      console.error(message);
    }
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);

  Purchases.configure({ apiKey });
}
