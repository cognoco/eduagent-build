// ---------------------------------------------------------------------------
// Inngest Route Tests
// ---------------------------------------------------------------------------

jest.mock('../inngest', () => ({
  inngest: { id: 'test-inngest' },
  functions: [],
}));

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

  it('responds to GET /inngest (dashboard probe)', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/inngest', { method: 'GET' });

    expect(res.status).toBe(200);
  });

  it('responds to POST /inngest', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/inngest', { method: 'POST' });

    expect(res.status).toBe(200);
  });

  it('responds to PUT /inngest', async () => {
    const app = new Hono();
    app.route('/', inngestRoute);

    const res = await app.request('/inngest', { method: 'PUT' });

    expect(res.status).toBe(200);
  });
});
