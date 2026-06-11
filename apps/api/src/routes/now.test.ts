import { Hono } from 'hono';

import { nowRoutes } from './now';

jest.mock(
  '../services/now-feed' /* gc1-allow: route delegates to service */,
  () => ({
    buildNowFeed: jest.fn(async () => ({
      scope: 'self',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-11T12:00:00.000Z',
    })),
    buildNowOverflow: jest.fn(async () => ({
      scope: 'self',
      items: [],
    })),
  }),
);

type TestEnv = {
  Variables: {
    db: unknown;
    profileId: string | undefined;
    profileMeta: undefined;
    user: unknown;
  };
};

function makeApp(profileId = 'profile-1') {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', { kind: 'db' });
    c.set('profileId', profileId);
    c.set('profileMeta', undefined);
    await next();
  });
  app.route('/v1', nowRoutes);
  return app;
}

describe('now routes', () => {
  it('serves the self now feed', async () => {
    const res = await makeApp().request('/v1/now?scope=self');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      scope: 'self',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-11T12:00:00.000Z',
    });
  });

  it('serves now overflow', async () => {
    const res = await makeApp().request('/v1/now/overflow');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      scope: 'self',
      items: [],
    });
  });

  it('rejects non-self scope in S0', async () => {
    const res = await makeApp().request('/v1/now?scope=person');

    expect(res.status).toBe(400);
  });
});
