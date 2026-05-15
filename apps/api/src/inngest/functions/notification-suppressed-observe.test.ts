// ---------------------------------------------------------------------------
// Notification Suppressed Observer — Tests
//
// These tests pin two behaviours:
//   1. A well-formed app/notification.suppressed event resolves successfully
//      and emits a structured warn log so the suppression is queryable.
//   2. A malformed event payload throws and reports to Sentry — Inngest must
//      retry / dead-letter rather than silently swallowing schema drift.
//
// Reference: CLAUDE.md > Fix Verification Rules — "Silent recovery without
// escalation is banned".
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../../services/sentry'),
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
jest.mock(
  '../../services/logger' /* gc1-allow: pattern-a conversion */,
  () => ({
    createLogger: () => ({
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: (...args: unknown[]) => mockLoggerError(...args),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  }),
);

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../client'),
  inngest: {
    createFunction: jest.fn((_config, _trigger, handler) => ({
      fn: handler,
      opts: _config,
      _trigger,
    })),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { notificationSuppressedObserve } from './notification-suppressed-observe';

async function invoke(eventData: unknown) {
  const handler = (notificationSuppressedObserve as any).fn;
  return handler({
    event: { id: 'evt-suppressed-001', data: eventData },
  });
}

describe('notificationSuppressedObserve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a structured warn line and returns observed:true on a valid payload', async () => {
    const profileId = '11111111-1111-4111-8111-111111111111';
    const result = await invoke({
      profileId,
      notificationType: 'daily_reminder',
      reason: 'dedup_check_failed',
      timestamp: new Date().toISOString(),
    });

    expect(result).toEqual({
      observed: true,
      notificationType: 'daily_reminder',
      reason: 'dedup_check_failed',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[notification-suppressed]',
      expect.objectContaining({
        profileId,
        notificationType: 'daily_reminder',
        reason: 'dedup_check_failed',
      }),
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  // Break test for the silent-recovery fix. Pre-fix the handler returned
  // { observed: false, reason: 'invalid_payload' } on schema failure, marking
  // the run completed and burying the signal — this asserts we throw + Sentry.
  it('throws and reports to Sentry on a malformed payload (no silent recovery)', async () => {
    await expect(invoke({ totally: 'wrong-shape' })).rejects.toThrow(
      /invalid event payload/i,
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'notification-suppressed-observe:invalid_payload',
        }),
      }),
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[notification-suppressed] invalid event payload',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });
});
