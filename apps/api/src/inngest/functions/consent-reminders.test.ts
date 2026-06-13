const mockGetConsentStatus = jest.fn();
const mockGetProfileConsentState = jest.fn();
const mockRefreshConsentToken = jest
  .fn()
  .mockResolvedValue('refreshed-token-xyz');
const mockRefreshConsentTokenForRequest = jest.fn().mockResolvedValue({
  parentEmail: 'parent@example.com',
  freshToken: 'refreshed-token-xyz',
});
const mockDeleteProfileIfNoConsent = jest.fn().mockResolvedValue(true);
const mockSendEmail = jest.fn();
const mockConsentFindFirst = jest.fn().mockResolvedValue({
  parentEmail: 'parent@example.com',
  consentToken: 'test-token-abc123',
});
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
          findFirst: mockConsentFindFirst,
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
      refreshConsentToken: (...args: unknown[]) =>
        mockRefreshConsentToken(...args),
      refreshConsentTokenForRequest: (...args: unknown[]) =>
        mockRefreshConsentTokenForRequest(...args),
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
  requestedAt?: string | Date;
}

function extractSqlTextAndValues(
  node: unknown,
  visited = new WeakSet<object>(),
): string[] {
  if (node === null || node === undefined) return [];
  if (node instanceof Date) return [node.toISOString().toLowerCase()];
  if (typeof node !== 'object') return [String(node).toLowerCase()];
  if (visited.has(node as object)) return [];
  visited.add(node as object);

  const values: string[] = [];
  const obj = node as Record<string, unknown>;
  if (typeof obj['name'] === 'string') values.push(obj['name'].toLowerCase());
  if (
    'value' in obj &&
    (typeof obj['value'] === 'string' ||
      typeof obj['value'] === 'number' ||
      obj['value'] instanceof Date)
  ) {
    const value = obj['value'];
    values.push(
      value instanceof Date
        ? value.toISOString().toLowerCase()
        : String(value).toLowerCase(),
    );
  }
  for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...extractSqlTextAndValues(item, visited));
      }
    } else {
      values.push(...extractSqlTextAndValues(child, visited));
    }
  }
  return values;
}

async function executeHandler(
  statusSequence: (string | null)[],
  profileState: ProfileConsentState | null = {
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent@example.com',
    consentType: 'GDPR',
    requestedAt: '2026-05-01T00:00:00.000Z',
  },
  eventData: Record<string, unknown> = {
    profileId: 'profile-1',
    consentType: 'GDPR',
    requestedAt: '2026-05-01T00:00:00.000Z',
  },
  latestAnyConsentStatusSequence: (string | null)[] = statusSequence,
): Promise<void> {
  let latestStatusCallIndex = 0;
  mockGetConsentStatus.mockImplementation(async () => {
    const status =
      latestAnyConsentStatusSequence[latestStatusCallIndex] ?? null;
    latestStatusCallIndex++;
    return status;
  });

  // parentEmail is looked up from DB via getProfileConsentState
  mockGetProfileConsentState.mockResolvedValue(profileState);
  const eventRequestedAt =
    typeof eventData.requestedAt === 'string' ? eventData.requestedAt : null;
  const stateRequestedAt =
    profileState?.requestedAt instanceof Date
      ? profileState.requestedAt.toISOString()
      : (profileState?.requestedAt ?? null);
  let currentRequestStatusCallIndex = 0;
  mockConsentFindFirst.mockImplementation(async (query: unknown) => {
    const currentRequestMatches =
      eventRequestedAt && stateRequestedAt === eventRequestedAt;
    if (!currentRequestMatches) return null;

    const columns = (query as { columns?: Record<string, boolean> }).columns;
    if (columns?.status) {
      const status = statusSequence[currentRequestStatusCallIndex] ?? null;
      currentRequestStatusCallIndex++;
      if (!status) return null;
      return { status };
    }

    return {
      id: 'consent-state-1',
      parentEmail: profileState?.parentEmail ?? null,
      consentToken: 'test-token-abc123',
      consentType: profileState?.consentType ?? 'GDPR',
    };
  });
  mockRefreshConsentTokenForRequest.mockResolvedValue(
    eventRequestedAt && stateRequestedAt === eventRequestedAt
      ? profileState?.parentEmail
        ? {
            parentEmail: profileState.parentEmail,
            freshToken: 'refreshed-token-xyz',
          }
        : null
      : null,
  );

  const { step } = createInngestStepRunner();

  const handler = (consentReminder as any).fn;
  await handler({
    event: {
      id: 'evt-test-1',
      name: 'app/consent.requested',
      data: eventData,
    },
    step,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConsentFindFirst.mockResolvedValue({
    parentEmail: 'parent@example.com',
    consentToken: 'test-token-abc123',
  });
  mockRefreshConsentTokenForRequest.mockResolvedValue({
    parentEmail: 'parent@example.com',
    freshToken: 'refreshed-token-xyz',
  });
});

describe('consentReminder', () => {
  it('should be defined as an Inngest function with the expected id', () => {
    expect((consentReminder as { opts?: { id?: string } }).opts?.id).toBe(
      'consent-reminder',
    );
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
    expect(mockDeleteProfileIfNoConsent).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );
  });

  // [IMP-2] Token URL must reach the email body, not just the format call
  // — the original test only proved sendEmail was called, which would have
  // passed even if buildTokenUrl were silently broken.
  it('passes the built tokenUrl into both the formatter and the email body', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    // After DS-020 fix: refreshConsentToken returns 'refreshed-token-xyz'
    // so the URL is built from the refreshed token, not the DB-read stale token.
    const expectedTokenUrl =
      'https://api.mentomate.com/v1/consent-page?token=refreshed-token-xyz';

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

  // [DS-020] Regression: token embedded in day-7 and day-14 reminder links
  // must be refreshed before use so the link is valid when the parent clicks it.
  // Pre-fix: lookupConsentDetails() read the stale (possibly expired) DB token.
  // Post-fix: refreshConsentToken() is called before building each URL.
  it('[DS-020] refreshes the consent token before building day-7 and day-14 reminder URLs', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    // refreshConsentTokenForRequest must be called once per reminder that embeds a link
    // (day-7 and day-14) — NOT for day-25 (no link) and NOT for day-30 (delete).
    expect(mockRefreshConsentTokenForRequest).toHaveBeenCalledTimes(2);
  });

  it('[WI-84 review] binds fresh-token minting to the requestedAt generation', async () => {
    await executeHandler(['PENDING', 'CONSENTED', 'CONSENTED', 'CONSENTED']);

    expect(mockRefreshConsentTokenForRequest).toHaveBeenCalledWith(
      expect.anything(),
      {
        profileId: 'profile-1',
        requestedAt: new Date('2026-05-01T00:00:00.000Z'),
        requestedAtUpperBound: new Date('2026-05-01T00:00:00.001Z'),
      },
    );
  });

  it('[DS-020] day-14 reminder URL uses the refreshed token, not the stale DB token', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    const day14Email = mockSendEmail.mock.calls[1]?.[0] as
      | { body?: string }
      | undefined;

    // The refreshed token 'refreshed-token-xyz' must appear in the day-14 email body.
    expect(day14Email?.body).toContain('refreshed-token-xyz');
    // The stale DB token must NOT appear — proves we are not reading the old token.
    expect(day14Email?.body).not.toContain('test-token-abc123');
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

  it('[WI-84 review] ignores terminal COPPA status when the GDPR request is still pending', async () => {
    await executeHandler(
      ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
      undefined,
      undefined,
      ['CONSENTED', 'CONSENTED', 'CONSENTED', 'CONSENTED'],
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeleteProfileIfNoConsent).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );
  });

  it('does not send email when parentEmail is not found in DB', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING'], {
      status: 'PARENTAL_CONSENT_REQUESTED',
      parentEmail: null,
      consentType: 'GDPR',
      requestedAt: '2026-05-01T00:00:00.000Z',
    });

    // No emails sent because parentEmail lookup returns null
    expect(mockSendEmail).not.toHaveBeenCalled();
    // Atomic delete still happens because consent status is PENDING — and it
    // must target the correct profile + the request's requestedAt boundary, not
    // just "be called" (a wrong-profile scoping bug must fail this test).
    expect(mockDeleteProfileIfNoConsent).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );
  });

  it('[WI-84 DS-021] skips stale reminder runs when latest consent request has a newer requestedAt', async () => {
    await executeHandler(
      ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
      {
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
        requestedAt: '2026-05-20T00:00:00.000Z',
      },
      {
        profileId: 'profile-1',
        consentType: 'GDPR',
        requestedAt: '2026-05-01T00:00:00.000Z',
      },
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
  });

  it('[WI-84 DS-021] skips legacy reminder events without requestedAt because they cannot prove freshness', async () => {
    await executeHandler(
      ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
      {
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
        requestedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        profileId: 'profile-1',
        consentType: 'GDPR',
      },
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockDeleteProfileIfNoConsent).not.toHaveBeenCalled();
  });

  it('[WI-84 review] reads reminder contact details from the same requestedAt generation', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    const firstCall = mockConsentFindFirst.mock.calls[0]?.[0] as
      | { where?: unknown }
      | undefined;
    const whereText = extractSqlTextAndValues(firstCall?.where).join(' ');
    expect(whereText).toContain('profile-1');
    expect(whereText).toContain('2026-05-01t00:00:00.000z');
  });

  it('[WI-84 review] matches requestedAt with a half-open millisecond window', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    const firstCall = mockConsentFindFirst.mock.calls[0]?.[0] as
      | { where?: unknown }
      | undefined;
    const whereText = extractSqlTextAndValues(firstCall?.where).join(' ');
    expect(whereText).toContain('2026-05-01t00:00:00.000z');
    expect(whereText).toContain('2026-05-01t00:00:00.001z');
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
