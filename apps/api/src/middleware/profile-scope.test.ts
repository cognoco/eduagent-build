import { Hono } from 'hono';
import { profileScopeMiddleware } from './profile-scope';

jest.mock('../services/profile', () => ({
  getProfile: jest.fn().mockImplementation((_db, profileId, accountId) => {
    // Only return profile when it "belongs" to the account
    if (profileId === 'valid-profile-id' && accountId === 'test-account-id') {
      return Promise.resolve({
        id: 'valid-profile-id',
        accountId: 'test-account-id',
        displayName: 'Test',
        personaType: 'LEARNER',
        birthDate: '2014-06-15',
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
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
        personaType: 'LEARNER',
        birthDate: '2014-06-15',
        birthYear: 2014,
        location: 'EU',
        consentStatus: 'CONSENTED',
      });
    }
    return Promise.resolve(null);
  }),
}));

describe('profileScopeMiddleware', () => {
  function createApp(): InstanceType<typeof Hono> {
    const app = new Hono();
    // Simulate account middleware having run
    app.use('*', async (c, next) => {
      c.set('account' as never, { id: 'test-account-id' });
      c.set('db' as never, {});
      await next();
    });
    app.use('*', profileScopeMiddleware);
    app.get('/test', (c) => {
      const profileId = c.get('profileId');
      const profileMeta = c.get('profileMeta' as never) ?? null;
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
    });
  });

  it('returns 403 with proper error body when profile does not belong to account', async () => {
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
  });

  it('continues without profileId when findOwnerProfile throws', async () => {
    const { findOwnerProfile } = jest.requireMock('../services/profile');
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    findOwnerProfile.mockRejectedValueOnce(new Error('DB connection lost'));

    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBeNull();
    expect(body.profileMeta).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      '[profile-scope] Failed to auto-resolve owner profile:',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('skips auto-resolution and calls next when db or account is missing', async () => {
    const app = new Hono();
    // Do NOT set db or account — simulate no prior middleware
    app.use('*', profileScopeMiddleware);
    app.get('/test', (c) => {
      const profileId = c.get('profileId');
      const profileMeta = c.get('profileMeta' as never) ?? null;
      return c.json({ profileId: profileId ?? null, profileMeta });
    });

    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBeNull();
    expect(body.profileMeta).toBeNull();
  });

  it('passes birthYear: null in profileMeta when profile has null birthYear', async () => {
    const { findOwnerProfile } = jest.requireMock('../services/profile');

    findOwnerProfile.mockResolvedValueOnce({
      id: 'null-birth-profile',
      accountId: 'test-account-id',
      displayName: 'NullBirth',
      personaType: 'LEARNER',
      birthDate: null,
      birthYear: null,
      location: 'US',
      consentStatus: 'PENDING',
    });

    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBe('null-birth-profile');
    expect(body.profileMeta).toEqual({
      birthYear: null,
      location: 'US',
      consentStatus: 'PENDING',
    });
  });
});
