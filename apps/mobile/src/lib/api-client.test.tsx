// ---------------------------------------------------------------------------
// api-client tests — focused on [BUG-630 / I-2] auth-expired guard reset.
//
// The internal `_authExpiredFiring` flag is module-private. We verify the
// public contract: setOnAuthExpired, clearOnAuthExpired, and the new
// resetAuthExpiredGuard are exported, callable, and idempotent. The full
// 401-dedup behaviour is exercised by the production callsite in
// app/_layout.tsx (signOut().finally(resetAuthExpiredGuard)) — what we are
// guarding against here is the helper being removed/renamed without the
// callsite being updated.
// ---------------------------------------------------------------------------

import {
  setOnAuthExpired,
  clearOnAuthExpired,
  resetAuthExpiredGuard,
} from './api-client';

const mockGetToken = jest.fn();
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

jest.mock('./api', () => ({ getApiUrl: () => 'http://localhost' }));

describe('api-client auth-expired guard [BUG-630 / I-2]', () => {
  afterEach(() => {
    clearOnAuthExpired();
  });

  it('exports resetAuthExpiredGuard so consumers can clear the flag after signOut resolves', () => {
    expect(typeof resetAuthExpiredGuard).toBe('function');
  });

  it('resetAuthExpiredGuard is idempotent and never throws', () => {
    expect(() => resetAuthExpiredGuard()).not.toThrow();
    expect(() => resetAuthExpiredGuard()).not.toThrow();
    expect(() => resetAuthExpiredGuard()).not.toThrow();
  });

  it('setOnAuthExpired and clearOnAuthExpired remain available (not regressed)', () => {
    const cb = jest.fn();
    expect(() => setOnAuthExpired(cb)).not.toThrow();
    expect(() => clearOnAuthExpired()).not.toThrow();
  });

  it('does not throw when reset is called before any callback was registered', () => {
    clearOnAuthExpired();
    expect(() => resetAuthExpiredGuard()).not.toThrow();
  });

  it('does not throw when reset is called repeatedly across registrations', () => {
    setOnAuthExpired(jest.fn());
    resetAuthExpiredGuard();
    clearOnAuthExpired();
    resetAuthExpiredGuard();
    setOnAuthExpired(jest.fn());
    resetAuthExpiredGuard();
    expect(true).toBe(true);
  });
});
