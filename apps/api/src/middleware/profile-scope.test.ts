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
      birthDate: '2014-06-15',
      location: 'EU',
      consentStatus: 'CONSENTED',
    });
  });

  it('skips when X-Profile-Id header is absent', async () => {
    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profileId).toBeNull();
  });

  it('returns 403 when profile does not belong to account', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-Profile-Id': 'other-account-profile' },
    });

    expect(res.status).toBe(403);
  });
});
