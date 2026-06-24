import { Hono } from 'hono';

import { analyticsRoutes } from './analytics';

type AnalyticsTestEnv = {
  Bindings: {
    ANALYTICS_HASH_KEY?: string;
  };
  Variables: {
    profileId: string | undefined;
  };
};

const PROFILE_ID = '018f1f2a-7c8d-7000-8000-000000000123';
const OTHER_PROFILE_ID = '018f1f2a-7c8d-7000-8000-000000000456';
const ANALYTICS_HASH_KEY = 'server-test-analytics-key-32-bytes-min';

function createTestApp(options?: {
  profileId?: string;
  analyticsHashKey?: string;
}): Hono<AnalyticsTestEnv> {
  const app = new Hono<AnalyticsTestEnv>();
  app.use('*', async (c, next) => {
    c.set('profileId', options?.profileId ?? PROFILE_ID);
    c.env = {
      ANALYTICS_HASH_KEY:
        options && 'analyticsHashKey' in options
          ? options.analyticsHashKey
          : ANALYTICS_HASH_KEY,
    };
    await next();
  });
  app.route('/', analyticsRoutes);
  return app;
}

describe('POST /analytics/hash-profile-id', () => {
  it('returns a deterministic server-side v3 hash for the scoped profile', async () => {
    const app = createTestApp();

    const res = await app.request('/analytics/hash-profile-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      hash: 'v3_6f93fa6d5e1f98ae1c7e472c6722f972',
    });
  });

  it('rejects attempts to hash a profile outside the selected profile scope', async () => {
    const app = createTestApp({ profileId: PROFILE_ID });

    const res = await app.request('/analytics/hash-profile-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: OTHER_PROFILE_ID }),
    });

    expect(res.status).toBe(403);
  });

  it('fails closed when the server-side ANALYTICS_HASH_KEY is not configured', async () => {
    const app = createTestApp({ analyticsHashKey: undefined });

    const res = await app.request('/analytics/hash-profile-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID }),
    });

    expect(res.status).toBe(500);
  });
});
