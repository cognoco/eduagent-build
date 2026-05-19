// ---------------------------------------------------------------------------
// Inngest Route Tests
// ---------------------------------------------------------------------------

jest.mock('../inngest' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest',
  ) as typeof import('../inngest');
  return {
    ...actual,
    inngest: { id: 'test-inngest' },
    functions: [],
  };
});

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue((_c: unknown) => new Response('OK')),
}));

import { Hono } from 'hono';
import { inngestRoute } from './inngest';

describe('inngestRoute', () => {
  it('is mountable on a Hono app', () => {
    const app = new Hono();
    expect(() => app.route('/v1', inngestRoute)).not.toThrow();
  });

  // [BUG-237] Path is /v1/inngest, not /inngest. The Inngest Cloud dashboard's
  // "serve URL" must match this path exactly or syncs / function dispatches
  // silently fall on the floor. The pre-fix tests asserted /inngest and would
  // happily pass with the wrong route mounted in production.
  it('responds to GET /v1/inngest (dashboard probe)', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/v1/inngest', { method: 'GET' });

    expect(res.status).toBe(200);
  });

  it('responds to POST /v1/inngest', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/v1/inngest', { method: 'POST' });

    expect(res.status).toBe(200);
  });

  it('responds to PUT /v1/inngest', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/v1/inngest', { method: 'PUT' });

    expect(res.status).toBe(200);
  });

  // [BUG-237] Break test — explicitly assert the legacy /inngest path is NOT
  // mounted. The previous code at routes/inngest.ts:8 mounted '/inngest';
  // this asserts that the move to '/v1/inngest' is total and never silently
  // serves both prefixes.
  it('does NOT respond to legacy /inngest path', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/inngest', { method: 'POST' });

    expect(res.status).toBe(404);
  });
});
