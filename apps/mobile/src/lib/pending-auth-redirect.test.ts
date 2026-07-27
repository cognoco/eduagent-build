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

function createSessionStorageDouble() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('rememberPendingAuthRedirect / peekPendingAuthRedirect', () => {
  afterEach(() => {
    clearPendingAuthRedirect();
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    });
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

  it('[WI-1849] persists, reloads, and clears a web redirect through sessionStorage', () => {
    const sessionStorage = createSessionStorageDouble();
    Object.defineProperty(globalThis, 'window', {
      value: { sessionStorage },
      configurable: true,
    });

    jest.resetModules();
    const firstLoad =
      require('./pending-auth-redirect') as typeof import('./pending-auth-redirect');
    firstLoad.rememberPendingAuthRedirect('/quiz?round=2');
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'mentomate_pending_auth_redirect',
      expect.stringContaining('/(app)/quiz?round=2'),
    );

    // A fresh module instance has no in-memory record and must replay from the
    // browser-owned storage written before the simulated reload.
    jest.resetModules();
    const afterReload =
      require('./pending-auth-redirect') as typeof import('./pending-auth-redirect');
    expect(afterReload.peekPendingAuthRedirect()).toBe('/(app)/quiz?round=2');

    afterReload.clearPendingAuthRedirect();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      'mentomate_pending_auth_redirect',
    );

    jest.resetModules();
    const afterClearReload =
      require('./pending-auth-redirect') as typeof import('./pending-auth-redirect');
    expect(afterClearReload.peekPendingAuthRedirect()).toBeNull();
  });

  it('[WI-1849] removes malformed browser records instead of replaying them', () => {
    const sessionStorage = createSessionStorageDouble();
    sessionStorage.setItem(
      'mentomate_pending_auth_redirect',
      JSON.stringify({ path: 42, savedAt: Date.now() }),
    );
    Object.defineProperty(globalThis, 'window', {
      value: { sessionStorage },
      configurable: true,
    });

    jest.resetModules();
    const afterReload =
      require('./pending-auth-redirect') as typeof import('./pending-auth-redirect');
    expect(afterReload.peekPendingAuthRedirect()).toBeNull();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      'mentomate_pending_auth_redirect',
    );
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

  it('[WI-1864] supports the release-mode native E2E bundle when its explicit flag is true', () => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production');
    process.env.EXPO_PUBLIC_E2E = 'true';
    expect(() =>
      seedPendingAuthRedirectForTesting('/library', FIVE_MIN_MS + 60_000),
    ).not.toThrow();
    expect(peekPendingAuthRedirect()).toBeNull();
    jest.restoreAllMocks();
  });

  it('throws when EXPO_PUBLIC_E2E is not set', () => {
    delete process.env.EXPO_PUBLIC_E2E;
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      'seedPendingAuthRedirectForTesting is E2E-only',
    );
  });

  // [BUG-324] The thrown error must spell out the required flag so the
  // developer/CI operator hitting this guard knows what to set, not just
  // that the helper is "dev-only".
  it('throws with explicit EXPO_PUBLIC_E2E=true guidance when the flag is missing', () => {
    delete process.env.EXPO_PUBLIC_E2E;
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      /EXPO_PUBLIC_E2E=true/,
    );
  });

  it('throws when EXPO_PUBLIC_E2E is "false"', () => {
    process.env.EXPO_PUBLIC_E2E = 'false';
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      'seedPendingAuthRedirectForTesting is E2E-only',
    );
  });

  // [BUG-324] Same explicit-flag guidance when the flag is set to "false".
  it('throws with explicit EXPO_PUBLIC_E2E=true guidance when the flag is "false"', () => {
    process.env.EXPO_PUBLIC_E2E = 'false';
    expect(() => seedPendingAuthRedirectForTesting('/library', 0)).toThrow(
      /EXPO_PUBLIC_E2E=true/,
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
