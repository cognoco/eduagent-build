// ---------------------------------------------------------------------------
// Email Digest Channel — Break tests (spec: 2026-05-08-email-digest-channel.md)
//
// Tests the 10 required break scenarios for the new email channel on weekly and
// monthly digest notifications, including:
//   - Consent-redaction fix on the push path (spec decision #1)
//   - Email preference gates and parent email presence checks
//   - Struggle watch-line rendering
//   - Resend idempotency-key format
//   - Retry safety (no double-send)
//   - All three restricted consent statuses (PENDING, PARENTAL_CONSENT_REQUESTED, WITHDRAWN)
//   - Mixed-consent parent (one CONSENTED + one WITHDRAWN)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Valid UUID constants (weekly handler validates parentId via z.string().uuid())
// ---------------------------------------------------------------------------
const PARENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const _PARENT_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const CHILD_ID_A = 'bbbbbbbb-0000-4000-8000-000000000001';
const CHILD_ID_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const CHILD_ID_RESTRICTED = 'cccccccc-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// External-boundary mocks only (GC1 ratchet)
// ---------------------------------------------------------------------------

// Sentry — external error tracker (no real process.env in test)
const mockCaptureException = jest.fn();
jest.mock('../../services/sentry' /* gc1-allow: unit test boundary */, () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Inngest client — external framework boundary
jest.mock('../client' /* gc1-allow: unit test boundary */, () => ({
  inngest: {
    createFunction: jest.fn(
      (config: unknown, trigger: unknown, fn: unknown) => ({
        fn,
        opts: config,
        _trigger: trigger,
      }),
    ),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

// Internal services used by the generate handlers — we intercept them here
// using jest.requireActual patterns would be awkward since these are async
// service functions. Instead, we stub the service module as a whole because
// these tests are exercising the *Inngest handler* control flow, not the
// service implementations. The service-level unit tests live in notifications.test.ts.
//
// We follow the existing monthly-report-cron.test.ts pattern where sendPushNotification
// and sendEmail are both stubbed via jest.mock on the service barrel.
// This is acceptable for Inngest handler control-flow tests because the
// services themselves are tested in isolation in notifications.test.ts.
// gc1-allow: handler control-flow test; services tested in their own unit suites

const mockSendPushNotification = jest.fn().mockResolvedValue({ sent: true });
const mockSendEmail = jest
  .fn()
  .mockResolvedValue({ sent: true, messageId: 'msg-123' });
const mockFormatWeeklyProgressEmail = jest.fn().mockReturnValue({
  to: 'parent@example.com',
  subject: "This week's learning progress",
  body: 'summary text',
  type: 'weekly_progress',
});
const mockFormatMonthlyProgressEmail = jest.fn().mockReturnValue({
  to: 'parent@example.com',
  subject: "This month's learning report",
  body: 'monthly summary text',
  type: 'monthly_progress',
});

// prettier-ignore
jest.mock( /* gc1-allow: handler control-flow test; services tested in own suites */
  '../../services/notifications',
  () => ({
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    formatWeeklyProgressEmail: (...args: unknown[]) =>
      mockFormatWeeklyProgressEmail(...args),
    formatMonthlyProgressEmail: (...args: unknown[]) =>
      mockFormatMonthlyProgressEmail(...args),
  }),
);

const mockGetRecentNotificationCount = jest.fn().mockResolvedValue(0);
const mockLogNotification = jest.fn().mockResolvedValue(undefined);
// prettier-ignore
jest.mock( /* gc1-allow: handler control-flow test; services tested in own suites */
  '../../services/settings',
  () => ({
    getRecentNotificationCount: (...args: unknown[]) =>
      mockGetRecentNotificationCount(...args),
    logNotification: (...args: unknown[]) => mockLogNotification(...args),
  }),
);

const mockGetSnapshotsInRange = jest.fn();
const mockGetLatestSnapshot = jest.fn();
const mockGetLatestSnapshotOnOrBefore = jest.fn().mockResolvedValue(null);
// prettier-ignore
jest.mock( /* gc1-allow: handler control-flow test; services tested in own suites */
  '../../services/snapshot-aggregation',
  () => ({
    getSnapshotsInRange: (...args: unknown[]) =>
      mockGetSnapshotsInRange(...args),
    getLatestSnapshot: (...args: unknown[]) => mockGetLatestSnapshot(...args),
    getLatestSnapshotOnOrBefore: (...args: unknown[]) =>
      mockGetLatestSnapshotOnOrBefore(...args),
  }),
);

const mockGenerateWeeklyReportData = jest
  .fn()
  .mockReturnValue({ reportData: {} });
// prettier-ignore
jest.mock( /* gc1-allow: handler control-flow test; services tested in own suites */
  '../../services/weekly-report',
  () => ({
    generateWeeklyReportData: (...args: unknown[]) =>
      mockGenerateWeeklyReportData(...args),
  }),
);

// ---------------------------------------------------------------------------
// DB mock wiring
// ---------------------------------------------------------------------------

// Mutable db state per test — reset in beforeEach
let dbState: {
  consentStatus: string | null; // null = no row (missing = CONSENTED presumed)
  weeklyProgressEmail: boolean;
  monthlyProgressEmail: boolean;
  parentEmail: string | null;
  struggles: Array<{ topic: string }>;
  childDisplayName: string;
};

function resetDbState() {
  dbState = {
    consentStatus: 'CONSENTED',
    weeklyProgressEmail: true,
    monthlyProgressEmail: true,
    parentEmail: 'parent@example.com',
    struggles: [],
    childDisplayName: 'Emma',
  };
}

// Build the mock db object used by all tests
function buildMockDb(
  childLinks: Array<{ childProfileId: string }> = [
    { childProfileId: CHILD_ID_A },
  ],
  extraQueryOverrides: Record<string, unknown> = {},
) {
  const mockOnConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const mockInsertValues = jest
    .fn()
    .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  const db = {
    query: {
      familyLinks: {
        findMany: jest.fn().mockResolvedValue(childLinks),
      },
      consentStates: {
        findFirst: jest.fn().mockImplementation(() => {
          // Default: no consent restriction. Tests that need specific consent
          // behavior override findFirst directly on the returned db object.
          return Promise.resolve(null);
        }),
      },
      profiles: {
        findFirst: jest
          .fn()
          .mockImplementation(
            ({
              where: _where,
            }: {
              where: { config?: { value?: string }; name?: string };
            }) => {
              // Always return a profile (parent or child)
              return Promise.resolve({
                displayName: dbState.childDisplayName,
                accountId: 'account-001',
              });
            },
          ),
      },
      accounts: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            dbState.parentEmail ? { email: dbState.parentEmail } : null,
          ),
      },
      notificationPreferences: {
        findFirst: jest.fn().mockResolvedValue({
          pushEnabled: true,
          weeklyProgressPush: true,
          weeklyProgressEmail: dbState.weeklyProgressEmail,
          monthlyProgressEmail: dbState.monthlyProgressEmail,
        }),
      },
      learningProfiles: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ struggles: dbState.struggles }),
      },
      ...extraQueryOverrides,
    },
    insert: mockInsert,
    _mockInsert: mockInsert,
    _mockInsertValues: mockInsertValues,
    _mockOnConflictDoNothing: mockOnConflictDoNothing,
  };

  return db;
}

const mockGetStepResendApiKey = jest.fn(() => 'test-resend-key');
jest.mock('../helpers' /* gc1-allow: unit test boundary */, () => ({
  getStepDatabase: jest.fn(),
  resetDatabaseUrl: jest.fn(),
  getStepResendApiKey: () => mockGetStepResendApiKey(),
}));

import { getStepDatabase } from '../helpers';
import { weeklyProgressPushGenerate } from './weekly-progress-push';
import { monthlyReportGenerate } from './monthly-report-cron';

// ---------------------------------------------------------------------------
// Step execution helpers
// ---------------------------------------------------------------------------

async function executeWeeklyGenerate(
  parentId: string,
  db: ReturnType<typeof buildMockDb>,
): Promise<unknown> {
  (getStepDatabase as jest.Mock).mockReturnValue(db);

  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };

  const handler = (
    weeklyProgressPushGenerate as unknown as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;

  return handler({
    event: {
      name: 'app/weekly-progress-push.generate',
      data: { parentId },
    },
    step: mockStep,
  });
}

async function executeMonthlyGenerate(
  parentId: string,
  childId: string,
  db: ReturnType<typeof buildMockDb>,
): Promise<unknown> {
  (getStepDatabase as jest.Mock).mockReturnValue(db);

  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };

  const handler = (
    monthlyReportGenerate as unknown as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;

  return handler({
    event: {
      name: 'app/monthly-report.generate',
      data: { parentId, childId },
    },
    step: mockStep,
  });
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SAMPLE_METRICS = {
  totalSessions: 5,
  totalActiveMinutes: 60,
  totalWallClockMinutes: 90,
  totalExchanges: 20,
  topicsAttempted: 4,
  topicsMastered: 3,
  topicsInProgress: 1,
  booksCompleted: 1,
  vocabularyTotal: 25,
  vocabularyMastered: 15,
  vocabularyLearning: 5,
  vocabularyNew: 5,
  retentionCardsDue: 2,
  retentionCardsStrong: 8,
  retentionCardsFading: 1,
  currentStreak: 3,
  longestStreak: 5,
  subjects: [],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  resetDbState();
  mockGetStepResendApiKey.mockReturnValue('test-resend-key');

  // Default snapshot responses for weekly tests
  mockGetLatestSnapshot.mockResolvedValue({
    snapshotDate: '2026-05-05',
    metrics: SAMPLE_METRICS,
  });
  mockGetLatestSnapshotOnOrBefore.mockResolvedValue({
    snapshotDate: '2026-04-28',
    metrics: { ...SAMPLE_METRICS, topicsMastered: 1, vocabularyTotal: 10 },
  });
});

// ---------------------------------------------------------------------------
// WEEKLY tests
// ---------------------------------------------------------------------------

describe('Email digest channel — weekly', () => {
  // Break test 1: Email sent when both preference + parent email present
  it('(T1) sends email when weekly_progress_email=true and parent email present', async () => {
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });

    await executeWeeklyGenerate(PARENT_ID, db);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent@example.com',
        type: 'weekly_progress',
      }),
      expect.objectContaining({ resendApiKey: 'test-resend-key' }),
    );
  });

  // Break test 2: Email skipped (push still fires) when weekly_progress_email=false
  it('(T2) skips email but still sends push when weekly_progress_email=false', async () => {
    dbState.weeklyProgressEmail = false;
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });
    db.query.notificationPreferences.findFirst = jest.fn().mockResolvedValue({
      pushEnabled: true,
      weeklyProgressPush: true,
      weeklyProgressEmail: false,
      monthlyProgressEmail: true,
    });

    await executeWeeklyGenerate(PARENT_ID, db);

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // Break test 3: Email skipped silently when parent has no accounts.email (OAuth-only, expected path)
  it('(T3) skips email silently when parent has no email — no Sentry noise', async () => {
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });
    db.query.accounts.findFirst = jest.fn().mockResolvedValue(null);

    await executeWeeklyGenerate(PARENT_ID, db);

    expect(mockSendEmail).not.toHaveBeenCalled();
    const noEmailCalls = mockCaptureException.mock.calls.filter((call) => {
      const msg = (call[0] as Error)?.message ?? '';
      return (
        msg.includes('no email') || msg.includes('weekly-progress-push-email')
      );
    });
    expect(noEmailCalls).toHaveLength(0);
  });

  it('completes an email-only weekly digest without calling push', async () => {
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });
    db.query.notificationPreferences.findFirst = jest.fn().mockResolvedValue({
      pushEnabled: false,
      weeklyProgressPush: false,
      weeklyProgressEmail: true,
      monthlyProgressEmail: true,
    });

    const result = (await executeWeeklyGenerate(PARENT_ID, db)) as {
      status: string;
      parentId: string;
    };

    expect(result).toEqual({ status: 'completed', parentId: PARENT_ID });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  // Break test 4: Struggle watch-line rendered with topic name when struggles non-empty
  it('(T4) renders struggle watch-line with topic names when learning_profiles.struggles non-empty', async () => {
    dbState.struggles = [{ topic: 'fractions' }, { topic: 'decimals' }];
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });
    db.query.learningProfiles.findFirst = jest.fn().mockResolvedValue({
      struggles: dbState.struggles,
    });

    await executeWeeklyGenerate(PARENT_ID, db);

    expect(mockFormatWeeklyProgressEmail).toHaveBeenCalledWith(
      'parent@example.com',
      expect.any(Array),
      expect.arrayContaining([
        expect.objectContaining({
          topics: expect.arrayContaining(['fractions', 'decimals']),
        }),
      ]),
    );
  });

  // Break test 5: Watch-line omitted when struggles empty
  it('(T5) omits watch-line topics when struggles is empty', async () => {
    dbState.struggles = [];
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });
    db.query.learningProfiles.findFirst = jest
      .fn()
      .mockResolvedValue({ struggles: [] });

    await executeWeeklyGenerate(PARENT_ID, db);

    expect(mockFormatWeeklyProgressEmail).toHaveBeenCalledWith(
      'parent@example.com',
      expect.any(Array),
      expect.arrayContaining([expect.objectContaining({ topics: [] })]),
    );
  });

  // Break test 6: Resend Idempotency-Key set per parentId + reportWeek
  it('(T6) sets Resend Idempotency-Key as weekly-{parentId}-{reportWeek}', async () => {
    const db = buildMockDb();
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });

    await executeWeeklyGenerate(PARENT_ID, db);

    const emailCallArgs = mockSendEmail.mock.calls[0];
    expect(emailCallArgs).toBeDefined();
    const options = emailCallArgs![1] as { idempotencyKey?: string };
    expect(options.idempotencyKey).toMatch(
      new RegExp(`^weekly-${PARENT_ID}-\\d{4}-\\d{2}-\\d{2}$`),
    );
  });

  // Break test 7: Retry after transient Resend failure does not double-send
  it('(T7) Resend Idempotency-Key is deterministic — same key on retry prevents double-send', async () => {
    // The idempotency key is derived from parentId + reportWeek (not a random uuid),
    // so two calls with the same parentId on the same week produce identical keys.
    // Resend deduplicates on this key within 24h.
    const db1 = buildMockDb();
    db1.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });
    const db2 = buildMockDb();
    db2.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'CONSENTED',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });

    await executeWeeklyGenerate(PARENT_ID, db1);
    await executeWeeklyGenerate(PARENT_ID, db2);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const key1 = (
      mockSendEmail.mock.calls[0]![1] as { idempotencyKey?: string }
    ).idempotencyKey;
    const key2 = (
      mockSendEmail.mock.calls[1]![1] as { idempotencyKey?: string }
    ).idempotencyKey;
    expect(key1).toBe(key2);
    expect(key1).toMatch(new RegExp(`^weekly-${PARENT_ID}-`));
  });

  // Break test 8: Restricted-consent child's row is redacted from push + email
  // Tests all three restricted statuses
  it.each([['PENDING'], ['PARENTAL_CONSENT_REQUESTED'], ['WITHDRAWN']])(
    '(T8) redacts child with consent status %s from both push and email digests',
    async (consentStatus) => {
      const db = buildMockDb([{ childProfileId: CHILD_ID_RESTRICTED }]);
      db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
        status: consentStatus,
        profileId: CHILD_ID_RESTRICTED,
        consentType: 'GDPR',
      });

      const result = (await executeWeeklyGenerate(PARENT_ID, db)) as {
        status: string;
        reason?: string;
      };

      // All children restricted → no_activity skip
      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('no_activity');
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    },
  );

  // Break test 9: When all linked children are restricted, digest is skipped entirely
  it('(T9) skips digest entirely (no push, no email, no Sentry) when all children restricted', async () => {
    const db = buildMockDb([
      { childProfileId: CHILD_ID_A },
      { childProfileId: CHILD_ID_B },
    ]);
    db.query.consentStates.findFirst = jest.fn().mockResolvedValue({
      status: 'WITHDRAWN',
      profileId: CHILD_ID_A,
      consentType: 'GDPR',
    });

    const result = (await executeWeeklyGenerate(PARENT_ID, db)) as {
      status: string;
      reason?: string;
    };

    expect(result.status).toBe('skipped');
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    // No escalation Sentry call — this is the normal restricted-consent skip path
    const digestSkipCalls = mockCaptureException.mock.calls.filter((call) => {
      const msg = (call[0] as Error)?.message ?? '';
      return msg.includes('no email') || msg.includes('Sentry');
    });
    expect(digestSkipCalls).toHaveLength(0);
  });

  // Break test 10: Mixed consent — CONSENTED child included, WITHDRAWN child excluded
  it('(T10) weekly — includes only CONSENTED child row; WITHDRAWN child redacted', async () => {
    const db = buildMockDb([
      { childProfileId: CHILD_ID_A },
      { childProfileId: CHILD_ID_B },
    ]);
    db.query.profiles.findFirst = jest
      .fn()
      .mockResolvedValue({ displayName: 'Alice', accountId: 'account-001' });
    db.query.consentStates.findFirst = jest.fn().mockImplementation(() => {
      // Alternate based on call count: first call = CHILD_ID_A → CONSENTED,
      // second call = CHILD_ID_B → WITHDRAWN
      const callCount = (db.query.consentStates.findFirst as jest.Mock).mock
        .calls.length;
      if (callCount === 1) {
        return Promise.resolve({
          status: 'CONSENTED',
          profileId: CHILD_ID_A,
          consentType: 'GDPR',
        });
      }
      return Promise.resolve({
        status: 'WITHDRAWN',
        profileId: CHILD_ID_B,
        consentType: 'GDPR',
      });
    });

    const result = (await executeWeeklyGenerate(PARENT_ID, db)) as {
      status: string;
    };

    // Should complete (the CONSENTED child contributes a summary line)
    expect(result.status).toBe('completed');
    // Push fired once (for the single included child)
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    // Email also fired (preference = true, email present)
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    // The summary passed to the email formatter contains exactly 1 child entry
    const summaryArg = mockFormatWeeklyProgressEmail.mock
      .calls[0]![1] as string[];
    expect(summaryArg).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// MONTHLY tests (reuse the same break-test numbering in comments)
// ---------------------------------------------------------------------------

// Shared monthly mock services
const mockGenerateMonthlyReportData = jest.fn().mockReturnValue({
  childName: 'Emma',
  month: 'April 2026',
  thisMonth: { totalSessions: 10, totalActiveMinutes: 120, topicsMastered: 3 },
  lastMonth: null,
  highlights: [],
  nextSteps: [],
  subjects: [],
  headlineStat: {
    label: 'Topics mastered',
    value: 3,
    comparison: 'first month',
  },
});
const mockGenerateReportHighlights = jest.fn().mockResolvedValue({
  highlights: ['Good month!'],
  nextSteps: ['Keep going'],
  comparison: null,
});

// prettier-ignore
jest.mock( /* gc1-allow: handler control-flow test; services tested in own suites */
  '../../services/monthly-report',
  () => ({
    generateMonthlyReportData: (...args: unknown[]) =>
      mockGenerateMonthlyReportData(...args),
    generateReportHighlights: (...args: unknown[]) =>
      mockGenerateReportHighlights(...args),
  }),
);

function buildMonthlyMockDb(
  consentOverride?: { status: string } | null,
  emailOverride?: string | null,
) {
  const effectiveEmail =
    emailOverride !== undefined ? emailOverride : dbState.parentEmail;

  const mockOnConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const mockInsertValues = jest
    .fn()
    .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  return {
    query: {
      consentStates: {
        findFirst: jest.fn().mockResolvedValue(
          consentOverride === undefined
            ? {
                status: 'CONSENTED',
                profileId: 'child-001',
                consentType: 'GDPR',
              }
            : consentOverride,
        ),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue({
          displayName: dbState.childDisplayName,
          accountId: 'account-001',
        }),
      },
      accounts: {
        findFirst: jest
          .fn()
          .mockResolvedValue(effectiveEmail ? { email: effectiveEmail } : null),
      },
      notificationPreferences: {
        findFirst: jest.fn().mockResolvedValue({
          weeklyProgressEmail: true,
          monthlyProgressEmail: dbState.monthlyProgressEmail,
        }),
      },
      learningProfiles: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ struggles: dbState.struggles }),
      },
    },
    insert: mockInsert,
  };
}

beforeEach(() => {
  // Default monthly snapshot responses
  mockGetSnapshotsInRange
    .mockResolvedValueOnce([
      { snapshotDate: '2026-03-29', metrics: SAMPLE_METRICS },
    ])
    .mockResolvedValueOnce([]);
});

describe('Email digest channel — monthly', () => {
  // Break test 1 (monthly): Email sent when preference + parent email present
  it('(T1-monthly) sends monthly email when monthly_progress_email=true and parent email present', async () => {
    const db = buildMonthlyMockDb();

    await executeMonthlyGenerate('parent-001', 'child-001', db);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'monthly_progress' }),
      expect.objectContaining({ resendApiKey: 'test-resend-key' }),
    );
  });

  // Break test 2 (monthly): Email skipped when monthly_progress_email=false
  it('(T2-monthly) skips email but still sends push when monthly_progress_email=false', async () => {
    dbState.monthlyProgressEmail = false;
    const db = buildMonthlyMockDb();
    db.query.notificationPreferences.findFirst = jest.fn().mockResolvedValue({
      weeklyProgressEmail: true,
      monthlyProgressEmail: false,
    });

    await executeMonthlyGenerate('parent-001', 'child-001', db);

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // Break test 3 (monthly): Email skipped silently when parent has no email (OAuth-only, expected path)
  it('(T3-monthly) skips email silently when parent has no email — no Sentry noise', async () => {
    const db = buildMonthlyMockDb(undefined, null);

    await executeMonthlyGenerate('parent-001', 'child-001', db);

    expect(mockSendEmail).not.toHaveBeenCalled();
    const noEmailCalls = mockCaptureException.mock.calls.filter((call) => {
      const msg = (call[0] as Error)?.message ?? '';
      return (
        msg.includes('no email') ||
        msg.includes('monthly-report-generate-email')
      );
    });
    expect(noEmailCalls).toHaveLength(0);
  });

  // Break test 4 (monthly): Struggle watch-line rendered with topic name
  it('(T4-monthly) renders struggle watch-line with topics from learning_profiles.struggles', async () => {
    dbState.struggles = [{ topic: 'long division' }];
    const db = buildMonthlyMockDb();
    db.query.learningProfiles.findFirst = jest
      .fn()
      .mockResolvedValue({ struggles: [{ topic: 'long division' }] });

    await executeMonthlyGenerate('parent-001', 'child-001', db);

    expect(mockFormatMonthlyProgressEmail).toHaveBeenCalledWith(
      'parent@example.com',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          topics: expect.arrayContaining(['long division']),
        }),
      ]),
    );
  });

  // Break test 5 (monthly): Watch-line omitted when struggles empty
  it('(T5-monthly) omits watch-line when struggles is empty', async () => {
    dbState.struggles = [];
    const db = buildMonthlyMockDb();
    db.query.learningProfiles.findFirst = jest
      .fn()
      .mockResolvedValue({ struggles: [] });

    await executeMonthlyGenerate('parent-001', 'child-001', db);

    expect(mockFormatMonthlyProgressEmail).toHaveBeenCalledWith(
      'parent@example.com',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ topics: [] })]),
    );
  });

  // Break test 6 (monthly): Resend Idempotency-Key set per parentId + reportMonth
  it('(T6-monthly) sets Resend Idempotency-Key as monthly-{parentId}-{reportMonth}', async () => {
    const db = buildMonthlyMockDb();

    await executeMonthlyGenerate('parent-xyz', 'child-001', db);

    const emailCallArgs = mockSendEmail.mock.calls[0];
    expect(emailCallArgs).toBeDefined();
    const options = emailCallArgs![1] as { idempotencyKey?: string };
    expect(options.idempotencyKey).toMatch(
      /^monthly-parent-xyz-\d{4}-\d{2}-\d{2}$/,
    );
  });

  // Break test 8 (monthly): Restricted consent child's row is redacted
  it.each([['PENDING'], ['PARENTAL_CONSENT_REQUESTED'], ['WITHDRAWN']])(
    '(T8-monthly) skips monthly report when child consent status is %s',
    async (consentStatus) => {
      // Reset snapshot mock since it won't be reached for consent-blocked children
      mockGetSnapshotsInRange.mockReset();

      const db = buildMonthlyMockDb({ status: consentStatus });

      const result = (await executeMonthlyGenerate(
        'parent-001',
        'child-restricted',
        db,
      )) as { status: string; reason?: string };

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('consent_not_granted');
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    },
  );

  // Break test 9 (monthly): Missing consent row = no restriction (pre-consent-flow accounts)
  it('(T9-monthly) sends digest when consent row is missing (pre-consent-flow account)', async () => {
    const db = buildMonthlyMockDb(null); // null = no row

    await executeMonthlyGenerate('parent-001', 'child-001', db);

    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Service-level unit tests for formatter functions
// ---------------------------------------------------------------------------

describe('formatWeeklyProgressEmail', () => {
  // Import the real formatter (not the mock used in the Inngest handler tests above)
  const {
    formatWeeklyProgressEmail: realFormatWeeklyProgressEmail,
    formatMonthlyProgressEmail: _realFormatMonthlyProgressEmail,
  } = jest.requireActual<typeof import('../../services/notifications')>(
    '../../services/notifications',
  );

  it('includes child summary lines in the body', () => {
    const result = realFormatWeeklyProgressEmail(
      'test@example.com',
      ['Emma: +2 topics, +5 words'],
      [],
    );
    expect(result.body).toContain('Emma: +2 topics, +5 words');
    expect(result.type).toBe('weekly_progress');
  });

  it('includes struggle watch-line when topics present', () => {
    const result = realFormatWeeklyProgressEmail(
      'test@example.com',
      ['Emma: +2 topics'],
      [{ childName: 'Emma', topics: ['fractions', 'decimals'] }],
    );
    expect(result.body).toContain(
      'Emma: You might want to keep an eye on **fractions**.',
    );
    expect(result.body).toContain(
      'Emma: You might want to keep an eye on **decimals**.',
    );
  });

  it('attributes watch-lines to the right child when multiple children have topics', () => {
    const result = realFormatWeeklyProgressEmail(
      'test@example.com',
      ['Emma: +2 topics', 'Noah: +1 topic'],
      [
        { childName: 'Emma', topics: ['fractions'] },
        { childName: 'Noah', topics: ['geometry'] },
      ],
    );

    expect(result.body).toContain(
      'Emma: You might want to keep an eye on **fractions**.',
    );
    expect(result.body).toContain(
      'Noah: You might want to keep an eye on **geometry**.',
    );
  });

  it('caps struggle topics at 2 per child', () => {
    const result = realFormatWeeklyProgressEmail(
      'test@example.com',
      ['Emma: +2 topics'],
      [{ childName: 'Emma', topics: ['fractions', 'decimals', 'algebra'] }],
    );
    const matches = result.body.match(/You might want to keep an eye on/g);
    expect(matches).toHaveLength(2);
  });

  it('omits watch-line section when all children have empty topics', () => {
    const result = realFormatWeeklyProgressEmail(
      'test@example.com',
      ['Emma: +2 topics'],
      [{ childName: 'Emma', topics: [] }],
    );
    expect(result.body).not.toContain('You might want to keep an eye on');
  });
});

describe('formatMonthlyProgressEmail', () => {
  const { formatMonthlyProgressEmail: realFormatMonthlyProgressEmail } =
    jest.requireActual<typeof import('../../services/notifications')>(
      '../../services/notifications',
    );

  it('includes monthly summary in the body', () => {
    const result = realFormatMonthlyProgressEmail(
      'test@example.com',
      "Emma's monthly report is ready.",
      [],
    );
    expect(result.body).toContain("Emma's monthly report is ready.");
    expect(result.type).toBe('monthly_progress');
  });

  it('includes struggle watch-line when topics present', () => {
    const result = realFormatMonthlyProgressEmail(
      'test@example.com',
      "Emma's monthly report is ready.",
      [{ childName: 'Emma', topics: ['long division'] }],
    );
    expect(result.body).toContain(
      'Emma: You might want to keep an eye on **long division**.',
    );
  });

  it('attributes monthly watch-lines to the child name', () => {
    const result = realFormatMonthlyProgressEmail(
      'test@example.com',
      "Emma's monthly report is ready.",
      [
        { childName: 'Emma', topics: ['long division'] },
        { childName: 'Noah', topics: ['geometry'] },
      ],
    );

    expect(result.body).toContain(
      'Emma: You might want to keep an eye on **long division**.',
    );
    expect(result.body).toContain(
      'Noah: You might want to keep an eye on **geometry**.',
    );
  });
});
