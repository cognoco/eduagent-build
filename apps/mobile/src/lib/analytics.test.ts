import { Sentry } from './sentry';
import {
  hashProfileId,
  track,
  trackHomeworkOcrGateAccepted,
  __TEST_ONLY__,
} from './analytics';

describe('analytics telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records analytics events as breadcrumbs, not standalone Sentry issues', () => {
    track('subscription_breakdown_viewed', {
      breakdown_section_visible: true,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      level: 'info',
      message: 'subscription_breakdown_viewed',
      data: {
        event: 'subscription_breakdown_viewed',
        breakdown_section_visible: true,
      },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('records OCR gate telemetry as breadcrumbs', () => {
    trackHomeworkOcrGateAccepted({
      source: 'local',
      tokens: 12,
      words: 6,
      confidence: 0.87654,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics.homework_ocr_gate',
      level: 'info',
      message: 'homework_ocr_gate_accepted',
      data: {
        source: 'local',
        tokens: 12,
        words: 6,
        confidence: 0.877,
      },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [WI-315 / DS-226] hashProfileId
//
// Pre-fix this used dual-FNV (non-cryptographic) keyed by
// EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1, with a hardcoded fallback secret
// `local-analytics-key-v1` when the env var was unset. Two problems:
//
//   1. FNV has known weaknesses for keyed constructions and only emits 64
//      bits, so colliding pre-image discovery is cheap. Replace with
//      HMAC-SHA256 via @noble/hashes (pure JS, synchronous — preserves the
//      caller-facing sync signature).
//   2. The hardcoded fallback string acted as the "secret" in production
//      builds where the env var wasn't injected. In dev that's harmless;
//      in production it means the privacy boundary the function pretends
//      to provide silently collapses. Throw in production when the key is
//      missing; allow the dev fallback only when __DEV__ is true.
//
// Residual limitation: EXPO_PUBLIC_* is by construction baked into the
// client bundle and therefore extractable from the binary. A truly
// keyed pseudonym requires server-side hashing — tracked separately.
// This change closes the FNV-weakness + hardcoded-fallback gaps without
// rippling an async refactor through every caller (use-mode-switch.ts,
// use-clone-from-child.ts, progress/index.tsx).
// ---------------------------------------------------------------------------

describe('hashProfileId — HMAC-SHA256 hardening [WI-315]', () => {
  const ORIGINAL_KEY = process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
  const ORIGINAL_DEV = (global as { __DEV__?: boolean }).__DEV__;

  afterEach(() => {
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = ORIGINAL_KEY;
    (global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV;
    __TEST_ONLY__.resetUnkeyedWarning();
  });

  it('[BREAK] emits a v3_ prefix (FNV→HMAC-SHA256 swap is observable to consumers)', () => {
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = 'test-key';
    expect(hashProfileId('profile-abc')).toMatch(/^v3_[0-9a-f]{32}$/);
  });

  it('[BREAK] is deterministic for a given (key, id) pair', () => {
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = 'stable-test-key';
    const first = hashProfileId('user-1');
    const second = hashProfileId('user-1');
    expect(first).toBe(second);
  });

  it('[BREAK] produces a different hash when the key rotates (key actually keys the HMAC)', () => {
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = 'key-version-a';
    const hashA = hashProfileId('user-1');
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = 'key-version-b';
    const hashB = hashProfileId('user-1');
    expect(hashA).not.toBe(hashB);
  });

  it('[BREAK] produces a different hash for a different profile under the same key', () => {
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = 'shared-key';
    expect(hashProfileId('user-1')).not.toBe(hashProfileId('user-2'));
  });

  it('[BREAK] in production with missing key, emits an `unkeyed_` tag (does NOT throw, does NOT silently use a hardcoded secret)', () => {
    // Throwing would crash user-facing tap handlers — `hashProfileId(...)`
    // is evaluated inside analytics-payload literals before `track(...)`
    // runs, so a throw escapes the handler. Instead emit an `unkeyed_`
    // tag so operators can filter on the misconfiguration in Sentry's
    // tag UI, then warn once per session via a breadcrumb.
    delete process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
    (global as { __DEV__?: boolean }).__DEV__ = false;

    expect(() => hashProfileId('user-1')).not.toThrow();
    expect(hashProfileId('user-1')).toMatch(/^v3_unkeyed_[0-9a-f]{24}$/);
  });

  it('[BREAK] in production with missing key, the unkeyed tag is deterministic per profile (per-user funnel correlation preserved)', () => {
    delete process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
    (global as { __DEV__?: boolean }).__DEV__ = false;

    expect(hashProfileId('user-1')).toBe(hashProfileId('user-1'));
    expect(hashProfileId('user-1')).not.toBe(hashProfileId('user-2'));
  });

  it('[BREAK][#887] in production with missing key, raises exactly one Sentry warning MESSAGE per session (independently queryable, not a ride-along breadcrumb)', () => {
    delete process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    jest.clearAllMocks();

    hashProfileId('user-1');
    hashProfileId('user-2');
    hashProfileId('user-3');

    // [#887] A breadcrumb only attaches to a later captured event, so the
    // missing-key degradation could stay invisible in a healthy session.
    // captureMessage emits an independently-queryable event instead.
    const configMessages = (
      Sentry.captureMessage as jest.Mock
    ).mock.calls.filter(
      ([message]) =>
        typeof message === 'string' &&
        /EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 missing/.test(message),
    );
    expect(configMessages).toHaveLength(1);
    expect(configMessages[0][1]).toBe('warning');
  });

  it('returns the invalid-empty sentinel when profileId is empty (no sha256-of-empty collision bucket)', () => {
    process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 = 'any-key';
    expect(hashProfileId('')).toBe('v3_invalid_empty');
    // Also in the prod-no-key path — guard runs before the env-secret check.
    delete process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    expect(hashProfileId('')).toBe('v3_invalid_empty');
  });

  it('[BREAK] in dev, falls back to a clearly-marked dev key so local builds keep working', () => {
    // Dev builds intentionally tolerate a missing key — but the fallback
    // must be visibly a dev fallback (so a leaked dev hash can't be
    // mistaken for a prod hash later) and the production guard above
    // still trips when __DEV__ is false.
    delete process.env.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1;
    (global as { __DEV__?: boolean }).__DEV__ = true;
    expect(() => hashProfileId('user-1')).not.toThrow();
    // Dev path uses the keyed format (with the dev fallback secret), not
    // the production `unkeyed_` sentinel — distinguishable in Sentry.
    expect(hashProfileId('user-1')).toMatch(/^v3_[0-9a-f]{32}$/);
  });
});
