jest.mock('../services/support/spillover', () => {
  // gc1-allow: requireActual + targeted override for recordOutboxSpillover side effect
  const actual = jest.requireActual('../services/support/spillover') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    recordOutboxSpillover: jest.fn(),
  };
});

import { Hono } from 'hono';
import { supportRoutes } from './support';
import { recordOutboxSpillover } from '../services/support/spillover';

const mockRecordOutboxSpillover = recordOutboxSpillover as jest.MockedFunction<
  typeof recordOutboxSpillover
>;

const NO_PROFILE = Symbol('no-profile');

function createApp(profileId: string | typeof NO_PROFILE = 'test-profile-id') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, {});
    if (profileId !== NO_PROFILE) {
      c.set('profileId' as never, profileId);
    }
    c.set('user' as never, { id: 'test-user' });
    await next();
  });
  app.route('/', supportRoutes);
  return app;
}

function makeEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    flow: 'session',
    surfaceKey: 'chat-input',
    content: `Test message ${id}`,
    attempts: 3,
    firstAttemptedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('POST /outbox-spillover', () => {
  it('valid request returns 200 and calls recordOutboxSpillover with correct args', async () => {
    mockRecordOutboxSpillover.mockResolvedValueOnce({ written: 2 });
    const app = createApp();
    const entries = [makeEntry('e1'), makeEntry('e2')];

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ written: 2 });
    expect(mockRecordOutboxSpillover).toHaveBeenCalledTimes(1);
    expect(mockRecordOutboxSpillover).toHaveBeenCalledWith(
      {},
      'test-profile-id',
      entries,
    );
  });

  it('missing profileId returns 400', async () => {
    const app = createApp(NO_PROFILE);

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [makeEntry('e1')] }),
    });

    expect(res.status).toBe(400);
    expect(mockRecordOutboxSpillover).not.toHaveBeenCalled();
  });

  it('empty entries array returns 400', async () => {
    const app = createApp();

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    });

    expect(res.status).toBe(400);
    expect(mockRecordOutboxSpillover).not.toHaveBeenCalled();
  });

  it('entry with content exceeding 8000 chars returns 400', async () => {
    const app = createApp();
    const oversizedContent = 'x'.repeat(8001);

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [makeEntry('e1', { content: oversizedContent })],
      }),
    });

    expect(res.status).toBe(400);
    expect(mockRecordOutboxSpillover).not.toHaveBeenCalled();
  });

  it('when recordOutboxSpillover returns { written: 0 } the response reflects it', async () => {
    mockRecordOutboxSpillover.mockResolvedValueOnce({ written: 0 });
    const app = createApp();

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [makeEntry('e1')] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ written: 0 });
  });
});
