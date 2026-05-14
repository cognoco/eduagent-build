// Mock Inngest client — in CI there is no Inngest dev server or event key,
// so the real `inngest.send()` throws when the feedback route queues a
// delivery-failed event. Every other route test follows this same pattern
// (see account.test.ts, books.test.ts, consent.test.ts).
jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
    },
  };
});

import { Hono } from 'hono';
import { feedbackRoutes } from './feedback';

const RESEND_API_URL = 'https://api.resend.com/emails';
const TEST_API_KEY = 'test-resend-key';
const TEST_EMAIL_FROM = 'noreply@test.com';

type FeedbackEnv = {
  Variables: {
    user: { userId: string; email?: string };
    db: unknown;
    profileId: string | undefined;
  };
  Bindings: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    SUPPORT_EMAIL?: string;
  };
};

function createTestApp(
  bindings?: Partial<FeedbackEnv['Bindings']>,
  userOverride?: { userId: string; profileId?: string },
) {
  const app = new Hono<FeedbackEnv>();
  app.use('*', async (c, next) => {
    c.set('user', {
      userId: userOverride?.userId ?? 'user-1',
      email: 'test@example.com',
    });
    c.set('profileId', userOverride?.profileId ?? 'profile-1');
    // Inject bindings so sendEmail actually attempts the Resend fetch
    c.env = {
      RESEND_API_KEY: TEST_API_KEY,
      EMAIL_FROM: TEST_EMAIL_FROM,
      ...bindings,
    } as FeedbackEnv['Bindings'];
    await next();
  });
  app.route('/', feedbackRoutes);
  return app;
}

const originalFetch = globalThis.fetch;
let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>;

beforeEach(() => {
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url === RESEND_API_URL) {
        return new Response(JSON.stringify({ id: 'test-message-id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Pass through any non-Resend fetch (shouldn't happen in these tests)
      return originalFetch(input, init);
    });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('POST /feedback', () => {
  // Unit test: mocks Resend HTTP boundary (globalThis.fetch) to test route handler in isolation. For full email delivery, see integration tests.
  it('accepts valid feedback and calls sendEmail with correct payload (verified via Resend HTTP mock)', async () => {
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'The quiz crashes when I tap submit',
        appVersion: '1.0.0',
        platform: 'ios',
        osVersion: '18.2',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify fetch was called with Resend API
    const resendCalls = fetchSpy.mock.calls.filter(([input]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      return url === RESEND_API_URL;
    });
    expect(resendCalls).toHaveLength(1);

    const [, init] = resendCalls[0]!;
    const sentBody = JSON.parse(init?.body as string) as {
      to: string[];
      subject: string;
      from: string;
    };
    expect(sentBody.to).toEqual(['support@mentomate.com']);
    expect(sentBody.subject).toContain('Bug');
    expect(sentBody.from).toBe(TEST_EMAIL_FROM);
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${TEST_API_KEY}`,
      }),
    );
  });

  it('rejects empty message', async () => {
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'bug', message: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid category', async () => {
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'rant', message: 'Hello' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns success even if Resend API returns an error (graceful degradation)', async () => {
    fetchSpy.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
      });
    });
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'suggestion',
        message: 'Add dark mode',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, queued: true });
  });

  // [BUG-767 / A-24] BREAK TESTS. The route MUST dispatch the
  // app/feedback.delivery_failed event whenever the synchronous send fails,
  // and the consumer (feedback-delivery-failed Inngest function) is what
  // turns that event into a retry. Pre-fix audit found the event was wired
  // here but had no consumer — every queued retry was a black hole.
  //
  // Use unique userIds to avoid colliding with the in-memory feedback rate
  // limit (5/hour/userId) accumulated by earlier tests in this suite.
  it('[BUG-767 / A-24] dispatches app/feedback.delivery_failed when sendEmail fails', async () => {
    const { inngest } = require('../inngest/client');
    (inngest.send as jest.Mock).mockClear();

    fetchSpy.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
      });
    });

    const app = createTestApp(undefined, {
      userId: 'user-bug767-fail',
      profileId: 'profile-bug767-fail',
    });
    await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'Crash on launch',
      }),
    });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/feedback.delivery_failed',
      data: { profileId: 'profile-bug767-fail', category: 'bug' },
    });
  });

  it('[BUG-767 / A-24] does NOT dispatch retry event when sendEmail succeeds', async () => {
    const { inngest } = require('../inngest/client');
    (inngest.send as jest.Mock).mockClear();

    const app = createTestApp(undefined, {
      userId: 'user-bug767-ok',
      profileId: 'profile-bug767-ok',
    });
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'other', message: 'Looks great' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, queued: false });
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('returns success even if Resend fetch throws (network failure)', async () => {
    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('Network unreachable');
    });
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'Something broke',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, queued: true });
  });

  it('skips email when RESEND_API_KEY is not configured', async () => {
    const app = createTestApp({ RESEND_API_KEY: undefined });
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'No key configured',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, queued: true });

    // Verify no fetch to Resend was attempted
    const resendCalls = fetchSpy.mock.calls.filter(([input]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      return url === RESEND_API_URL;
    });
    expect(resendCalls).toHaveLength(0);
  });
});
