// ---------------------------------------------------------------------------
// Inngest Route Tests
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from 'node:async_hooks';

jest.mock(
  '../inngest',
  /* gc1-allow: registry-boundary: loading the real registry imports all production Inngest functions; route tests replace only the registry payload while exercising the real Hono route */ () => {
    const actual = jest.requireActual(
      '../inngest',
    ) as typeof import('../inngest');
    return {
      ...actual,
      inngest: { id: 'test-inngest' },
      functions: [],
    };
  },
);

jest.mock('inngest/hono', () => ({
  serve: jest.fn(() => async () => {
    const { getStepAppUrl, getStepSupportEmail } =
      require('../inngest/helpers') as {
        getStepAppUrl: () => string;
        getStepSupportEmail: () => string;
      };
    await new Promise((resolve) => setImmediate(resolve));
    return Response.json({
      appUrl: getStepAppUrl(),
      supportEmail: getStepSupportEmail(),
    });
  }),
}));

import { Hono } from 'hono';
import { inngestRoute } from './inngest';

// [WI-1862] The test below mocks `AsyncLocalStorage.prototype.enterWith` to
// throw, asserting our code path (which only ever calls `.run()`) never
// touches it — Cloudflare Workers' AsyncLocalStorage doesn't implement
// enterWith at all. That assumption breaks on hosts where the *engine's own*
// `.run()` internally delegates to `.enterWith()` on its fast path (confirmed
// via `store.run.toString()` on Node v26.3.0 — a newer AsyncContextFrame
// implementation detail, unrelated to our code or to the Worker env
// bindings). CI runs Node 22, where `.run()` has an independent
// implementation and this test passes; verified by running this suite there.
// Feature-detect the actual condition (not a Node-version string match) so
// the skip tracks the real host behavior instead of a guessed version cutoff.
const HOST_RUN_CALLS_ENTER_WITH = (() => {
  const probe = new AsyncLocalStorage<number>();
  let calledEnterWith = false;
  const originalEnterWith = probe.enterWith.bind(probe);
  probe.enterWith = (store: number) => {
    calledEnterWith = true;
    return originalEnterWith(store);
  };
  probe.run(1, () => undefined);
  return calledEnterWith;
})();

describe('inngestRoute', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is mountable on a Hono app', () => {
    const app = new Hono();
    expect(() => app.route('/v1', inngestRoute)).not.toThrow();
  });

  // [BUG-237] External path is /v1/inngest. The Inngest Cloud dashboard's
  // "serve URL" must match this path exactly or syncs / function dispatches
  // silently fall on the floor.
  it('responds to GET /v1/inngest (dashboard probe)', async () => {
    const app = new Hono();
    app.route('/v1', inngestRoute);

    const res = await app.request('/v1/inngest', { method: 'GET' });

    expect(res.status).toBe(200);
  });

  it('responds to POST /v1/inngest', async () => {
    const app = new Hono();
    app.route('/v1', inngestRoute);

    const res = await app.request('/v1/inngest', { method: 'POST' });

    expect(res.status).toBe(200);
  });

  it('responds to PUT /v1/inngest', async () => {
    const app = new Hono();
    app.route('/v1', inngestRoute);

    const res = await app.request('/v1/inngest', { method: 'PUT' });

    expect(res.status).toBe(200);
  });

  // [BUG-237 regression] The app already mounts this route under /v1. If the
  // route itself also includes /v1, production serves /v1/v1/inngest while the
  // documented /v1/inngest dashboard URL 404s.
  it('does NOT respond to double-prefixed /v1/v1/inngest path', async () => {
    const app = new Hono();
    app.route('/v1', inngestRoute);

    const res = await app.request('/v1/v1/inngest', { method: 'POST' });

    expect(res.status).toBe(404);
  });

  // [WI-1862] Skipped only on hosts whose AsyncLocalStorage.run() internally
  // calls enterWith() (see HOST_RUN_CALLS_ENTER_WITH above) — the mock below
  // would trip on the engine's own internals before the code under test ever
  // runs, producing a false failure unrelated to inngest.ts / helpers.ts. CI
  // (Node 22) does not match this condition and always runs this test.
  (HOST_RUN_CALLS_ENTER_WITH ? it.skip : it)(
    '[WI-1850] binds Worker env for the complete serve handler without enterWith',
    async () => {
      const enterWith = jest
        .spyOn(AsyncLocalStorage.prototype, 'enterWith')
        .mockImplementation(() => {
          throw new Error('asyncLocalStorage.enterWith() is not implemented');
        });

      const response = await inngestRoute.request(
        'https://api.mentomate.com/inngest',
        { method: 'POST' },
        {
          APP_URL: 'https://staging.mentomate.com',
          SUPPORT_EMAIL: 'staging-support@mentomate.com',
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        appUrl: 'https://staging.mentomate.com',
        supportEmail: 'staging-support@mentomate.com',
      });
      expect(enterWith).not.toHaveBeenCalled();
    },
  );
});
