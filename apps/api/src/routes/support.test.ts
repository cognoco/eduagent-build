jest.mock(
  '../services/support/spillover' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/support/spillover',
    ) as typeof import('../services/support/spillover');
    return {
      ...actual,
      recordOutboxSpillover: jest.fn(),
    };
  },
);

// [WI-179] Stub the rate-limit primitive so this fast unit test does not
// hit the real notification_log table. The DB-backed integration coverage
// for `checkAndLogRateLimit` lives in `services/settings.integration.test.ts`.
jest.mock(
  '../services/settings' /* gc1-allow: pattern-a — DB-bound primitive replaced by behavior-controlled stub; real check covered by settings.integration.test.ts */,
  () => {
    const actual = jest.requireActual(
      '../services/settings',
    ) as typeof import('../services/settings');
    return {
      ...actual,
      checkAndLogRateLimit: jest.fn().mockResolvedValue(false),
    };
  },
);

import { Hono } from 'hono';
import { supportRoutes } from './support';
import { recordOutboxSpillover } from '../services/support/spillover';
import { checkAndLogRateLimit } from '../services/settings';

const mockRecordOutboxSpillover = recordOutboxSpillover as jest.MockedFunction<
  typeof recordOutboxSpillover
>;
const mockCheckAndLogRateLimit = checkAndLogRateLimit as jest.MockedFunction<
  typeof checkAndLogRateLimit
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
    c.set('account' as never, {
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
    });
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

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckAndLogRateLimit.mockResolvedValue(false);
});

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

  // -------------------------------------------------------------------------
  // [WI-179] Per-profile rate limit. The clientId-uniqueness check does NOT
  // bound write volume — an attacker can keep minting fresh ids — so the
  // route enforces a per-profile rolling rate limit before the DB insert.
  // -------------------------------------------------------------------------

  it('[WI-179] within-budget requests reach recordOutboxSpillover', async () => {
    mockRecordOutboxSpillover.mockResolvedValue({ written: 1 });
    mockCheckAndLogRateLimit.mockResolvedValue(false);
    const app = createApp();

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [makeEntry('e1')] }),
    });

    expect(res.status).toBe(200);
    expect(mockCheckAndLogRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckAndLogRateLimit).toHaveBeenCalledWith(
      {},
      'test-profile-id',
      'test-account-id',
      'support_outbox_spillover',
      { hours: 1, maxCount: 20 },
      { identityV2Enabled: false },
    );
    expect(mockRecordOutboxSpillover).toHaveBeenCalledTimes(1);
  });

  it('[WI-179] over-budget request returns 429 with Retry-After header and never inserts', async () => {
    mockCheckAndLogRateLimit.mockResolvedValue(true);
    const app = createApp();

    const res = await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [makeEntry('e1')] }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.details).toEqual(expect.objectContaining({ retryAfter: 3600 }));
    expect(mockRecordOutboxSpillover).not.toHaveBeenCalled();
  });

  it('[WI-179] rate-limit check fires BEFORE the DB write — over-budget never reaches the service', async () => {
    mockCheckAndLogRateLimit.mockResolvedValue(true);
    const app = createApp();

    await app.request('/outbox-spillover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [makeEntry('e1'), makeEntry('e2')] }),
    });

    expect(mockCheckAndLogRateLimit).toHaveBeenCalledTimes(1);
    expect(mockRecordOutboxSpillover).not.toHaveBeenCalled();
  });
});
