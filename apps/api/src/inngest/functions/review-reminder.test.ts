import { reviewReminder } from './review-reminder';

// Mock the helpers and services used by the review-reminder function
jest.mock('../helpers', () => ({
  getStepDatabase: jest.fn().mockReturnValue('mock-db'),
}));

const mockGetNotificationPrefs = jest.fn();
const mockGetDailyNotificationCount = jest.fn();
jest.mock('../../services/settings', () => ({
  getNotificationPrefs: (...args: unknown[]) =>
    mockGetNotificationPrefs(...args),
  getDailyNotificationCount: (...args: unknown[]) =>
    mockGetDailyNotificationCount(...args),
}));

const mockSendPushNotification = jest.fn();
jest.mock('../../services/notifications', () => ({
  sendPushNotification: (...args: unknown[]) =>
    mockSendPushNotification(...args),
  formatReviewReminderBody: jest
    .fn()
    .mockReturnValue('Your Chemistry topics are fading — 4 minutes would help'),
  MAX_DAILY_PUSH: 3,
}));

// ---------------------------------------------------------------------------
// Structural tests
// ---------------------------------------------------------------------------

describe('reviewReminder', () => {
  it('should be defined as an Inngest function', () => {
    expect(reviewReminder).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (reviewReminder as any).opts;
    expect(config.id).toBe('review-reminder');
  });

  it('should trigger on app/retention.review-due event', () => {
    const triggers = (reviewReminder as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/retention.review-due' }),
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// Handler logic tests (via Inngest step mock)
// ---------------------------------------------------------------------------

describe('reviewReminder handler', () => {
  let handler: (ctx: { event: any; step: any }) => Promise<any>;
  let stepRun: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Extract the handler function from the Inngest function config
    handler = (reviewReminder as any).fn;
    stepRun = jest
      .fn()
      .mockImplementation((_name: string, fn: () => any) => fn());
  });

  const makeEvent = (overrides: Record<string, unknown> = {}) => ({
    data: {
      profileId: 'profile-1',
      topicIds: ['topic-1', 'topic-2'],
      subjectNames: ['Chemistry'],
      ...overrides,
    },
  });

  it('sends notification when preferences are enabled and cap not exceeded', async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      pushEnabled: true,
      reviewReminders: true,
    });
    mockGetDailyNotificationCount.mockResolvedValue(1);
    mockSendPushNotification.mockResolvedValue({
      sent: true,
      ticketId: 'ticket-abc',
    });

    const result = await handler({
      event: makeEvent(),
      step: { run: stepRun },
    });

    expect(result.status).toBe('sent');
    expect(result.profileId).toBe('profile-1');
    expect(result.topicCount).toBe(2);
    expect(stepRun).toHaveBeenCalledWith(
      'send-review-notification',
      expect.any(Function)
    );
  });

  it('skips when push is disabled', async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      pushEnabled: false,
      reviewReminders: true,
    });

    const result = await handler({
      event: makeEvent(),
      step: { run: stepRun },
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('notifications_disabled');
  });

  it('skips when review reminders are disabled', async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      pushEnabled: true,
      reviewReminders: false,
    });

    const result = await handler({
      event: makeEvent(),
      step: { run: stepRun },
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('notifications_disabled');
  });

  it('skips when daily cap is exceeded', async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      pushEnabled: true,
      reviewReminders: true,
    });
    mockGetDailyNotificationCount.mockResolvedValue(3);

    const result = await handler({
      event: makeEvent(),
      step: { run: stepRun },
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('daily_cap_exceeded');
  });

  it('handles missing subjectNames gracefully', async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      pushEnabled: true,
      reviewReminders: true,
    });
    mockGetDailyNotificationCount.mockResolvedValue(0);
    mockSendPushNotification.mockResolvedValue({ sent: true });

    const result = await handler({
      event: makeEvent({ subjectNames: undefined }),
      step: { run: stepRun },
    });

    expect(result.status).toBe('sent');
  });

  it('handles missing topicIds gracefully', async () => {
    mockGetNotificationPrefs.mockResolvedValue({
      pushEnabled: true,
      reviewReminders: true,
    });
    mockGetDailyNotificationCount.mockResolvedValue(0);
    mockSendPushNotification.mockResolvedValue({ sent: true });

    const result = await handler({
      event: makeEvent({ topicIds: undefined }),
      step: { run: stepRun },
    });

    expect(result.status).toBe('sent');
    expect(result.topicCount).toBe(0);
  });
});
