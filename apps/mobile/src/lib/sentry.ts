// ---------------------------------------------------------------------------
// Sentry initialization for Expo/React Native — Age-gated (Story 10.14)
//
// Apple scrutinizes Sentry for under-13 users even under Education category.
// Age groups:
//   Under 13 → disabled until consent status is CONSENTED
//   13–15    → disabled if consent is WITHDRAWN or PENDING
//   16+      → enabled (no consent needed)
//
// No-ops gracefully when EXPO_PUBLIC_SENTRY_DSN is not set.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/react-native';

/** Read DSN lazily so tests can set it after module load. */
function getSentryDsn(): string | undefined {
  return process.env.EXPO_PUBLIC_SENTRY_DSN;
}

/** Whether Sentry.init() has ever been called (call at most once). */
let sentryEverInitialized = false;
/** Whether Sentry is currently active (events are sent). */
let sentryActive = false;

/**
 * Enables Sentry. On the first call this initializes the SDK; subsequent
 * calls re-enable the existing client via `beforeSend` gate.
 *
 * Sentry.init() is NOT idempotent — calling it twice registers duplicate
 * native crash handlers and transport instances. We guard against this with
 * `sentryEverInitialized` and use `beforeSend` to gate event delivery.
 */
export function enableSentry(): void {
  if (!getSentryDsn() || sentryActive) return;

  if (!sentryEverInitialized) {
    Sentry.init({
      dsn: getSentryDsn(),
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,
      debug: __DEV__,
      beforeSend(event) {
        return sentryActive ? event : null;
      },
      beforeSendTransaction(event) {
        return sentryActive ? event : null;
      },
    });
    sentryEverInitialized = true;
  }
  sentryActive = true;
}

/**
 * Disables Sentry by gating `beforeSend`. The SDK stays initialized (no
 * `client.close()`) so re-enabling is safe without a second `init()`.
 */
export function disableSentry(): void {
  if (!sentryActive) return;
  sentryActive = false;
  Sentry.setUser(null);
}

/** Returns whether Sentry is currently active. */
export function isSentryEnabled(): boolean {
  return sentryActive;
}

/** Calculates age from a birth year using the current calendar year. */
function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

/**
 * Evaluates whether Sentry should be enabled for the given profile.
 *
 * @param birthYear - Profile birth year or null
 * @param consentStatus - Current consent status or null
 */
export function evaluateSentryForProfile(
  birthYear: number | null,
  consentStatus: string | null
): void {
  if (!getSentryDsn()) return;

  // No birth year → can't determine age → enable (adult assumed)
  if (birthYear == null) {
    enableSentry();
    return;
  }

  const age = calculateAge(birthYear);

  if (age < 13) {
    // Under 13: only enable if consent is CONSENTED
    if (consentStatus === 'CONSENTED') {
      enableSentry();
    } else {
      disableSentry();
    }
  } else if (
    age < 16 &&
    (consentStatus === 'WITHDRAWN' || consentStatus === 'PENDING')
  ) {
    // 13–15 with withdrawn/pending consent: disable — parent opted out of data processing
    disableSentry();
  } else {
    // 13–15 with active consent, or 16+: enable
    enableSentry();
  }
}

/** @internal Test-only: resets module state so each test gets a clean slate. */
export function _resetSentryState(): void {
  sentryEverInitialized = false;
  sentryActive = false;
}

export { Sentry };
