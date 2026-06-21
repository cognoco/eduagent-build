// Mock Inngest client — in CI there is no Inngest dev server or event key,
// so the real `inngest.send()` throws when the feedback route queues a
// delivery-failed event. Every other route test follows this same pattern
// (see account.test.ts, books.test.ts, consent.test.ts).
jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => {
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

// Stub db for the feedback retry queue enqueue (the real
// enqueueFeedbackRetry service runs against it). Captures inserted values so
// tests can assert what was parked in the first-party row.
const TEST_RETRY_ID = '00000000-0000-7000-8000-0000000000fe';
const insertedRetryRows: Record<string, unknown>[] = [];
function createDbStub(options?: { failInsert?: boolean }) {
  return {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (options?.failInsert) {
            throw new Error('insert failed (stub)');
          }
          insertedRetryRows.push(values);
          return [{ id: TEST_RETRY_ID }];
        },
      }),
    }),
  };
}

function createTestApp(
  bindings?: Partial<FeedbackEnv['Bindings']>,
  userOverride?: { userId: string; profileId?: string },
  dbStub: unknown = createDbStub(),
) {
  const app = new Hono<FeedbackEnv>();
  app.use('*', async (c, next) => {
    c.set('user', {
      userId: userOverride?.userId ?? 'user-1',
      email: 'test@example.com',
    });
    c.set('profileId', userOverride?.profileId ?? 'profile-1');
    c.set('db', dbStub as FeedbackEnv['Variables']['db']);
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
  insertedRetryRows.length = 0;
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
      text: string;
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

  // FCR-2026-05-23-L2.L2.4: email body must NOT contain full UUIDs — identifiers
  // are truncated to first 8 chars for data-minimisation (GDPR).
  it('[FCR-L2.L2.4] email body contains truncated identifiers, not full UUIDs', async () => {
    const FULL_PROFILE_ID = 'prof-1234-5678-abcd-ef00-000000000001';
    const FULL_USER_ID = 'user-1234-5678-abcd-ef00-000000000002';
    const app = createTestApp(undefined, {
      userId: FULL_USER_ID,
      profileId: FULL_PROFILE_ID,
    });

    await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'Test data minimisation',
      }),
    });

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
    const sentBody = JSON.parse(init?.body as string) as { text: string };
    const emailText = sentBody.text ?? '';

    // Must NOT contain the full identifiers
    expect(emailText).not.toContain(FULL_PROFILE_ID);
    expect(emailText).not.toContain(FULL_USER_ID);

    // Must contain the truncated 8-char prefix
    expect(emailText).toContain(FULL_PROFILE_ID.slice(0, 8));
    expect(emailText).toContain(FULL_USER_ID.slice(0, 8));
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
        appVersion: '1.2.3',
        platform: 'ios',
        osVersion: '17.5',
      }),
    });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    // [F-090] The event carries only the opaque retryId reference + scoping
    // identifiers — the message/metaLines were parked in the first-party
    // feedback_retry_queue row instead (asserted below).
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'app/feedback.delivery_failed',
      data: {
        retryId: TEST_RETRY_ID,
        profileId: 'profile-bug767-fail',
        userId: 'user-bug767-fail',
      },
    });
    expect(insertedRetryRows).toHaveLength(1);
    expect(insertedRetryRows[0]).toMatchObject({
      profileId: 'profile-bug767-fail',
      userId: 'user-bug767-fail',
      category: 'bug',
      message: 'Crash on launch',
      // FCR-2026-05-23-L2.L2.4: metaLines contains truncated identifiers
      // (first 8 chars + ellipsis) for data-minimisation.
      metaLines: expect.stringContaining('Profile ID: profile-…'),
    });
  });

  // [F-090] Graceful degradation: a queue-insert failure must NOT break the
  // user's feedback action and must NOT fall back to placing the message in
  // the event payload — the retry is lost (Sentry has the case) and the
  // response reports queued:false honestly.
  it('[F-090] queue-insert failure: returns success with queued:false and dispatches NO event', async () => {
    const { inngest } = require('../inngest/client');
    (inngest.send as jest.Mock).mockClear();

    fetchSpy.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
      });
    });

    const app = createTestApp(
      undefined,
      { userId: 'user-f090-enqueue-fail', profileId: 'profile-f090-eq' },
      createDbStub({ failInsert: true }),
    );
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'bug', message: 'Crash on launch' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, queued: false });
    expect(inngest.send).not.toHaveBeenCalled();
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

  // ---------------------------------------------------------------------
  // PII egress break test: Inngest persists event payloads in its
  // third-party event store, so the user's feedback free-text and the
  // support address must never ride in the app/feedback.delivery_failed
  // event. The route parks the payload in the first-party
  // feedback_retry_queue row and the event carries the opaque row id only.
  // ---------------------------------------------------------------------
  it('[F-090] delivery_failed event carries an opaque retryId — never the feedback free-text or support address', async () => {
    const { inngest } = require('../inngest/client');
    (inngest.send as jest.Mock).mockClear();

    fetchSpy.mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
      });
    });

    const app = createTestApp(undefined, {
      userId: 'user-f090-fail',
      profileId: 'profile-f090-fail',
    });
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'My name is Milo Janssen and the quiz crashed',
        appVersion: '1.2.3',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, queued: true });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const [eventArg] = (inngest.send as jest.Mock).mock.calls[0] as [
      { name: string; data: Record<string, unknown> },
    ];
    expect(eventArg.name).toBe('app/feedback.delivery_failed');
    // Opaque reference + scoping identifiers only.
    expect(eventArg.data).toEqual({
      retryId: expect.any(String),
      profileId: 'profile-f090-fail',
      userId: 'user-f090-fail',
    });
    // The free-text and the support address must not appear ANYWHERE in the
    // event payload, under any key.
    const serialized = JSON.stringify(eventArg);
    expect(serialized).not.toContain('Milo Janssen');
    expect(serialized).not.toContain('quiz crashed');
    expect(serialized).not.toContain('support@mentomate.com');
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
