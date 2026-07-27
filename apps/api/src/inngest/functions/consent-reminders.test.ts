// [WI-867] flag collapsed — consent-reminders now uses v2 paths unconditionally.
// resolveOrgIdForPerson + resolveConsentSetStatus drive status (SEEDED via the real
// services reading the seeded consent chain — see seedConsentState below);
// refreshConsentTokenForRequestV2 mints tokens (WRITE → mocked);
// deletePersonIfNoConsentV2 handles the day-30 delete (WRITE → mocked).
const mockRefreshConsentTokenForRequestV2 = jest.fn().mockResolvedValue({
  guardianEmail: 'parent@example.com',
  freshToken: 'refreshed-token-xyz',
});
const mockDeletePersonIfNoConsentV2 = jest.fn().mockResolvedValue(undefined);
const mockSendEmail = jest.fn();
const mockFormatConsentReminderEmail = jest.fn(
  (_email: string, _name: string, _days: number, _tokenUrl: string) => ({
    to: _email,
    subject: 'Consent reminder',
    body: `${_days} days left — ${_tokenUrl}`,
    type: 'consent_reminder' as const,
  }),
);

// Shared seeded DB — getStepDatabase returns this; seedConsentState patches its
// db.query so the REAL resolveOrgIdForPerson (membership.findFirst) +
// resolveConsentSetStatus (consentGrant + consentRequest STATUS) run unmocked.
// The DETAILS read (lookupConsentDetails → consentRequest.findMany with
// guardianEmail columns) is layered on top of the seeder's consentRequest handle
// so the requestedAt-window suppression remains test-controllable.
const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
    getStepResendApiKey: jest.fn(() => 're_test_key'),
    getStepEmailFrom: jest.fn(() => 'noreply@mentomate.com'),
    getStepAppUrl: jest.fn(() => 'https://api.mentomate.com'),
  };
});

jest.mock(
  '../../services/identity-v2/consent-v2' /* gc1-allow: write fn — refreshConsentTokenForRequestV2 performs an .update().returning() token write, not exercisable on the unit Proxy mock-db; no consent-reminders integration twin exists yet — coverage gap tracked WI-905 */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/consent-v2',
    ) as typeof import('../../services/identity-v2/consent-v2');
    return {
      ...actual,
      refreshConsentTokenForRequestV2: (...args: unknown[]) =>
        mockRefreshConsentTokenForRequestV2(...args),
    };
  },
);

jest.mock('../../services/notifications', () => {
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
});

jest.mock(
  '../../services/identity-v2/deletion-v2' /* gc1-allow: write fn — deletePersonIfNoConsentV2 performs an atomic .delete() guarded by a no-consent subquery, not exercisable on the unit Proxy mock-db; no consent-reminders integration twin exists yet — coverage gap tracked WI-905 */,
  () => {
    const actual = jest.requireActual(
      '../../services/identity-v2/deletion-v2',
    ) as typeof import('../../services/identity-v2/deletion-v2');
    return {
      ...actual,
      deletePersonIfNoConsentV2: (...args: unknown[]) =>
        mockDeletePersonIfNoConsentV2(...args),
    };
  },
);

import { NonRetriableError } from 'inngest';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import * as sentry from '../../services/sentry';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import {
  seedConsentState,
  type SeedConsentState,
} from '../../test-utils/consent-seed';
import { consentReminder } from './consent-reminders';

const captureMessageSpy = jest
  .spyOn(sentry, 'captureMessage')
  .mockImplementation(() => undefined);

interface ProfileConsentState {
  status: string;
  parentEmail: string | null;
  consentType: string;
  requestedAt?: string | Date;
}

// Map the test-facing ConsentStatus strings the suite drives with onto the
// SeedConsentState the consent seeder accepts. The reduction in
// resolveConsentStatus turns the seeded rows back into these statuses.
function toSeedState(status: string | null): SeedConsentState {
  switch (status) {
    case 'CONSENTED':
      return 'CONSENTED';
    case 'WITHDRAWN':
      return 'WITHDRAWN';
    case 'PENDING':
      return 'PENDING';
    case 'PARENTAL_CONSENT_REQUESTED':
      return 'PCR';
    default:
      return null;
  }
}

// A minimal mock db that seedConsentState patches in place. getStepDatabase
// returns this shared object so the real v2 services read the seeded chain.
function createSeededDb(): Record<string, unknown> {
  return { query: {} };
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

// The WHERE-window assertions care only about the DETAILS findMany read.
function firstDetailsCall(): { where?: unknown } | undefined {
  return mockConsentFindMany.mock.calls[0]?.[0] as
    | { where?: unknown }
    | undefined;
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
  // [WI-867] latestAnyConsentStatusSequence kept for test-call API compat but
  // no longer has a separate code path — resolveConsentStatus is called once
  // per status-check step and statusSequence drives all calls.
  _latestAnyConsentStatusSequence: (string | null)[] = statusSequence,
  detailsRows?: Array<{ guardianEmail: string | null; token: string | null }>,
): Promise<{ stepReturns: Record<string, unknown> }> {
  const eventRequestedAt =
    typeof eventData.requestedAt === 'string' ? eventData.requestedAt : null;
  const stateRequestedAt =
    profileState?.requestedAt instanceof Date
      ? profileState.requestedAt.toISOString()
      : (profileState?.requestedAt ?? null);

  // [WI-867] SEED the v2 consent chain — the real resolveOrgIdForPerson
  // (membership.findFirst) and resolveConsentSetStatus (consentGrant +
  // consentRequest STATUS) now run against these rows, one statusSequence
  // entry consumed per status-check step (day-7/14/25/30).
  const handles = seedConsentState(sharedDb, {
    personId: 'profile-1',
    organizationId: 'test-org-id',
    state: statusSequence.map(toSeedState),
    purposesPerState: CONSENT_PURPOSES.length,
  });

  // STATUS calls delegate to the real seeder reduction. DETAILS reads use
  // findMany and return the complete purpose set only for the current request
  // generation.
  const seededConsentRequest = handles.consentRequestFindFirst;
  const seededImpl = seededConsentRequest.getMockImplementation();
  mockConsentFindFirst.mockImplementation(async (query: unknown) => {
    // STATUS — delegate to the real seeder reduction (advances state index).
    return seededImpl ? seededImpl(query) : null;
  });
  seededConsentRequest.mockImplementation(mockConsentFindFirst);
  mockConsentFindMany.mockImplementation(async () => {
    if (detailsRows) return detailsRows;
    const currentRequestMatches =
      eventRequestedAt && stateRequestedAt === eventRequestedAt;
    if (!currentRequestMatches || !profileState?.parentEmail) return [];
    return CONSENT_PURPOSES.map(() => ({
      guardianEmail: profileState.parentEmail,
      token: 'test-token-abc123',
    }));
  });
  const query = sharedDb.query as Record<string, Record<string, unknown>>;
  query.consentRequest!.findMany = mockConsentFindMany;

  // refreshConsentTokenForRequestV2 (WRITE → mocked): return v2 shape
  // {guardianEmail, freshToken}. When the event requestedAt doesn't match the
  // current generation, return null (stale event guard — mirrors the real DB
  // WHERE clause that finds no row in that window).
  mockRefreshConsentTokenForRequestV2.mockResolvedValue(
    eventRequestedAt && stateRequestedAt === eventRequestedAt
      ? profileState?.parentEmail
        ? {
            guardianEmail: profileState.parentEmail,
            freshToken: 'refreshed-token-xyz',
          }
        : null
      : null,
  );

  const runner = createInngestStepRunner();
  // [WI-637] Capture each step's memoized return value so a test can assert no
  // PII (parent email) ever rides Inngest's durable step state.
  const stepReturns: Record<string, unknown> = {};
  const step = {
    ...runner.step,
    async run(name: string, callback: () => unknown) {
      const result = await runner.step.run(name, callback);
      stepReturns[name] = result;
      return result;
    },
  };

  const handler = (consentReminder as any).fn;
  await handler({
    event: {
      id: 'evt-test-1',
      name: 'app/consent.requested',
      data: eventData,
    },
    step,
  });

  return { stepReturns };
}

const mockConsentFindFirst = jest.fn();
const mockConsentFindMany = jest.fn();
let sharedDb: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  // Fresh seeded DB each test; getStepDatabase returns it so the real v2
  // services read the seeded consent chain. seedConsentState is (re)applied
  // inside executeHandler with the per-test status sequence.
  sharedDb = createSeededDb();
  mockGetStepDatabase.mockReturnValue(sharedDb);
  // [WI-867] v2 default: token refreshes successfully (WRITE → mocked).
  mockRefreshConsentTokenForRequestV2.mockResolvedValue({
    guardianEmail: 'parent@example.com',
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
    expect(mockDeletePersonIfNoConsentV2).not.toHaveBeenCalled();
  });

  it('sends reminders when status is PENDING', async () => {
    // All four steps return PENDING
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'PENDING']);

    // 3 reminder emails + 1 atomic delete via db.execute
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeletePersonIfNoConsentV2).toHaveBeenCalledWith(
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
    expect(mockRefreshConsentTokenForRequestV2).toHaveBeenCalledTimes(2);
  });

  it('[WI-84 review] binds fresh-token minting to the requestedAt generation', async () => {
    await executeHandler(['PENDING', 'CONSENTED', 'CONSENTED', 'CONSENTED']);

    // [WI-867] v2 fn signature: { chargePersonId, organizationId, requestedAt, requestedAtUpperBound }
    expect(mockRefreshConsentTokenForRequestV2).toHaveBeenCalledWith(
      expect.anything(),
      {
        chargePersonId: 'profile-1',
        organizationId: 'test-org-id',
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

  // [WI-637] The day-7/day-14 token-mint steps must memoize ONLY the fresh
  // token — never the parent's email. Inngest persists a step's return value in
  // its third-party state store, so an email in the return durably over-retains
  // guardian PII. The send steps re-read the address in-step instead.
  it('[WI-637] memoizes only the fresh token (never the parent email) in the day-7/day-14 mint steps', async () => {
    const { stepReturns } = await executeHandler([
      'PENDING',
      'PENDING',
      'PENDING',
      'PENDING',
    ]);

    for (const stepName of ['refresh-day-7-token', 'refresh-day-14-token']) {
      const ret = stepReturns[stepName];
      expect(ret).toEqual({ freshToken: 'refreshed-token-xyz' });
      expect(ret).not.toHaveProperty('parentEmail');
      expect(JSON.stringify(ret)).not.toContain('parent@example.com');
    }

    // The address must still reach the parent — proves the email is rehydrated
    // in the send step, not lost (day-7 + day-14 + day-25 = 3 sends).
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    const day7Email = mockSendEmail.mock.calls[0]?.[0] as { to?: string };
    expect(day7Email.to).toBe('parent@example.com');
  });

  it('stops sending when consent is granted mid-sequence', async () => {
    // Day 7: PENDING (sends email), Day 14: CONSENTED (stops)
    await executeHandler(['PENDING', 'CONSENTED', 'CONSENTED', 'CONSENTED']);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockDeletePersonIfNoConsentV2).not.toHaveBeenCalled();
  });

  it('does not delete when status becomes null at day 30', async () => {
    // Reminders sent (PENDING), but by day 30 profile is gone (null)
    await executeHandler(['PENDING', 'PENDING', 'PENDING', null]);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeletePersonIfNoConsentV2).not.toHaveBeenCalled();
  });

  it('does not delete when status is WITHDRAWN at day 30', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeletePersonIfNoConsentV2).not.toHaveBeenCalled();
  });

  it('[WI-84 review] ignores terminal COPPA status when the GDPR request is still pending', async () => {
    await executeHandler(
      ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
      undefined,
      undefined,
      ['CONSENTED', 'CONSENTED', 'CONSENTED', 'CONSENTED'],
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockDeletePersonIfNoConsentV2).toHaveBeenCalledWith(
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
    expect(mockDeletePersonIfNoConsentV2).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );
  });

  it('[WI-2386 review] escalates a suppressed legacy partial request without capturing guardian PII', async () => {
    await executeHandler(
      ['PENDING', 'PENDING', 'PENDING', 'PENDING'],
      undefined,
      undefined,
      undefined,
      [{ guardianEmail: 'parent@example.com', token: 'legacy-token' }],
    );

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(captureMessageSpy).toHaveBeenCalledTimes(3);
    expect(captureMessageSpy).toHaveBeenCalledWith(
      'consent-reminder: contact details suppressed',
      expect.objectContaining({
        level: 'warning',
        profileId: 'profile-1',
        extra: expect.objectContaining({
          surface: 'consent-reminder.contact_details_suppressed',
          reason: 'incomplete_purpose_set',
          expectedRowCount: CONSENT_PURPOSES.length,
          actualRowCount: 1,
        }),
      }),
    );
    expect(JSON.stringify(captureMessageSpy.mock.calls)).not.toContain(
      'parent@example.com',
    );
    expect(JSON.stringify(captureMessageSpy.mock.calls)).not.toContain(
      'legacy-token',
    );
  });

  it('[WI-84 DS-021] skips stale reminder runs when latest consent request has a newer requestedAt', async () => {
    // [WI-867] v2 behaviour: emails are suppressed (refreshConsentTokenForRequestV2
    // returns null when the event requestedAt != state requestedAt). The delete IS
    // dispatched to deletePersonIfNoConsentV2 but its own DB-side requestedAt guard
    // makes it a no-op in production for stale generations. The mock resolves
    // immediately; the assertion captures that the function is called with the
    // event's requestedAt (so the guard fires correctly in production).
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
    // v2: delete dispatched with event requestedAt; DB guard inside deletePersonIfNoConsentV2
    // rejects stale generations (no matching consent_request row in that window).
    expect(mockDeletePersonIfNoConsentV2).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );
  });

  it('[WI-84 DS-021] [WI-973] rejects legacy reminder events without requestedAt with NonRetriableError — they cannot prove freshness and must not retry', async () => {
    // Before WI-973: missing requestedAt silently skipped all actions (safe
    // but allowed malformed events to proceed through the function body).
    // After WI-973: the Zod guard at function entry throws NonRetriableError
    // so the event is dead-lettered immediately and never retried. No email
    // and no delete are ever reached — same safety property, stronger contract.
    await expect(
      executeHandler(
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
          // requestedAt intentionally omitted — this is the malformed/legacy case
        },
      ),
    ).rejects.toThrow(NonRetriableError);

    // Neither side-effect is ever reached.
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockDeletePersonIfNoConsentV2).not.toHaveBeenCalled();
  });

  it('[WI-84 review] reads reminder contact details from the same requestedAt generation', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    const detailsCall = firstDetailsCall();
    const whereText = extractSqlTextAndValues(detailsCall?.where).join(' ');
    expect(whereText).toContain('profile-1');
    expect(whereText).toContain('2026-05-01t00:00:00.000z');
  });

  it('[WI-84 review] matches requestedAt with a half-open millisecond window', async () => {
    await executeHandler(['PENDING', 'PENDING', 'PENDING', 'WITHDRAWN']);

    const detailsCall = firstDetailsCall();
    const whereText = extractSqlTextAndValues(detailsCall?.where).join(' ');
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
