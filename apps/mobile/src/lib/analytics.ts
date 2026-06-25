import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';

import { Sentry } from './sentry';

export type HomeworkOcrGateSource = 'local' | 'server';
export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type HomeworkOcrGateTelemetry = {
  source?: HomeworkOcrGateSource;
  tokens: number;
  words: number;
  confidence?: number;
  droppedCount?: number;
};

function emitHomeworkOcrGateEvent(
  event: string,
  payload: HomeworkOcrGateTelemetry,
): void {
  Sentry.addBreadcrumb({
    category: 'analytics.homework_ocr_gate',
    level: 'info',
    message: event,
    data: {
      ...payload,
      ...(payload.confidence == null
        ? {}
        : { confidence: Number(payload.confidence.toFixed(3)) }),
    },
  });
}

export function track(
  event: string,
  properties: AnalyticsProperties = {},
): void {
  Sentry.addBreadcrumb({
    category: 'analytics',
    level: 'info',
    message: event,
    data: {
      event,
      ...properties,
    },
  });
}

/**
 * [WI-315 / DS-226] Pseudonymise a profile ID for analytics tags.
 *
 * Pre-fix this used dual-FNV (non-cryptographic, 64 bits of output) keyed
 * by `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1` and silently fell back to a
 * hardcoded string `local-analytics-key-v1` when the env var was unset.
 * FNV has known weaknesses for keyed constructions, and the silent
 * hardcoded fallback meant the privacy boundary the function claims to
 * provide collapsed in any production build where the env var hadn't been
 * injected.
 *
 * This implementation:
 *   - Uses HMAC-SHA256 via @noble/hashes (pure JS, synchronous so the
 *     caller-facing sync signature survives without rippling an async
 *     refactor through use-mode-switch.ts, use-clone-from-child.ts,
 *     progress/index.tsx).
 *   - Truncates to the first 16 bytes (32 hex chars) — enough to keep
 *     Sentry tag values short while remaining well above collision risk
 *     across the user base.
 *   - Bumps the output prefix to `v3_` so downstream consumers can
 *     distinguish v2 (FNV) from v3 (HMAC-SHA256) hashes during the
 *     transition.
 *   - Drops the silent production fallback: throws when the env var is
 *     missing and `__DEV__` is false. In dev, allows a clearly-named
 *     dev-only fallback (so a leaked dev hash can never be confused with
 *     a prod hash later).
 *
 * Residual limitation: `EXPO_PUBLIC_*` env vars are by construction baked
 * into the client bundle at build time and therefore extractable from the
 * app binary by anyone with the IPA/APK. This change closes the
 * FNV-weakness and silent-hardcoded-fallback gaps. Closing the
 * public-key gap requires moving the hash computation to the server side
 * — tracked separately.
 */
const DEV_FALLBACK_SECRET = 'DEV-ONLY-not-for-prod-analytics-hash-key';

// One-shot guard so a misconfigured production build (env var missing)
// surfaces in Sentry exactly once per session, not on every tap.
let unkeyedWarningEmitted = false;

function bytesToHex(bytes: Uint8Array, take: number): string {
  let hex = '';
  for (let i = 0; i < take; i += 1) {
    // `noUncheckedIndexedAccess` widens bytes[i] to `number | undefined`;
    // the loop bound guarantees in-range, so coerce with `?? 0` rather
    // than a non-null assertion to keep eslint happy.
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

export function hashProfileId(profileId: string): string {
  // Guard against an empty/missing profile ID flowing in from a
  // not-yet-loaded auth state (Clerk hydration race). Without this, the
  // prod-no-key path below collides every empty call into the well-known
  // `sha256('')` constant and funnel analysis silently misattributes
  // every pre-auth event to one Sentry bucket. Surface the misuse with a
  // sentinel that won't collide with any real hash output.
  if (!profileId) {
    return 'v3_invalid_empty';
  }
  const envSecret = process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
  if (envSecret) {
    // Truncate to 16 bytes / 32 hex chars. 128-bit truncation gives a
    // ~50% birthday-collision probability at ~2^64 inputs — orders of
    // magnitude above any plausible profile count. Shorter tags are also
    // friendlier in Sentry's UI than a full 64-char SHA-256.
    return `v3_${bytesToHex(hmac(sha256, envSecret, profileId), 16)}`;
  }

  if ((global as { __DEV__?: boolean }).__DEV__) {
    // Dev: known-bad fallback, clearly marked so a leaked dev hash can
    // never be confused with a prod hash.
    return `v3_${bytesToHex(hmac(sha256, DEV_FALLBACK_SECRET, profileId), 16)}`;
  }

  // Production with no key provisioned. Earlier this fell back silently to
  // a hardcoded constant — a privacy regression dressed as a hash.
  // Throwing would crash user-facing tap handlers (use-clone-from-child,
  // progress/empty-state CTA, etc.) since `hashProfileId(...)` evaluates
  // inside the analytics-payload literal before `track(...)` runs. Instead:
  //   - Emit an `unkeyed_` tag so the missing-key state is visible in
  //     Sentry's tag values (operators can filter on `profile_id_hash
  //     starts_with unkeyed_`) without leaking the raw profile ID.
  //   - Raise one warning message per session so the misconfiguration
  //     can't hide for long.
  // The keyless SHA-256 still provides per-user funnel correlation; it
  // does NOT provide a privacy boundary, which is fine because the
  // pre-fix hardcoded-fallback path also provided none.
  if (!unkeyedWarningEmitted) {
    unkeyedWarningEmitted = true;
    try {
      // [#887] captureMessage, not addBreadcrumb: a breadcrumb only rides
      // along on a later captured event, so the privacy-boundary degradation
      // stays invisible in a session that is otherwise healthy. A message
      // event is independently queryable/alertable in Sentry.
      Sentry.captureMessage(
        'analytics.hashProfileId: EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 missing — ' +
          'emitting `unkeyed_` tags. Provision the key via Doppler/EAS env injection.',
        'warning',
      );
    } catch {
      // Sentry not initialised yet (early-boot call); the next call attempts again.
      unkeyedWarningEmitted = false;
    }
  }
  return `v3_unkeyed_${bytesToHex(sha256(profileId), 12)}`;
}

// Test-only escape hatch to reset the one-shot warning latch between
// production-path assertions. Not used in production code paths.
export const __TEST_ONLY__ = {
  resetUnkeyedWarning(): void {
    unkeyedWarningEmitted = false;
  },
};

export function bucketAccountAge(createdAt: string | null | undefined): string {
  if (!createdAt) return '0-7';
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return '0-7';
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - createdAtMs) / 86_400_000),
  );
  if (ageDays <= 7) return '0-7';
  if (ageDays <= 30) return '8-30';
  if (ageDays <= 90) return '31-90';
  return '91+';
}

export function trackHomeworkOcrGateAccepted(
  payload: HomeworkOcrGateTelemetry & { source: HomeworkOcrGateSource },
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_accepted', payload);
}

export function trackHomeworkOcrGateRejected(
  payload: HomeworkOcrGateTelemetry & { source: HomeworkOcrGateSource },
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_rejected', payload);
}

export function trackHomeworkOcrGateShortcircuit(
  payload: HomeworkOcrGateTelemetry,
): void {
  emitHomeworkOcrGateEvent('homework_ocr_gate_shortcircuit', payload);
}
