// ---------------------------------------------------------------------------
// Sentry initialization for Expo/React Native — Age-gated (Story 10.14)
//
// Apple scrutinizes Sentry for under-13 users even under Education category.
// Age groups:
//   Under 13 → disabled until consent status is CONSENTED
//   13–15    → enabled (parental consent covers it)
//   16+      → enabled (no consent needed)
//
// No-ops gracefully when EXPO_PUBLIC_SENTRY_DSN is not set.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/react-native';

/** Read DSN lazily so tests can set it after module load. */
function getSentryDsn(): string | undefined {
  return process.env.EXPO_PUBLIC_SENTRY_DSN;
}

let sentryInitialized = false;

/**
 * Initializes Sentry unconditionally. Call for profiles that are 13+ or
 * under-13 with CONSENTED status.
 */
export function enableSentry(): void {
  if (!getSentryDsn() || sentryInitialized) return;

  Sentry.init({
    dsn: getSentryDsn(),
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    debug: __DEV__,
  });
  sentryInitialized = true;
}

/**
 * Disables Sentry by closing the client. Used when switching to an under-13
 * profile without consent.
 */
export function disableSentry(): void {
  if (!sentryInitialized) return;

  const client = Sentry.getClient();
  if (client) {
    client.close();
  }
  sentryInitialized = false;
}

/** Returns whether Sentry is currently initialized. */
export function isSentryEnabled(): boolean {
  return sentryInitialized;
}

/**
 * Calculates age from a birth date string (YYYY-MM-DD).
 */
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Evaluates whether Sentry should be enabled for the given profile.
 *
 * @param birthDate - Profile birth date (YYYY-MM-DD) or null
 * @param consentStatus - Current consent status or null
 */
export function evaluateSentryForProfile(
  birthDate: string | null,
  consentStatus: string | null
): void {
  if (!getSentryDsn()) return;

  // No birth date → can't determine age → enable (adult assumed)
  if (!birthDate) {
    enableSentry();
    return;
  }

  const age = calculateAge(birthDate);

  if (age < 13) {
    // Under 13: only enable if consent is CONSENTED
    if (consentStatus === 'CONSENTED') {
      enableSentry();
    } else {
      disableSentry();
    }
  } else {
    // 13+: always enable
    enableSentry();
  }
}

export { Sentry };
