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
import { CancelledError } from '@tanstack/react-query';
import {
  setOnAuthExpired,
  clearOnAuthExpired,
  resetAuthExpiredGuard,
  setActiveProfileId,
  setProxyMode,
  useApiClient,
} from './api-client';
import {
  ForbiddenError,
  fetchOrThrowNetworkError,
  NetworkError,
  TimeoutError,
  UnauthorizedError,
  UpstreamError,
  QuotaExceededError,
} from './api-errors';
import { combinedSignal } from './query-timeout';

const mockGetToken = jest.fn();
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

// ./api uses real implementation: getApiUrl() returns a localhost URL in __DEV__ (test env)
// and EXPO_PUBLIC_API_URL is not set in CI test runs, so the __DEV__ branch fires.
// The real module reads expo-constants which is shimmed by jest-expo — no mock needed.

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
    expect(() => {
      setOnAuthExpired(jest.fn());
      resetAuthExpiredGuard();
      clearOnAuthExpired();
      resetAuthExpiredGuard();
      setOnAuthExpired(jest.fn());
      resetAuthExpiredGuard();
    }).not.toThrow();
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
      }),
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

describe('useApiClient abort classification [WI-819]', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockGetToken.mockResolvedValue('test-token');
    setActiveProfileId('profile-A');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
    mockGetToken.mockReset();
    jest.useRealTimers();
  });

  it('does not wrap query-cancellation AbortError as NetworkError', async () => {
    const queryController = new AbortController();
    const { signal, cleanup } = combinedSignal(queryController.signal);
    globalThis.fetch = jest.fn(
      async (input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal =
            init?.signal ??
            (typeof Request !== 'undefined' && input instanceof Request
              ? input.signal
              : undefined);
          signal?.addEventListener('abort', () => reject(abortError()));
        }),
    ) as unknown as typeof globalThis.fetch;

    const request = fetchOrThrowNetworkError('https://example.test/probe', {
      signal,
    }).catch((err: unknown) => err);

    queryController.abort();
    const err = await request;

    expect(err).toBeInstanceOf(CancelledError);
    expect(err).not.toBeInstanceOf(NetworkError);
    cleanup();
  });

  it('[WI-901] classifies a timeout AbortError as TimeoutError, not NetworkError', async () => {
    jest.useFakeTimers();
    const { signal, cleanup } = combinedSignal(undefined, 25);
    globalThis.fetch = jest.fn(
      async (input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal =
            init?.signal ??
            (typeof Request !== 'undefined' && input instanceof Request
              ? input.signal
              : undefined);
          signal?.addEventListener('abort', () => reject(abortError()));
        }),
    ) as unknown as typeof globalThis.fetch;

    const request = fetchOrThrowNetworkError('https://example.test/probe', {
      signal,
    }).catch((err: unknown) => err);

    jest.advanceTimersByTime(25);
    const err = await request;

    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).not.toBeInstanceOf(NetworkError);
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// [CR-API-402-04] Non-quota 402 must throw UpstreamError with status 402.
//
// Before the fix, a 402 response without a structured `code` field fell
// through to the generic `throw new Error(...)` path, permanently losing the
// status code.  Callers that branch on payment-required (e.g., to show an
// upgrade prompt vs. a generic error) could not distinguish 402 from 5xx.
// ---------------------------------------------------------------------------

describe('useApiClient 402 error classification [CR-API-402-04]', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockGetToken.mockResolvedValue('test-token');
    setActiveProfileId('profile-A');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
    mockGetToken.mockReset();
  });

  function makeClient() {
    const { result } = renderHook(() => useApiClient());
    return result.current as unknown as {
      v1: { health: { $get: () => Promise<Response> } };
    };
  }

  it('[BREAK] non-quota 402 with no code throws UpstreamError with status 402', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response('Payment required', {
          status: 402,
          statusText: 'Payment Required',
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UpstreamError);
    const upstream = err as UpstreamError;
    expect(upstream.status).toBe(402);
    expect(upstream.code).toBe('PAYMENT_REQUIRED');
  });

  it('[BREAK] non-quota 402 with a structured code preserves that code', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'SUBSCRIPTION_EXPIRED',
            message: 'Subscribe to continue',
          }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UpstreamError);
    const upstream = err as UpstreamError;
    expect(upstream.status).toBe(402);
    expect(upstream.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('[BREAK] quota 402 still throws QuotaExceededError (regression guard)', async () => {
    const quotaBody = {
      code: 'QUOTA_EXCEEDED',
      message: 'Quota exceeded',
      details: {
        tier: 'free',
        effectiveAccessTier: 'free',
        quotaModel: 'per-profile',
        profileRole: 'owner',
        reason: 'monthly',
        resetsAt: '2026-05-27T01:00:00.000Z',
        monthlyLimit: 100,
        usedThisMonth: 100,
        dailyLimit: 10,
        usedToday: 5,
        topUpCreditsRemaining: 0,
        upgradeOptions: [],
      },
    };
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify(quotaBody), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err).not.toBeInstanceOf(UpstreamError);
  });

  it('[WI-976 / break-test] quota-coded 402 with malformed details fails closed as UpstreamError', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'QUOTA_EXCEEDED',
            message: 'Quota exceeded',
            details: {
              tier: 'free',
              reason: 'monthly',
            },
          }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).not.toBeInstanceOf(QuotaExceededError);
    const upstream = err as UpstreamError;
    expect(upstream.status).toBe(402);
    expect(upstream.code).toBe('QUOTA_EXCEEDED');
    expect(upstream.message).toBe('Quota exceeded');
  });
});

// ---------------------------------------------------------------------------
// [BUG-1016] Account verification 401s must not be treated as expired tokens.
//
// Staging once returned EMAIL_NOT_VERIFIED because the Clerk session token
// omitted the email_verified claim. The old client treated every 401 with a
// token as "expired", signed the user out, and showed the wrong banner.
// ---------------------------------------------------------------------------

describe('useApiClient 401 account-verification classification [BUG-1016]', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockGetToken.mockResolvedValue('test-token');
    setActiveProfileId('profile-A');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearOnAuthExpired();
    resetAuthExpiredGuard();
    setActiveProfileId(undefined);
    mockGetToken.mockReset();
  });

  function makeClient() {
    const { result } = renderHook(() => useApiClient());
    return result.current as unknown as {
      v1: { health: { $get: () => Promise<Response> } };
    };
  }

  it('[BREAK] EMAIL_NOT_VERIFIED does not fire the auth-expired sign-out callback', async () => {
    const onAuthExpired = jest.fn();
    setOnAuthExpired(onAuthExpired);
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'EMAIL_NOT_VERIFIED',
            message:
              'Email not verified. Please verify your email address and try again.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(onAuthExpired).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).apiCode).toBe('EMAIL_NOT_VERIFIED');
  });

  it('generic authenticated 401 still fires auth-expired handling', async () => {
    const onAuthExpired = jest.fn();
    setOnAuthExpired(onAuthExpired);
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired token',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    await client.v1.health.$get().catch(() => undefined);

    expect(onAuthExpired).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // [BUG-694] 401 must throw a typed UnauthorizedError that preserves the
  // HTTP status, the server-supplied error code, and the raw response body.
  // Previously a bare `Error('Session expired — signing out')` was thrown,
  // discarding all structured signal — callers had to string-match the
  // message to detect 401. The typed error implements the UX Resilience
  // Rule "Classify errors at the API client boundary, not per-screen."
  // -------------------------------------------------------------------------

  it('[BUG-694 / break-test] session-expired 401 throws UnauthorizedError with status, apiCode, and responseBody preserved', async () => {
    setOnAuthExpired(jest.fn());
    const body = JSON.stringify({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    });
    globalThis.fetch = jest.fn(
      async () =>
        new Response(body, {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnauthorizedError);
    const unauth = err as UnauthorizedError;
    expect(unauth.status).toBe(401);
    expect(unauth.reason).toBe('session-expired');
    expect(unauth.apiCode).toBe('UNAUTHORIZED');
    expect(unauth.message).toBe('Invalid or expired token');
    expect(unauth.responseBody).toBe(body);
  });

  it('[BUG-694 / break-test] no-token 401 throws UnauthorizedError with reason="token-not-ready"', async () => {
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue(null);
    globalThis.fetch = jest.fn(
      async () =>
        new Response('', {
          status: 401,
        }),
    ) as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnauthorizedError);
    const unauth = err as UnauthorizedError;
    expect(unauth.reason).toBe('token-not-ready');
    expect(unauth.status).toBe(401);
    expect(unauth.responseBody).toBe('');
  });
});

// ---------------------------------------------------------------------------
// [stale-token recovery] A cached Clerk JWT can already be expired on the
// first authenticated request after a cold start, which the server rejects
// with 401 even though the session is still valid. customFetch must retry once
// with a force-refreshed token (Clerk `skipCache`) BEFORE running the
// auth-expired/sign-out path — otherwise a transient startup 401 spuriously
// signs the user out and hangs the subject-classify flow on the first message.
// ---------------------------------------------------------------------------

describe('useApiClient stale-token recovery', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setActiveProfileId('profile-A');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearOnAuthExpired();
    resetAuthExpiredGuard();
    setActiveProfileId(undefined);
    mockGetToken.mockReset();
  });

  function makeClient() {
    const { result } = renderHook(() => useApiClient());
    return result.current as unknown as {
      v1: { health: { $get: () => Promise<Response> } };
    };
  }

  it('[BREAK] retries a 401 once with a force-refreshed token and succeeds without signing out', async () => {
    const onAuthExpired = jest.fn();
    setOnAuthExpired(onAuthExpired);

    // First call returns the stale cached token; the skipCache retry mints fresh.
    mockGetToken.mockResolvedValueOnce('stale-token');
    mockGetToken.mockResolvedValueOnce('fresh-token');

    const fetchMock = jest.fn(async (_input, init) => {
      const auth = new Headers(init?.headers).get('Authorization');
      // Reject the stale token, accept the freshly-minted one.
      return auth === 'Bearer fresh-token'
        ? new Response('{}', { status: 200 })
        : new Response(
            JSON.stringify({ code: 'UNAUTHORIZED', message: 'token expired' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const res = await client.v1.health.$get();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Retry forced a cache-skipping token refresh.
    expect(mockGetToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    // A recoverable stale token must never reach the sign-out path.
    expect(onAuthExpired).not.toHaveBeenCalled();
  });

  it('[BREAK] when the refreshed token also 401s, fires auth-expired exactly once', async () => {
    const onAuthExpired = jest.fn();
    setOnAuthExpired(onAuthExpired);
    mockGetToken.mockResolvedValue('still-bad-token');

    const fetchMock = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 'UNAUTHORIZED', message: 'token expired' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = makeClient();
    const err = await client.v1.health.$get().catch((e: unknown) => e);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as UnauthorizedError).reason).toBe('session-expired');
  });
});
