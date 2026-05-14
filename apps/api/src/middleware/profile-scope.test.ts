import { Hono } from 'hono';
import type { AppVariables } from '../types/hono';

jest.mock('../services/sentry', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import {
  profileScopeMiddleware,
  requireProfileId,
  requireAccount,
} from './profile-scope';
import { HTTPException } from 'hono/http-exception';
import { captureException } from '../services/sentry';

jest.mock('../services/profile', () => ({
  getProfile: jest.fn().mockImplementation((_db, profileId, accountId) => {
    // Only return profile when it "belongs" to the account
    if (profileId === 'valid-profile-id' && accountId === 'test-account-id') {
      return Promise.resolve({
        id: 'valid-profile-id',
        accountId: 'test-account-id',
        displayName: 'Test',
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
        isOwner: true,
      });
    }
    return Promise.resolve(null);
  }),
  findOwnerProfile: jest.fn().mockImplementation((_db, accountId) => {
    if (accountId === 'test-account-id') {
      return Promise.resolve({
        id: 'owner-profile-id',
        accountId: 'test-account-id',
        displayName: 'Owner',
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
        isOwner: true,
      });
    }
    return Promise.resolve(null);
  }),
}));

describe('profileScopeMiddleware', () => {
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
    });
  });

  it('returns 403 with proper error body when profile does not belong to account', async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
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

  // [CR-SILENT-RECOVERY-1] Break test: verifies the auto-resolve catch block
  // emits BOTH a structured log (queryable observability) AND a Sentry capture
  // (aggregate alerting) — not just a raw console.error. The rule "silent
  // recovery without escalation is banned" requires both signals in
  // auth-scoping code paths.
  it('escalates via logger.error + captureException when findOwnerProfile throws', async () => {
    const { findOwnerProfile } = jest.requireMock('../services/profile');
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (captureException as jest.Mock).mockClear();

    const dbError = new Error('DB connection lost');
    findOwnerProfile.mockRejectedValueOnce(dbError);

    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBeNull();
    expect(body.profileMeta).toBeNull();

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

    // Sentry escalation: real exception object + queryable context tag
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(dbError, {
      extra: {
        context: 'profile-scope.auto_resolve_owner',
        accountId: 'test-account-id',
      },
    });

    errorSpy.mockRestore();
  });

  it('leaves profileMeta unset when findOwnerProfile returns null (new account) [BUG-TEMP-28]', async () => {
    const { findOwnerProfile } = jest.requireMock('../services/profile');
    findOwnerProfile.mockResolvedValueOnce(null);

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
    expect(() => requireProfileId(undefined)).toThrow(HTTPException);
    try {
      requireProfileId(undefined);
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
    }
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
    expect(() => requireAccount(undefined)).toThrow(HTTPException);
    try {
      requireAccount(undefined);
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(401);
      expect((err as HTTPException).message).toMatch(/account required/i);
    }
  });
});
