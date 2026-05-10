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

import type { EventHint } from '@sentry/core';
import * as Sentry from '@sentry/react-native';

/** Read DSN lazily so tests can set it after module load. */
function getSentryDsn(): string | undefined {
  return process.env.EXPO_PUBLIC_SENTRY_DSN;
}

type ErrorEventLike = {
  message?: unknown;
  filename?: unknown;
  lineno?: unknown;
  colno?: unknown;
  error?: unknown;
  type?: unknown;
};

function isErrorEventLike(value: unknown): value is ErrorEventLike {
  if (value == null || typeof value !== 'object') return false;
  // ErrorEvent has filename + lineno; plain Error does not.
  return 'filename' in value && 'lineno' in value;
}

/**
 * Unwrap stringified ErrorEvent payloads so issue titles are readable.
 *
 * RN's XHR-based fetch polyfill and several global error handlers can pass
 * a DOM-shaped ErrorEvent into Sentry's capture path. Sentry's default
 * serializer falls back to String(errorEvent), which produces the useless
 * "[object ErrorEvent]" message — losing the actual message, file, and
 * source location. This rebuilds the exception value from the event's own
 * properties before the event leaves the SDK.
 */
export function unwrapErrorEvent<T extends Sentry.ErrorEvent>(
  event: T,
  hint?: EventHint,
): T {
  const original = hint?.originalException;
  if (!isErrorEventLike(original)) return event;

  const inner = original.error;
  const innerMessage =
    inner instanceof Error && inner.message ? inner.message : null;
  const ownMessage =
    typeof original.message === 'string' && original.message
      ? original.message
      : null;
  const message =
    innerMessage ??
    ownMessage ??
    `Unhandled ErrorEvent at ${String(original.filename)}:${String(
      original.lineno,
    )}:${String(original.colno)}`;

  if (event.exception?.values?.[0]) {
    event.exception.values[0].value = message;
    event.exception.values[0].type =
      inner instanceof Error && inner.name ? inner.name : 'ErrorEvent';
  } else {
    event.message = message;
  }
  event.extra = {
    ...event.extra,
    errorEventFilename: original.filename,
    errorEventLineno: original.lineno,
    errorEventColno: original.colno,
    errorEventType: original.type,
  };
  return event;
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
      beforeSend(event, hint) {
        if (!sentryActive) return null;
        return unwrapErrorEvent(event, hint);
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
  // BS-07: clear full scope (breadcrumbs, tags, extras) for COPPA/GDPR compliance
  Sentry.getCurrentScope().clear();
  Sentry.setUser(null);
  // BS-06: close the native transport to prevent native crash envelopes
  // (which bypass beforeSend) from reaching Sentry for underage users.
  // The SDK stays closeable — re-enabling calls init() again if needed.
  const client = Sentry.getClient();
  if (client) {
    void client.close(0);
    sentryEverInitialized = false;
  }
}

/** Returns whether Sentry is currently active. */
export function isSentryEnabled(): boolean {
  return sentryActive;
}

/** Calculates age from a birth year using the current calendar year.
 *  Year-only approximation always rounds UP (overestimates age by up to 11
 *  months), so the result errs toward *less* protection — consent/Sentry gates
 *  must use `<=` thresholds to compensate (e.g., `age <= 16` not `age < 16`).
 */
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
  consentStatus: string | null,
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
    age <= 16 &&
    (consentStatus === 'WITHDRAWN' || consentStatus === 'PENDING')
  ) {
    // 13–16 with withdrawn/pending consent: disable — parent opted out of data processing
    disableSentry();
  } else {
    // 13–16 with active consent, or 17+: enable
    enableSentry();
  }
}

/** @internal Test-only: resets module state so each test gets a clean slate. */
export function _resetSentryState(): void {
  sentryEverInitialized = false;
  sentryActive = false;
}

export { Sentry };
