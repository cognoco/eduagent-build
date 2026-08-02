const mockLoginFindFirst = jest.fn();
const mockSendEmail = jest.fn();
const mockSendPushNotification = jest.fn();

const mockDb = {
  query: {
    login: {
      findFirst: (...args: unknown[]) => mockLoginFindFirst(...args),
    },
  },
};

// Internal-boundary exception: this workflow unit test isolates the retry
// decision from request-scoped helpers, Neon, and notification transports.
// The overrides below are limited to those effects; real service behavior is
// covered by their dedicated tests.
jest.mock(
  '../helpers' /* gc1-allow: request-scoped DB and environment bindings */,
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return {
      ...actual,
      getStepDatabase: () => mockDb,
      getStepEnvironment: () => 'test',
      getStepResendApiKey: () => 're_test_key',
      getStepEmailFrom: () => 'noreply@mentomate.com',
    };
  },
);

jest.mock(
  '../../services/notifications' /* gc1-allow: external Expo and Resend delivery boundary */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendEmail: (...args: unknown[]) => mockSendEmail(...args),
      sendPushNotification: (...args: unknown[]) =>
        mockSendPushNotification(...args),
    };
  },
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { familyJoinStoreCancelNudge } from './family-join-store-cancel-nudge';

const EVENT_DATA = {
  teenPersonId: '11111111-1111-4111-8111-111111111111',
  familyOrgId: '22222222-2222-4222-8222-222222222222',
  revenuecatOriginalAppUserId: 'rc-original-user',
};

async function executeHandler() {
  const runner = createInngestStepRunner();
  const handler = (familyJoinStoreCancelNudge as any).fn;
  return handler({
    event: {
      id: 'evt-family-store-cancel',
      name: 'app/family_join.store_cancel_nudge_requested',
      data: EVENT_DATA,
    },
    step: runner.step,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoginFindFirst.mockResolvedValue({ email: 'teen@example.com' });
  mockSendPushNotification.mockResolvedValue({ sent: true });
  mockSendEmail.mockResolvedValue({ sent: true, retryability: 'none' });
});

describe('familyJoinStoreCancelNudge email retry handling', () => {
  it('[WI-2788] rejects the workflow so Inngest retries a transient email failure', async () => {
    mockSendEmail.mockResolvedValue({
      sent: false,
      reason: 'resend_503',
      retryability: 'transient',
    });

    await expect(executeHandler()).rejects.toThrow(
      'family-join-store-cancel-nudge transient email failure',
    );
  });

  it.each([
    ['permanent', 'invalid_recipient'],
    ['none', 'no_resend_api_key'],
  ])(
    '[WI-2788] treats a %s email failure as terminal',
    async (retryability, reason) => {
      mockSendEmail.mockResolvedValue({
        sent: false,
        reason,
        retryability,
      });

      await expect(executeHandler()).resolves.toEqual(
        expect.objectContaining({
          status: 'processed',
          email: expect.objectContaining({ sent: false, retryability }),
        }),
      );
    },
  );

  it('skips email delivery without retry when the person has no login email', async () => {
    mockLoginFindFirst.mockResolvedValue(null);

    await expect(executeHandler()).resolves.toEqual(
      expect.objectContaining({
        status: 'processed',
        email: { sent: false, reason: 'no_email' },
      }),
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
