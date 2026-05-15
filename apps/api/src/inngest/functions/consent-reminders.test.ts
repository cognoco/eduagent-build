const mockGetConsentStatus = jest.fn();
const mockGetProfileConsentState = jest.fn();
const mockDeleteProfileIfNoConsent = jest.fn().mockResolvedValue(true);
const mockSendEmail = jest.fn();
const mockFormatConsentReminderEmail = jest.fn(
  (_email: string, _name: string, _days: number, _tokenUrl: string) => ({
    to: _email,
    subject: 'Consent reminder',
    body: `${_days} days left — ${_tokenUrl}`,
    type: 'consent_reminder' as const,
  }),
);

// Fake DB whose query.consentStates.findFirst returns a valid consent token.
// All values are defined inline inside the factory to avoid Jest hoisting issues.
jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: jest.fn(() => ({
      query: {
        consentStates: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ consentToken: 'test-token-abc123' }),
        },
      },
    })),
    getStepResendApiKey: jest.fn(() => 're_test_key'),
    getStepEmailFrom: jest.fn(() => 'noreply@mentomate.com'),
    getStepAppUrl: jest.fn(() => 'https://api.mentomate.com'),
  };
});

jest.mock(
  '../../services/consent' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/consent',
    ) as typeof import('../../services/consent');
    return {
      ...actual,
      getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
      getProfileConsentState: (...args: unknown[]) =>
        mockGetProfileConsentState(...args),
    };
  },
);

jest.mock(
  '../../services/notifications' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/notifications',
    ) as typeof import('../../services/notifications');
    return {
      ...actual,
      sendEmail: (...args: unknown[]) => mockSendEmail(...args),
      formatConsentReminderEmail: (...args: unknown[]) =>
        mockFormatConsentReminderEmail(
          ...(args as [string, string, number, string]),
        ),
    };
  },
);

jest.mock(
  '../../services/deletion' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/deletion',
    ) as typeof import('../../services/deletion');
    return {
      ...actual,
      deleteProfileIfNoConsent: (...args: unknown[]) =>
        mockDeleteProfileIfNoConsent(...args),
    };
  },
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { consentReminder } from './consent-reminders';

interface ProfileConsentState {
  status: string;
  parentEmail: string | null;
  consentType: string;
}

async function executeHandler(
  statusSequence: (string | null)[],
  profileState: ProfileConsentState | null = {
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent@example.com',
    consentType: 'GDPR',
  },
): Promise<void> {
  let callIndex = 0;
  mockGetConsentStatus.mockImplementation(async () => {
    const status = statusSequence[callIndex] ?? null;
    callIndex++;
    return status;
  });

  // parentEmail is looked up from DB via getProfileConsentState
  mockGetProfileConsentState.mockResolvedValue(profileState);

  const { step } = createInngestStepRunner();

  const handler = (consentReminder as any).fn;
  await handler({
    event: {
      id: 'evt-test-1',
      name: 'app/consent.requested',
      data: {
        profileId: 'profile-1',
        consentType: 'GDPR',
      },
    },
    step,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('consentReminder', () => {
  it('should be defined as an Inngest function', () => {
    expect(consentReminder).toBeTruthy();
  });

  it('should have the correct function id', () => {
    // The Inngest function object exposes its config

    const config = (consentReminder as any).opts;
    expect(config.id).toBe('consent-reminder');
  });

  it('should trigger on app/consent.requested event', () => {
    // Inngest v3 stores triggers in the config array

    const triggers = (consentReminder as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/consent.requested' }),
      ]),
    );
  });

  it('does not send email or delete when status is null (profile already deleted)', async () => {
    // All four steps return null (profile deleted before any reminder)
    await executeHandler([null, null, null, null]);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
  });

  it('sends reminders when status is PENDING', async () => {
    // All four steps return PENDING
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    // 3 reminder emails + 1 atomic delete via db.execute
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfileIfNoConsent).toHaveBeenCalled();
  });

  // [IMP-2] Token URL must reach the email body, not just the format call
  // — the original test only proved sendEmail was called, which would have
  // passed even if buildTokenUrl were silently broken.
  it('passes the built tokenUrl into both the formatter and the email body', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    const expectedTokenUrl =
      'https://api.mentomate.com/v1/consent-page?token=test-token-abc123';

    // Day 7 + Day 14 reminders go through formatConsentReminderEmail —
    // each call must receive the built tokenUrl as its 4th arg.
    expect(mockFormatConsentReminderEmail).toHaveBeenCalledTimes(2);
    for (const call of mockFormatConsentReminderEmail.mock.calls) {
      expect(call[3]).toBe(expectedTokenUrl);
    }

    // sendEmail must be invoked with an EmailOptions whose body contains the
    // tokenUrl — proves the URL actually lands in what the parent receives.
    const day7Email = mockSendEmail.mock.calls[0]?.[0] as
      | { body?: string }
      | undefined;
    const day14Email = mockSendEmail.mock.calls[1]?.[0] as
      | { body?: string }
      | undefined;
    expect(day7Email?.body).toContain(expectedTokenUrl);
    expect(day14Email?.body).toContain(expectedTokenUrl);
  });

  it('stops sending when consent is granted mid-sequence', async () => {
    // Day 7: PENDING (sends email), Day 14: CONSENTED (stops)
    await executeHandler(['PENDING', 'CONSENTED', 'CONSENTED', 'CONSENTED']);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
  });

  it('does not delete when status becomes null at day 30', async () => {
    // Reminders sent (PENDING), but by day 30 profile is gone (null)
    await executeHandler(['PENDING', 'PENDING', 'PENDING', null]);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
  });

  it('does not delete when status is WITHDRAWN at day 30', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
  });

  it('does not send email when parentEmail is not found in DB', async () => {
    // Pass null profile state so parentEmail lookup returns null
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING'], null);

    // No emails sent because parentEmail lookup returns null
    expect(mockSendEmail).not.toHaveBeenCalled();
    // Atomic delete still happens because consent status is PENDING
    expect(mockDeleteProfileIfNoConsent).toHaveBeenCalled();
  });

  // [BUG-699] Inngest step retries can replay sendEmail. Each reminder step
  // must pass a deterministic Idempotency-Key bound to (profileId, eventId,
  // stepId) so Resend dedupes duplicate calls across retries.
  it('[BUG-699] forwards a unique idempotencyKey per reminder step', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);

    const day7Opts = mockSendEmail.mock.calls[0][1] as {
      idempotencyKey?: string;
    };
    const day14Opts = mockSendEmail.mock.calls[1][1] as {
      idempotencyKey?: string;
    };
    const day25Opts = mockSendEmail.mock.calls[2][1] as {
      idempotencyKey?: string;
    };

    expect(day7Opts.idempotencyKey).toBe(
      'value(consent-reminder):value(profile-1):value(evt-test-1):value(day-7)',
    );
    expect(day14Opts.idempotencyKey).toBe(
      'value(consent-reminder):value(profile-1):value(evt-test-1):value(day-14)',
    );
    expect(day25Opts.idempotencyKey).toBe(
      'value(consent-reminder):value(profile-1):value(evt-test-1):value(day-25-final)',
    );

    // The keys must be distinct per step — otherwise Resend would dedupe
    // legitimate later reminders against an earlier one.
    const keys = new Set([
      day7Opts.idempotencyKey,
      day14Opts.idempotencyKey,
      day25Opts.idempotencyKey,
    ]);
    expect(keys.size).toBe(3);
  });
});
