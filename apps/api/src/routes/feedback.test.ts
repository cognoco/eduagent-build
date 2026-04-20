import { Hono } from 'hono';
import { feedbackRoutes } from './feedback';
import * as notifications from '../services/notifications';

jest.mock('../services/notifications', () => ({
  ...jest.requireActual('../services/notifications'),
  sendEmail: jest.fn().mockResolvedValue({ sent: true, messageId: 'test-id' }),
}));

const mockSendEmail = notifications.sendEmail as jest.MockedFunction<
  typeof notifications.sendEmail
>;

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

function createTestApp() {
  const app = new Hono<FeedbackEnv>();
  app.use('*', async (c, next) => {
    c.set('user', { userId: 'user-1', email: 'test@example.com' });
    c.set('profileId', 'profile-1');
    await next();
  });
  app.route('/', feedbackRoutes);
  return app;
}

describe('POST /feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid feedback and sends email', async () => {
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
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'support@mentomate.app',
        subject: expect.stringContaining('Bug'),
        type: 'feedback',
      }),
      expect.any(Object)
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

  it('returns success even if email fails (graceful degradation)', async () => {
    mockSendEmail.mockResolvedValueOnce({ sent: false, reason: 'no_api_key' });
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
    expect(await res.json()).toEqual({ success: true });
  });
});
