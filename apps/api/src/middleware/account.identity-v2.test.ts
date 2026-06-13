// ---------------------------------------------------------------------------
// CUT-B1 account-seam guards (cutover-plan §2.2a, guardrails 4 + 5).
//
// Covers the requireAccountMiddleware v2 pre-graph allowlist without a DB: the
// graphless clerkIdentity is set directly in context (as accountMiddleware v2
// would), and we assert which routes pass pre-graph and which still 401.
//
// Also pins the flag-off invariant at the middleware layer: with
// IDENTITY_V2_ENABLED unset / 'false', the pre-graph allowlist is inert — an
// authenticated request with no account 401s on EVERY route (legacy behavior),
// because the v2 allowlist branch is only reachable when the flag is 'true'.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { requireAccountMiddleware } from './account';
import type { AuthUser } from './auth';

type TestEnv = {
  Bindings: { IDENTITY_V2_ENABLED?: string };
  Variables: {
    user: AuthUser | undefined;
    account: { id: string } | undefined;
    clerkIdentity: { clerkUserId: string; verifiedEmail: string } | undefined;
  };
};

const FAKE_USER: AuthUser = {
  userId: 'clerk_test',
  email: 'u@test.local',
  emailVerified: true,
} as AuthUser;

/**
 * Build an app whose pre-middleware seeds the context the way authMiddleware +
 * accountMiddleware would, then mounts the real requireAccountMiddleware. No
 * internal mocks — the seeding middleware is test scaffolding, not a stub of a
 * production module.
 */
function buildApp(seed: {
  user?: AuthUser;
  account?: { id: string };
  clerkIdentity?: { clerkUserId: string; verifiedEmail: string };
}) {
  const app = new Hono<TestEnv>().basePath('/v1');
  app.use('*', async (c, next) => {
    if (seed.user) c.set('user', seed.user);
    if (seed.account) c.set('account', seed.account);
    if (seed.clerkIdentity) c.set('clerkIdentity', seed.clerkIdentity);
    return next();
  });
  app.use('*', requireAccountMiddleware);
  app.get('/profiles', (c) => c.json({ ok: 'list' }));
  app.post('/profiles', (c) => c.json({ ok: 'bootstrap' }, 201));
  app.get('/billing/status', (c) => c.json({ ok: 'billing' }));
  app.get('/subscription/status', (c) => c.json({ ok: 'sub' }));
  app.get('/consent/my-status', (c) => c.json({ ok: 'consent' }));
  app.get('/sessions', (c) => c.json({ ok: 'sessions' }));
  app.post('/sessions', (c) => c.json({ ok: 'sessions-post' }));

  const call = (
    path: string,
    method: string,
    env: { IDENTITY_V2_ENABLED?: string },
  ) => app.request(`/v1${path}`, { method }, env);
  return { call };
}

describe('requireAccountMiddleware — v2 pre-graph allowlist (flag-on)', () => {
  const env = { IDENTITY_V2_ENABLED: 'true' };
  const preGraph = {
    user: FAKE_USER,
    clerkIdentity: { clerkUserId: 'clerk_test', verifiedEmail: 'u@test.local' },
  };

  it.each([
    ['GET', '/profiles'],
    ['POST', '/profiles'],
    ['GET', '/billing/status'],
    ['GET', '/subscription/status'],
    ['GET', '/consent/my-status'],
  ])('allows %s %s pre-graph', async (method, path) => {
    const { call } = buildApp(preGraph);
    const res = await call(path, method, env);
    expect(res.status).toBeLessThan(400);
  });

  it.each([
    ['GET', '/sessions'],
    ['POST', '/sessions'],
    ['POST', '/billing/status'], // method not on the allowlist
  ])(
    'still 401s %s %s pre-graph (not on the allowlist)',
    async (method, path) => {
      const { call } = buildApp(preGraph);
      const res = await call(path, method, env);
      expect(res.status).toBe(401);
    },
  );

  it('401s an allowlisted route when clerkIdentity is ALSO missing', async () => {
    // user set but neither account nor clerkIdentity — a genuine ordering fault.
    const { call } = buildApp({ user: FAKE_USER });
    const res = await call('/profiles', 'GET', env);
    expect(res.status).toBe(401);
  });
});

describe('requireAccountMiddleware — flag-off invariant', () => {
  const preGraph = {
    user: FAKE_USER,
    clerkIdentity: { clerkUserId: 'clerk_test', verifiedEmail: 'u@test.local' },
  };

  it.each([[undefined], ['false']])(
    '401s every account-less route when flag is %s (allowlist inert)',
    async (flag) => {
      const { call } = buildApp(preGraph);
      // Even the would-be-allowlisted bootstrap 401s when the flag is off.
      const res = await call('/profiles', 'POST', {
        IDENTITY_V2_ENABLED: flag,
      });
      expect(res.status).toBe(401);
    },
  );

  it('passes through when an account IS resolved (legacy + v2 alike)', async () => {
    const { call } = buildApp({ user: FAKE_USER, account: { id: 'org_1' } });
    expect((await call('/sessions', 'GET', {})).status).toBe(200);
  });

  it('passes through public routes (no user) untouched', async () => {
    const { call } = buildApp({});
    expect((await call('/sessions', 'GET', {})).status).toBe(200);
  });
});
