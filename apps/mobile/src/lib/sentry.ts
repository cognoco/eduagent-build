// ---------------------------------------------------------------------------
// Sentry initialization for Expo/React Native
// No-ops gracefully when EXPO_PUBLIC_SENTRY_DSN is not set.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Initializes Sentry for the mobile app.
 *
 * Call at module level in the root `_layout.tsx` so it runs before
 * any component renders. Safe to call without a DSN — the SDK no-ops.
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    debug: __DEV__,
  });
}

export { Sentry };
