import {
  sendPushNotification,
  sendEmail,
  isExpoPushToken,
  formatReviewReminderBody,
  formatDailyReminderBody,
  formatRecallNudge,
  formatStruggleNotificationCopy,
  MAX_DAILY_PUSH,
  type NotificationPayload,
  type EmailPayload,
} from './notifications';
import type { Database } from '@eduagent/database';

// ---------------------------------------------------------------------------
// Mock settings service (getPushToken, getDailyNotificationCount, logNotification)
// ---------------------------------------------------------------------------

const mockGetPushToken = jest.fn();
const mockGetDailyNotificationCount = jest.fn();
const mockLogNotification = jest.fn();

jest.mock('./settings', () => ({
  getPushToken: (...args: unknown[]) => mockGetPushToken(...args),
  getDailyNotificationCount: (...args: unknown[]) =>
    mockGetDailyNotificationCount(...args),
  logNotification: (...args: unknown[]) => mockLogNotification(...args),
}));

// ---------------------------------------------------------------------------
// Mock global fetch for Expo Push API
// ---------------------------------------------------------------------------

const mockFetchFn = jest.fn();
global.fetch = mockFetchFn;

const mockDb = {} as Database;

// ---------------------------------------------------------------------------
// isExpoPushToken
// ---------------------------------------------------------------------------

describe('isExpoPushToken', () => {
  it('accepts ExponentPushToken format', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
  });

  it('accepts ExpoPushToken format', () => {
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
  });

  it('accepts alphanumeric token strings', () => {
    expect(isExpoPushToken('abc-123_def')).toBe(true);
  });

  it('rejects tokens with invalid characters', () => {
    expect(isExpoPushToken('invalid token with spaces')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sendPushNotification
// ---------------------------------------------------------------------------

describe('sendPushNotification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const payload: NotificationPayload = {
    profileId: 'profile-1',
    title: 'Review Reminder',
    body: 'Time to review!',
    type: 'review_reminder',
  };

  it('returns no_push_token when no token registered', async () => {
    mockGetPushToken.mockResolvedValue(null);

    const result = await sendPushNotification(mockDb, payload);

    expect(result).toEqual({ sent: false, reason: 'no_push_token' });
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('returns invalid_token when token format is bad', async () => {
    mockGetPushToken.mockResolvedValue('invalid token with spaces');

    const result = await sendPushNotification(mockDb, payload);

    expect(result).toEqual({ sent: false, reason: 'invalid_token' });
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('returns daily_cap_exceeded when cap reached', async () => {
    mockGetPushToken.mockResolvedValue('ExponentPushToken[abc123]');
    mockGetDailyNotificationCount.mockResolvedValue(3);

    const result = await sendPushNotification(mockDb, payload);

    expect(result).toEqual({ sent: false, reason: 'daily_cap_exceeded' });
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('sends via Expo Push API and returns ticket', async () => {
    mockGetPushToken.mockResolvedValue('ExponentPushToken[abc123]');
    mockGetDailyNotificationCount.mockResolvedValue(1);
    mockFetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'ticket-xyz', status: 'ok' } }),
    });
    mockLogNotification.mockResolvedValue(undefined);

    const result = await sendPushNotification(mockDb, payload);

    expect(result).toEqual({ sent: true, ticketId: 'ticket-xyz' });
    expect(mockFetchFn).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ExponentPushToken[abc123]'),
      })
    );
    expect(mockLogNotification).toHaveBeenCalledWith(
      mockDb,
      'profile-1',
      'review_reminder',
      'ticket-xyz'
    );
  });

  it('returns error on non-200 Expo API response', async () => {
    mockGetPushToken.mockResolvedValue('ExponentPushToken[abc123]');
    mockGetDailyNotificationCount.mockResolvedValue(0);
    mockFetchFn.mockResolvedValue({ ok: false, status: 429 });

    const result = await sendPushNotification(mockDb, payload);

    expect(result).toEqual({ sent: false, reason: 'expo_api_error_429' });
  });

  it('returns network_error on fetch failure', async () => {
    mockGetPushToken.mockResolvedValue('ExponentPushToken[abc123]');
    mockGetDailyNotificationCount.mockResolvedValue(0);
    mockFetchFn.mockRejectedValue(new Error('fetch failed'));

    const result = await sendPushNotification(mockDb, payload);

    expect(result).toEqual({ sent: false, reason: 'network_error' });
  });
});

// ---------------------------------------------------------------------------
// formatReviewReminderBody
// ---------------------------------------------------------------------------

describe('formatReviewReminderBody', () => {
  it('formats body with single subject', () => {
    const body = formatReviewReminderBody(3, ['Chemistry']);

    expect(body).toContain('Chemistry');
    expect(body).toContain('fading');
  });

  it('formats body with multiple subjects', () => {
    const body = formatReviewReminderBody(5, ['Chemistry', 'Biology']);

    expect(body).toContain('Chemistry');
    expect(body).toContain('Biology');
    expect(body).toContain('fading');
  });

  it('suggests appropriate time for single fading topic', () => {
    const body = formatReviewReminderBody(1, ['Maths']);

    expect(body).toContain('4 minutes');
  });

  it('multiplies time for multiple fading topics', () => {
    const body = formatReviewReminderBody(3, ['Maths']);

    expect(body).toContain('6 minutes');
  });
});

// ---------------------------------------------------------------------------
// formatDailyReminderBody
// ---------------------------------------------------------------------------

describe('formatDailyReminderBody', () => {
  it('includes streak count for active streak', () => {
    const body = formatDailyReminderBody(12);

    expect(body).toContain('12-day streak');
    expect(body).toContain('Quick review');
  });

  it('encourages starting a new streak when count is 0', () => {
    const body = formatDailyReminderBody(0);

    expect(body).toContain('Start a new streak');
  });
});

// ---------------------------------------------------------------------------
// MAX_DAILY_PUSH
// ---------------------------------------------------------------------------

describe('MAX_DAILY_PUSH', () => {
  it('is set to 3', () => {
    expect(MAX_DAILY_PUSH).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// sendEmail (Resend integration)
// ---------------------------------------------------------------------------

describe('sendEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const emailPayload: EmailPayload = {
    to: 'parent@example.com',
    subject: 'Consent required',
    body: 'Please approve your child.',
    type: 'consent_request',
  };

  it('returns no_api_key when RESEND_API_KEY is not provided', async () => {
    const result = await sendEmail(emailPayload);

    expect(result).toEqual({ sent: false, reason: 'no_api_key' });
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('sends email via Resend API and returns message ID', async () => {
    mockFetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-abc123' }),
    });

    const result = await sendEmail(emailPayload, {
      resendApiKey: 're_test_key',
      emailFrom: 'test@mentomate.com',
    });

    expect(result).toEqual({ sent: true, messageId: 'msg-abc123' });
    expect(mockFetchFn).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
        }),
        body: expect.stringContaining('parent@example.com'),
      })
    );
  });

  it('returns error on Resend API failure (422)', async () => {
    mockFetchFn.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Validation error',
    });

    const result = await sendEmail(emailPayload, {
      resendApiKey: 're_test_key',
    });

    expect(result).toEqual({ sent: false, reason: 'resend_api_error_422' });
  });

  it('returns network_error on fetch failure', async () => {
    mockFetchFn.mockRejectedValue(new Error('network down'));

    const result = await sendEmail(emailPayload, {
      resendApiKey: 're_test_key',
    });

    expect(result).toEqual({ sent: false, reason: 'network_error' });
  });

  // [BUG-699] Inngest step retries can replay sendEmail calls. Forwarding the
  // optional idempotency key as `Idempotency-Key` lets Resend dedupe duplicate
  // sends within their 24h window.
  it('[BUG-699] forwards idempotencyKey as Idempotency-Key header when provided', async () => {
    mockFetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-id' }),
    });

    await sendEmail(emailPayload, {
      resendApiKey: 're_test_key',
      idempotencyKey: 'consent-reminder:profile-1:evt-1:day-7',
    });

    expect(mockFetchFn).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'consent-reminder:profile-1:evt-1:day-7',
        }),
      })
    );
  });

  it('[BUG-699] omits Idempotency-Key header when not provided', async () => {
    mockFetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-id' }),
    });

    await sendEmail(emailPayload, {
      resendApiKey: 're_test_key',
    });

    const headers = mockFetchFn.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatRecallNudge
// ---------------------------------------------------------------------------

describe('formatRecallNudge', () => {
  it('returns third-person copy for guardian role', () => {
    const result = formatRecallNudge(2, 'Algebra', 'guardian', 'Emma');
    expect(result.title).toBe('Review reminder');
    expect(result.body).toContain('Emma');
    expect(result.body).toContain('2 topics');
  });

  it('uses fallback child name when childName omitted for guardian', () => {
    const result = formatRecallNudge(1, 'Chemistry', 'guardian');
    expect(result.body).toContain('Your learner');
  });

  it('returns topic title as notification title for single fading topic (self_learner)', () => {
    const result = formatRecallNudge(1, 'Quadratic Equations', 'self_learner');
    expect(result.title).toBe('Quadratic Equations');
    expect(result.body).toContain('fade');
  });

  it('returns count-based title for multiple fading topics (self_learner)', () => {
    const result = formatRecallNudge(3, 'Algebra', 'self_learner');
    expect(result.title).toBe('3 topics need a refresh');
    expect(result.body).toContain('Algebra');
    expect(result.body).toContain('6 minutes');
  });

  it('uses singular topic in guardian body for count=1', () => {
    const result = formatRecallNudge(1, 'Physics', 'guardian', 'Sam');
    expect(result.body).toContain('1 topic');
    expect(result.body).not.toContain('topics');
  });
});

// ---------------------------------------------------------------------------
// formatStruggleNotificationCopy (FR247.6, FR247.7)
// ---------------------------------------------------------------------------

describe('formatStruggleNotificationCopy', () => {
  it('returns softer copy for struggle_noticed', () => {
    const copy = formatStruggleNotificationCopy(
      'struggle_noticed',
      'fractions',
      'Alex'
    );
    expect(copy.title).toBe('Learning update');
    expect(copy.body).toContain('Alex');
    expect(copy.body).toContain('fractions');
    expect(copy.body).toContain('challenging');
    expect(copy.body).not.toContain('extra support');
  });

  it('returns stronger copy for struggle_flagged', () => {
    const copy = formatStruggleNotificationCopy(
      'struggle_flagged',
      'fractions',
      'Alex'
    );
    expect(copy.title).toBe('Learning update');
    expect(copy.body).toContain('Alex');
    expect(copy.body).toContain('fractions');
    expect(copy.body).toContain('extra support');
  });

  it('returns celebration copy for struggle_resolved', () => {
    const copy = formatStruggleNotificationCopy(
      'struggle_resolved',
      'fractions',
      'Alex'
    );
    expect(copy.title).toContain('Great news');
    expect(copy.body).toContain('Alex');
    expect(copy.body).toContain('fractions');
    expect(copy.body).toContain('overcome');
  });

  it('uses fallback name when childName is not provided', () => {
    const copy = formatStruggleNotificationCopy(
      'struggle_noticed',
      'fractions',
      null
    );
    expect(copy.body).toContain('Your child');
  });
});
