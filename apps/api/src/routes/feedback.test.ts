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

function createTestApp(bindings?: Partial<FeedbackEnv['Bindings']>) {
  const app = new Hono<FeedbackEnv>();
  app.use('*', async (c, next) => {
    c.set('user', { userId: 'user-1', email: 'test@example.com' });
    c.set('profileId', 'profile-1');
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

    const [, init] = resendCalls[0];
    const sentBody = JSON.parse(init?.body as string) as {
      to: string[];
      subject: string;
      from: string;
    };
    expect(sentBody.to).toEqual(['support@mentomate.app']);
    expect(sentBody.subject).toContain('Bug');
    expect(sentBody.from).toBe(TEST_EMAIL_FROM);
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${TEST_API_KEY}`,
      })
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
