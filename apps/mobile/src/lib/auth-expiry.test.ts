import {
  AUTH_EXPIRY_STORAGE_KEYS,
  clearSessionExpiredNotice,
  clearSessionRevokedNotice,
  consumeSessionExpiredNotice,
  consumeSessionRevokedNotice,
  markSessionExpired,
  markSessionRevoked,
  peekSessionExpiredNotice,
  peekSessionRevokedNotice,
} from './auth-expiry';

describe('auth-expiry notice state', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    clearSessionExpiredNotice();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    clearSessionExpiredNotice();
    nowSpy.mockRestore();
  });

  it('allows the sign-in screen to peek without consuming the notice', () => {
    markSessionExpired();

    expect(peekSessionExpiredNotice()).toBe(true);
    expect(peekSessionExpiredNotice()).toBe(true);
    expect(consumeSessionExpiredNotice()).toBe(true);
    expect(peekSessionExpiredNotice()).toBe(false);
  });

  it('keeps the notice available for five minutes', () => {
    markSessionExpired();

    nowSpy.mockReturnValue(1_000 + 5 * 60_000 - 1);

    expect(peekSessionExpiredNotice()).toBe(true);

    nowSpy.mockReturnValue(1_000 + 5 * 60_000);

    expect(peekSessionExpiredNotice()).toBe(false);
  });
});

// [AUTH-11] When the api-client's 401 handler marks the session expired and
// the user is redirected to sign-in, the sign-in screen must still see the
// notice — even if the module-level marker was lost between the mark and the
// peek (e.g. Clerk's web sign-out causing a re-evaluation, fast-refresh in
// dev, or any other path that re-runs the module body). Persisting in
// sessionStorage on web rehydrates the marker after such a reset.
describe('[AUTH-11] sessionStorage persistence — survives module reset on web', () => {
  let storage: Record<string, string>;
  let originalSessionStorage: unknown;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    storage = {};
    originalSessionStorage = (globalThis as { sessionStorage?: unknown })
      .sessionStorage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
    };
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    // Use the public clear so both module state and storage are wiped, then
    // restore the original sessionStorage value (or remove it if absent).
    clearSessionExpiredNotice();
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      (globalThis as { sessionStorage?: unknown }).sessionStorage =
        originalSessionStorage;
    }
    nowSpy.mockRestore();
  });

  it('writes the marker to sessionStorage so a fresh module instance can rehydrate it', () => {
    markSessionExpired();

    expect(storage['mentomate_session_expired_at']).toBe('1000');

    // Simulate the bug: the module is re-evaluated and the let-binding for
    // _sessionExpiredAt resets to null. jest.isolateModules gives us a fresh
    // module instance; sessionStorage (set on globalThis) survives.
    jest.isolateModules(() => {
      const fresh = require('./auth-expiry') as typeof import('./auth-expiry');
      expect(fresh.peekSessionExpiredNotice()).toBe(true);
    });
  });

  it('clears the storage entry when the notice is consumed', () => {
    markSessionExpired();
    expect(storage['mentomate_session_expired_at']).toBe('1000');

    expect(consumeSessionExpiredNotice()).toBe(true);
    expect(storage['mentomate_session_expired_at']).toBeUndefined();
  });

  it('clears the storage entry when the notice expires past the five-minute window', () => {
    markSessionExpired();
    expect(storage['mentomate_session_expired_at']).toBe('1000');

    nowSpy.mockReturnValue(1_000 + 5 * 60_000);
    expect(peekSessionExpiredNotice()).toBe(false);
    expect(storage['mentomate_session_expired_at']).toBeUndefined();
  });

  it('ignores a malformed stored value rather than reporting an expired session', () => {
    storage['mentomate_session_expired_at'] = 'not-a-number';

    jest.isolateModules(() => {
      const fresh = require('./auth-expiry') as typeof import('./auth-expiry');
      expect(fresh.peekSessionExpiredNotice()).toBe(false);
    });
  });
});

// [BUG-780] The revoked notice mirrors the expired one but is a separate
// in-memory + sessionStorage state. The two states must not interfere — a
// revoked notice must not clear an expired notice (and vice versa) so the
// sign-in screen can show the correct banner if both were set in different
// tabs / flows.
describe('[BUG-780] auth-expiry revoked notice state', () => {
  let storage: Record<string, string>;
  let originalSessionStorage: unknown;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    storage = {};
    originalSessionStorage = (globalThis as { sessionStorage?: unknown })
      .sessionStorage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
    };
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    clearSessionExpiredNotice();
    clearSessionRevokedNotice();
  });

  afterEach(() => {
    clearSessionExpiredNotice();
    clearSessionRevokedNotice();
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      (globalThis as { sessionStorage?: unknown }).sessionStorage =
        originalSessionStorage;
    }
    nowSpy.mockRestore();
  });

  it('exposes a distinct storage key from the expired notice', () => {
    expect(AUTH_EXPIRY_STORAGE_KEYS.revoked).toBe(
      'mentomate_session_revoked_at',
    );
    expect(AUTH_EXPIRY_STORAGE_KEYS.expired).toBe(
      'mentomate_session_expired_at',
    );
    expect(AUTH_EXPIRY_STORAGE_KEYS.revoked).not.toBe(
      AUTH_EXPIRY_STORAGE_KEYS.expired,
    );
  });

  it('allows peek without consuming the notice', () => {
    markSessionRevoked();

    expect(peekSessionRevokedNotice()).toBe(true);
    expect(peekSessionRevokedNotice()).toBe(true);
    expect(consumeSessionRevokedNotice()).toBe(true);
    expect(peekSessionRevokedNotice()).toBe(false);
  });

  it('writes its own storage key — not the expired key', () => {
    markSessionRevoked();
    expect(storage['mentomate_session_revoked_at']).toBe('1000');
    expect(storage['mentomate_session_expired_at']).toBeUndefined();
  });

  it('does not clear an expired notice when the revoked notice is cleared', () => {
    markSessionExpired();
    markSessionRevoked();

    clearSessionRevokedNotice();

    expect(peekSessionExpiredNotice()).toBe(true);
    expect(peekSessionRevokedNotice()).toBe(false);
  });

  it('rehydrates from sessionStorage after a module reset', () => {
    markSessionRevoked();

    jest.isolateModules(() => {
      const fresh = require('./auth-expiry') as typeof import('./auth-expiry');
      expect(fresh.peekSessionRevokedNotice()).toBe(true);
    });
  });

  it('clears the storage entry when the notice expires past the five-minute window', () => {
    markSessionRevoked();
    expect(storage['mentomate_session_revoked_at']).toBe('1000');

    nowSpy.mockReturnValue(1_000 + 5 * 60_000);
    expect(peekSessionRevokedNotice()).toBe(false);
    expect(storage['mentomate_session_revoked_at']).toBeUndefined();
  });
});
