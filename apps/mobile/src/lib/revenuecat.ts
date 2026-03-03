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
    // No API key — running on web or keys not yet configured.
    // Silently skip; RevenueCat features will be unavailable.
    return;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);

  Purchases.configure({ apiKey });
}
