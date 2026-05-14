/**
 * Tests for pending-auth-redirect.ts
 *
 * The seedPendingAuthRedirectForTesting env guards are checked at call time.
 * NOTE: `process.env.NODE_ENV` is locked to 'test' by Jest's environment and
 * cannot be overridden via Object.defineProperty. The production-NODE_ENV guard
 * is verified using jest.replaceProperty (Jest 30+).
 */

import {
  clearPendingAuthRedirect,
  peekPendingAuthRedirect,
  rememberPendingAuthRedirect,
  seedPendingAuthRedirectForTesting,
} from './pending-auth-redirect';

const FIVE_MIN_MS = 5 * 60_000;

describe('rememberPendingAuthRedirect / peekPendingAuthRedirect', () => {
  afterEach(() => {
    clearPendingAuthRedirect();
  });

  it('returns the normalised path immediately after writing', () => {
    const result = rememberPendingAuthRedirect('/library');
    expect(result).toBe('/(app)/library');
    expect(peekPendingAuthRedirect()).toBe('/(app)/library');
  });

  it('returns null after clear', () => {
    rememberPendingAuthRedirect('/library');
    clearPendingAuthRedirect();
    expect(peekPendingAuthRedirect()).toBeNull();
  });
});

describe('seedPendingAuthRedirectForTesting', () => {
  const savedE2E = process.env.EXPO_PUBLIC_E2E;

  afterEach(() => {
    clearPendingAuthRedirect();
    if (savedE2E === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = savedE2E;
    }
  });

  it('throws when NODE_ENV is production regardless of E2E flag', () => {
    // jest.replaceProperty handles the Jest-locked NODE_ENV correctly.
    // jest.replaceProperty returns the value to its original after the test
    // when used with afterEach restore — but here we rely on jest's own
    // auto-restore because replaceProperty is integrated with Jest's mock
    // lifecycle.
    jest.replaceProperty(process.env, 'NODE_ENV', 'production');
    process.env.EXPO_PUBLIC_E2E = 'true';
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      'seedPendingAuthRedirectForTesting is dev-only',
    );
    jest.restoreAllMocks();
  });

  it('throws when EXPO_PUBLIC_E2E is not set', () => {
    delete process.env.EXPO_PUBLIC_E2E;
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      'seedPendingAuthRedirectForTesting is dev-only',
    );
  });

  it('throws when EXPO_PUBLIC_E2E is "false"', () => {
    process.env.EXPO_PUBLIC_E2E = 'false';
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      'seedPendingAuthRedirectForTesting is dev-only',
    );
  });

  it('writes a stale record — peek returns null when staleMs >= TTL', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    // staleMs = 6 minutes > PENDING_AUTH_REDIRECT_TTL_MS (5 min)
    seedPendingAuthRedirectForTesting('/library', FIVE_MIN_MS + 60_000);
    expect(peekPendingAuthRedirect()).toBeNull();
  });

  it('writes a fresh-ish record — peek returns path when staleMs < TTL', () => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    // staleMs = 1 minute — still within the 5-min TTL
    seedPendingAuthRedirectForTesting('/library', 60_000);
    expect(peekPendingAuthRedirect()).toBe('/(app)/library');
  });
});
