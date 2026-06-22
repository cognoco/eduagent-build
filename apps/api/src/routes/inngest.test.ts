// ---------------------------------------------------------------------------
// Inngest Route Tests
// ---------------------------------------------------------------------------

jest.mock('../inngest', () => {
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
});
