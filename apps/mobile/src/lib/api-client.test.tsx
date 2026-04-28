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

import { renderHook } from '@testing-library/react-native';
import {
  setOnAuthExpired,
  clearOnAuthExpired,
  resetAuthExpiredGuard,
  setActiveProfileId,
  setProxyMode,
  useApiClient,
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

// ---------------------------------------------------------------------------
// [BUG-631 / I-3] customFetch identity-snapshot break tests
//
// customFetch must read _activeProfileId AND _proxyMode BEFORE awaiting
// getToken() so a profile-switch race during the await cannot send the
// wrong child's profile-id alongside the wrong proxy flag. If the snapshot
// pattern regresses (e.g., the reads move below the await), the test below
// fails because mid-await mutations would change what the headers reflect.
// ---------------------------------------------------------------------------

describe('useApiClient header snapshot [BUG-631 / I-3]', () => {
  let originalFetch: typeof globalThis.fetch;
  let capturedHeaders: Headers | null = null;

  beforeEach(() => {
    capturedHeaders = null;
    originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
    setProxyMode(false);
    mockGetToken.mockReset();
  });

  it('[BREAK] snapshots profile id and proxy mode before async getToken resolves', async () => {
    // Initial identity: profile A, proxy ON.
    setActiveProfileId('profile-A');
    setProxyMode(true);

    // Controllable deferred so we can race a setActiveProfileId between
    // the snapshot read and getToken() resolving.
    let resolveToken!: (value: string) => void;
    mockGetToken.mockReturnValueOnce(
      new Promise<string>((r) => {
        resolveToken = r;
      })
    );

    const { result } = renderHook(() => useApiClient());
    const client = result.current as unknown as {
      v1: { health: { $get: () => Promise<Response> } };
    };

    // Kick off the request; customFetch executes its prefix (snapshot) then awaits getToken.
    const inFlight = client.v1.health.$get();

    // Yield once so customFetch's synchronous prefix runs (snapshots both vars).
    await Promise.resolve();
    await Promise.resolve();

    // Race: switch identity mid-flight. If the implementation reads AFTER
    // the await this test fails because headers will reflect the new state.
    setActiveProfileId('profile-B-different-child');
    setProxyMode(false);

    resolveToken('test-token');
    await inFlight;

    expect(capturedHeaders).not.toBeNull();
    // Snapshot value, not post-race value — proves both reads happen first.
    expect(capturedHeaders!.get('X-Profile-Id')).toBe('profile-A');
    expect(capturedHeaders!.get('X-Proxy-Mode')).toBe('true');
  });

  it('[BREAK] omits X-Proxy-Mode when proxy is off (no fall-open default)', async () => {
    setActiveProfileId('profile-X');
    setProxyMode(false);
    mockGetToken.mockResolvedValueOnce('test-token');

    const { result } = renderHook(() => useApiClient());
    const client = result.current as unknown as {
      v1: { health: { $get: () => Promise<Response> } };
    };
    await client.v1.health.$get();

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.has('X-Proxy-Mode')).toBe(false);
  });
});
