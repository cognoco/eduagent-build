import {
  sendPushNotification,
  formatReviewReminderBody,
  formatDailyReminderBody,
  MAX_DAILY_PUSH,
  type NotificationPayload,
} from './notifications';

// ---------------------------------------------------------------------------
// sendPushNotification
// ---------------------------------------------------------------------------

describe('sendPushNotification', () => {
  it('returns a mock success result', async () => {
    const payload: NotificationPayload = {
      profileId: 'profile-1',
      title: 'Review Reminder',
      body: 'Time to review!',
      type: 'review_reminder',
    };

    const result = await sendPushNotification(payload);

    expect(result.sent).toBe(true);
    expect(result.ticketId).toBe('mock-ticket');
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
