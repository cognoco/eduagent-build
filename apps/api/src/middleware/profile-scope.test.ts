import { Hono } from 'hono';
import type { AppVariables } from '../types/hono';

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  };
});

const mockGetPersonScope = jest.fn();
const mockFindOwnerPersonScope = jest.fn();
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — profile-scope mw calls getPersonScope/findOwnerPersonScope (db.select() innerJoin chains, unrunnable on unit mock DB); real path covered by identity integration suite — coverage gap tracked WI-905 */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
  }),
);

import {
  profileScopeMiddleware,
  requireProfileId,
  requireAccount,
} from './profile-scope';
import { HTTPException } from 'hono/http-exception';
import { captureException } from '../services/sentry';

function captureHttpException(callback: () => unknown): HTTPException {
  let thrown: unknown;
  try {
    callback();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(HTTPException);
  return thrown as HTTPException;
}
describe('profileScopeMiddleware', () => {
  beforeEach(() => {
    mockGetPersonScope.mockReset();
    mockFindOwnerPersonScope.mockReset();
    // Default: valid profile belongs to account
    mockGetPersonScope.mockResolvedValue({
      profileId: 'valid-profile-id',
      meta: {
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: true,
      },
    });
    // Default: owner auto-resolve
    mockFindOwnerPersonScope.mockResolvedValue({
      profileId: 'owner-profile-id',
      meta: {
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: true,
      },
    });
  });

  function createApp(): Hono<{ Variables: AppVariables }> {
    const app = new Hono<{ Variables: AppVariables }>();
    // Simulate account middleware having run
    app.use('*', async (c, next) => {
      c.set('account', { id: 'test-account-id' } as AppVariables['account']);
      c.set('db', {} as AppVariables['db']);
      await next();
    });
    app.use('*', profileScopeMiddleware);
    app.get('/test', (c) => {
      const profileId = c.get('profileId');
      const profileMeta = c.get('profileMeta') ?? null;
      return c.json({ profileId: profileId ?? null, profileMeta });
    });
    return app;
  }

  it('sets profileId and profileMeta when X-Profile-Id header is valid', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-Profile-Id': 'valid-profile-id' },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBe('valid-profile-id');
    expect(body.profileMeta).toEqual({
      birthYear: 2014,
      location: 'EU',
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: true,
      // [Issue 901] An explicitly supplied + verified profile is tagged
      // 'explicit-header' so the owner-only gates accept it.
      resolvedVia: 'explicit-header',
    });
  });

  it('auto-resolves owner profile when X-Profile-Id header is absent', async () => {
    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBe('owner-profile-id');
    expect(body.profileMeta).toEqual({
      birthYear: 2014,
      location: 'EU',
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: true,
      // [Issue 901] The no-header auto-resolve path synthesizes the owner
      // identity, so it is tagged 'auto'. The owner-only gates
      // (assertOwnerProfile / assertNotProxyMode) reject 'auto' even though
      // isOwner is true — an authenticated non-owner could otherwise omit the
      // header to be auto-resolved to the owner (privilege escalation).
      resolvedVia: 'auto',
    });
  });

  it('returns 403 with proper error body when profile does not belong to account', async () => {
    mockGetPersonScope.mockResolvedValueOnce(null);
    // [BUG-231] Use `jest.fn()` (typed empty mock) instead of `() => {}` so
    // we don't need to suppress @typescript-eslint/no-empty-function. The
    // intent — silence noisy warnings during this assertion — is preserved
    // and the spy's call record stays inspectable below.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-Profile-Id': 'other-account-profile' },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      code: 'FORBIDDEN',
      message: 'Profile does not belong to this account',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const loggedJson = warnSpy.mock.calls[0]![0] as string;
    const logged = JSON.parse(loggedJson);
    expect(logged.level).toBe('warn');
    expect(logged.message).toBe('profile_scope.ownership_mismatch');
    expect(logged.context).toMatchObject({
      accountId: 'test-account-id',
      requestedProfileId: 'other-account-profile',
    });

    warnSpy.mockRestore();
  });

  // [Finding #5] Break test: when X-Profile-Id is explicitly supplied but no
  // account was resolved (auth middleware didn't run / failed), the middleware
  // must return 401 rather than silently passing through and producing a
  // confusing 400 deep in the route handler.
  it('returns 401 when X-Profile-Id header is present but account is not resolved', async () => {
    const app = new Hono();
    // Deliberately do NOT set account — simulates auth middleware not running
    app.use('*', async (c, next) => {
      c.set('db' as never, {});
      // account is intentionally left unset
      await next();
    });
    app.use('*', profileScopeMiddleware);
    app.get('/test', (c) => c.json({ reached: true }));

    const res = await app.request('/test', {
      headers: { 'X-Profile-Id': 'some-profile-id' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required to use X-Profile-Id',
    });
  });

  // [BUG-487 / BUG-502] Break test: when findOwnerPersonScope throws a transient
  // DB error, profileScopeMiddleware must respond 503 (fail closed) and must
  // NOT call next(). Previous behavior was to swallow the error and call
  // next() with profileId undefined, allowing consent to skip enforcement.
  //
  // Also verifies both observability signals still fire before the throw:
  // - Structured log (queryable event name)
  // - Sentry capture (aggregate alerting)
  // This preserves the CR-SILENT-RECOVERY-1 requirement while fixing the
  // fail-open bug.
  it('[BUG-487/502] returns 503 + logs + captures when findOwnerProfile throws', async () => {
    // [BUG-231] See above — jest.fn() avoids the empty-function suppression.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    (captureException as jest.Mock).mockClear();

    const dbError = new Error('DB connection lost');
    mockFindOwnerPersonScope.mockRejectedValueOnce(dbError);

    const app = createApp();
    const res = await app.request('/test');

    // [BUG-487] Must respond 503, NOT 200 — DB error is transient server fault.
    // [BUG-502] Must NOT proceed to route handler (consent gate would fail open).
    expect(res.status).toBe(503);

    // Structured log: JSON-encoded entry with the documented event name
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedJson = errorSpy.mock.calls[0]![0] as string;
    const logged = JSON.parse(loggedJson);
    expect(logged.level).toBe('error');
    expect(logged.message).toBe('profile_scope.auto_resolve_failed');
    expect(logged.context).toMatchObject({
      accountId: 'test-account-id',
      error: 'DB connection lost',
    });

    // Sentry escalation: real exception object + queryable surface tag
    // [CR-2026-05-19-M1] tags.surface allows ops to filter/alert in Sentry.
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(dbError, {
      tags: { surface: 'profile_scope.auto_resolve_failure' },
      extra: {
        context: 'profile-scope.auto_resolve_owner',
        accountId: 'test-account-id',
      },
    });

    errorSpy.mockRestore();
  });

  it('leaves profileMeta unset when findOwnerProfile returns null (new account) [BUG-TEMP-28]', async () => {
    mockFindOwnerPersonScope.mockResolvedValueOnce(null);

    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBeNull();
    expect(body.profileMeta).toBeNull();
  });

  it('skips auto-resolution and calls next when db or account is missing', async () => {
    const app = new Hono<{ Variables: AppVariables }>();
    // Do NOT set db or account — simulate no prior middleware
    app.use('*', profileScopeMiddleware);
    app.get('/test', (c) => {
      const profileId = c.get('profileId');
      const profileMeta = c.get('profileMeta') ?? null;
      return c.json({ profileId: profileId ?? null, profileMeta });
    });

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBeNull();
    expect(body.profileMeta).toBeNull();
  });
});

// [CR-657] Break tests for requireAccount + requireProfileId helpers.
describe('requireProfileId', () => {
  it('returns the profileId when present', () => {
    expect(requireProfileId('p-1')).toBe('p-1');
  });

  it('throws HTTPException(400) when profileId is undefined', () => {
    const invokeRequireProfileId = jest.fn(() => requireProfileId(undefined));

    expect(captureHttpException(invokeRequireProfileId)).toEqual(
      expect.objectContaining({ status: 400 }),
    );
    expect(invokeRequireProfileId).toHaveBeenCalledTimes(1);
  });
});

describe('requireAccount', () => {
  it('returns the account when present', () => {
    const account = {
      id: 'a-1',
      clerkUserId: 'u-1',
      email: 'x@y.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(requireAccount(account)).toBe(account);
  });

  it('[CR-657] throws HTTPException(401) when account is undefined', () => {
    const invokeRequireAccount = jest.fn(() => requireAccount(undefined));

    expect(captureHttpException(invokeRequireAccount)).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(/account required/i),
        status: 401,
      }),
    );
    expect(invokeRequireAccount).toHaveBeenCalledTimes(1);
  });
});
