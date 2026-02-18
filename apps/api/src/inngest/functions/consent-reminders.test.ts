const mockGetConsentStatus = jest.fn();
const mockDeleteProfile = jest.fn();
const mockSendEmail = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: jest.fn(() => ({})),
}));

jest.mock('../../services/consent', () => ({
  getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
}));

jest.mock('../../services/deletion', () => ({
  deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
}));

jest.mock('../../services/notifications', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  formatConsentReminderEmail: jest.fn(
    (_email: string, _name: string, _days: number) => ({
      to: _email,
      subject: 'Consent reminder',
      body: `${_days} days left`,
      type: 'consent_reminder',
    })
  ),
}));

import { consentReminder } from './consent-reminders';

async function executeHandler(
  statusSequence: (string | null)[]
): Promise<void> {
  let callIndex = 0;
  mockGetConsentStatus.mockImplementation(async () => {
    const status = statusSequence[callIndex] ?? null;
    callIndex++;
    return status;
  });

  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (consentReminder as any).fn;
  await handler({
    event: {
      name: 'app/consent.requested',
      data: {
        profileId: 'profile-1',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      },
    },
    step: mockStep,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('consentReminder', () => {
  it('should be defined as an Inngest function', () => {
    expect(consentReminder).toBeDefined();
  });

  it('should have the correct function id', () => {
    // The Inngest function object exposes its config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = (consentReminder as any).opts;
    expect(config.id).toBe('consent-reminder');
  });

  it('should trigger on app/consent.requested event', () => {
    // Inngest v3 stores triggers in the config array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const triggers = (consentReminder as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/consent.requested' }),
      ])
    );
  });

  it('does not send email or delete when status is null (profile already deleted)', async () => {
    // All four steps return null (profile deleted before any reminder)
    await executeHandler([null, null, null, null]);

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });

  it('sends reminders when status is PENDING', async () => {
    // All four steps return PENDING
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    // 3 reminder emails + 1 delete call
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfile).toHaveBeenCalledTimes(1);
  });

  it('stops sending when consent is granted mid-sequence', async () => {
    // Day 7: PENDING (sends email), Day 14: CONSENTED (stops)
    await executeHandler(['PENDING', 'CONSENTED', 'CONSENTED', 'CONSENTED']);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });

  it('does not delete when status becomes null at day 30', async () => {
    // Reminders sent (PENDING), but by day 30 profile is gone (null)
    await executeHandler(['PENDING', 'PENDING', 'PENDING', null]);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });

  it('does not delete when status is WITHDRAWN at day 30', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });
});
