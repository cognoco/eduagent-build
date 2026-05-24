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

export function hashProfileId(profileId: string): string {
  const envSecret = process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
  let secret: string;
  if (envSecret) {
    secret = envSecret;
  } else {
    // Bail loudly in production. The historical silent fallback to a
    // hardcoded constant produced hashes that looked legitimate but
    // provided zero pseudonymisation — anyone with the (constant) "secret"
    // and the user-ID list could correlate every analytics event back to a
    // profile. Make the misconfiguration visible at the first call site.
    if (!(global as { __DEV__?: boolean }).__DEV__) {
      throw new Error(
        'analytics.hashProfileId: EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 is not ' +
          'set. Provision the key via Doppler/EAS env injection. Refusing ' +
          'to fall back to a hardcoded secret in production builds.',
      );
    }
    secret = DEV_FALLBACK_SECRET;
  }
  const tag = hmac(sha256, secret, profileId);
  // Truncate to 16 bytes / 32 hex chars. SHA-256 truncation is sound for
  // collision resistance at the user-base scale we care about (well under
  // 2^64 distinct profiles), and shorter tag values are friendlier in
  // Sentry's UI.
  let hex = '';
  for (let i = 0; i < 16; i += 1) {
    hex += tag[i]!.toString(16).padStart(2, '0');
  }
  return `v3_${hex}`;
}

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
