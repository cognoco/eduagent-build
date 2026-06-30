// ---------------------------------------------------------------------------
// Freeform Filing Retry — Tests [F-5]
// ---------------------------------------------------------------------------

import { ZodError } from 'zod';
import { createDatabaseModuleMock } from '../../test-utils/database-module';

const col = (name: string) => ({ name });

const mockCurriculumTopicsFindFirst = jest.fn().mockResolvedValue(null);
const mockCurriculumBooksFindFirst = jest.fn().mockResolvedValue(null);

// Default session row: exists, not yet filed. Tests that exercise the missing-
// session abort path must explicitly override this to null.
const mockSessionRow = {
  id: '00000000-0000-4000-8000-000000000002',
  profileId: '00000000-0000-4000-8000-000000000001',
  filedAt: null,
  topicId: null,
};

const mockDb = {
  query: {
    sessionEvents: { findMany: jest.fn().mockResolvedValue([]) },
    learningSessions: {
      findFirst: jest.fn().mockResolvedValue(mockSessionRow),
    },
    curriculumTopics: { findFirst: mockCurriculumTopicsFindFirst },
    curriculumBooks: { findFirst: mockCurriculumBooksFindFirst },
    consentStates: { findFirst: jest.fn().mockResolvedValue(null) },
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
  },
};

const mockDatabaseModule = createDatabaseModuleMock({
  db: mockDb,
  exports: {
    sessionEvents: {
      sessionId: col('sessionId'),
      profileId: col('profileId'),
      createdAt: col('createdAt'),
      eventType: col('eventType'),
    },
    learningSessions: {
      id: col('id'),
      profileId: col('profileId'),
      filedAt: col('filedAt'),
      topicId: col('topicId'),
    },
    curriculumTopics: {
      id: col('id'),
      bookId: col('bookId'),
      title: col('title'),
    },
    curriculumBooks: { id: col('id') },
    consentStates: {
      profileId: col('profileId'),
      consentType: col('consentType'),
      requestedAt: col('requestedAt'),
    },
    membership: {
      personId: col('personId'),
      organizationId: col('organizationId'),
    },
    // WI-867: reduceBasisState (isGdprProcessingAllowedV2) accesses these schema columns
    // to build WHERE clauses. col() produces a stub that drizzle eq() can accept.
    consentGrant: {
      chargePersonId: col('chargePersonId'),
      purpose: col('purpose'),
      organizationId: col('organizationId'),
      lawfulBasis: col('lawfulBasis'),
    },
    consentRequest: {
      chargePersonId: col('chargePersonId'),
      purpose: col('purpose'),
      organizationId: col('organizationId'),
      requestedBasis: col('requestedBasis'),
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: inngest unit test — prevents real Neon connection; real DB exercised via .integration.test.ts harness */,
  () => ({
    ...mockDatabaseModule.module,
    // [M8b] createScopedRepository must be present in the mock so the production
    // code path compiles and runs. We wire sessions.findFirst through to the
    // existing mockDb.query.learningSessions.findFirst so test setup (beforeEach
    // overrides) continues to control what the step sees.
    createScopedRepository: (_db: unknown, _profileId: string) => ({
      sessions: {
        findFirst: (extraWhere?: unknown) =>
          mockDb.query.learningSessions.findFirst(extraWhere),
      },
    }),
  }),
);

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockGetSessionTranscript = jest.fn();
jest.mock('../../services/session', () => {
  const actual = jest.requireActual(
    '../../services/session',
  ) as typeof import('../../services/session');
  return {
    ...actual,
    getSessionTranscript: (...args: unknown[]) =>
      mockGetSessionTranscript(...args),
  };
});

const mockBuildLibraryIndex = jest.fn().mockResolvedValue({ shelves: [] });
const mockFileToLibrary = jest.fn().mockResolvedValue({
  extracted: 'Test topic',
  shelf: { name: 'Science' },
  book: { name: 'Physics', emoji: '⚡', description: 'Physics book' },
  chapter: { name: 'Mechanics' },
  topic: { title: 'Newton Laws', description: 'Laws of motion' },
});
const mockResolveFilingResult = jest.fn().mockResolvedValue({
  bookId: 'book-001',
  topicTitle: 'Newton Laws',
  topicId: 'topic-001',
  shelfId: 'shelf-001',
  shelfName: 'Science',
  bookName: 'Physics',
  chapter: 'Mechanics',
  isNew: { shelf: false, book: false, chapter: false },
});

jest.mock('../../services/filing', () => {
  const actual = jest.requireActual(
    '../../services/filing',
  ) as typeof import('../../services/filing');
  return {
    ...actual,
    // Only these three are exercised by freeform-filing; remaining DB-backed
    // exports are real and must get explicit overrides if the SUT grows.
    buildLibraryIndex: (...args: unknown[]) => mockBuildLibraryIndex(...args),
    fileToLibrary: (...args: unknown[]) => mockFileToLibrary(...args),
    resolveFilingResult: (...args: unknown[]) =>
      mockResolveFilingResult(...args),
  };
});

jest.mock('../../services/llm', () => {
  const actual = jest.requireActual(
    '../../services/llm',
  ) as typeof import('../../services/llm');
  return {
    ...actual,
    routeAndCall: jest.fn().mockResolvedValue({ text: 'mocked' }),
  };
});

// ---------------------------------------------------------------------------
// Import function under test
// ---------------------------------------------------------------------------

import { freeformFilingRetry } from './freeform-filing';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import type { InngestStepSendEventCall } from '../../test-utils/inngest-step-runner';
import { seedConsentState } from '../../test-utils/consent-seed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testProfileId = '00000000-0000-4000-8000-000000000001';
const testSessionId = '00000000-0000-4000-8000-000000000002';
const ORIGINAL_IDENTITY_V2_ENABLED = process.env['IDENTITY_V2_ENABLED'];

async function executeSteps(
  eventData: Record<string, unknown>,
  fn: unknown = freeformFilingRetry,
): Promise<{
  result: unknown;
  sendEventCalls: InngestStepSendEventCall[];
  runNames: string[];
}> {
  const runner = createInngestStepRunner();

  const handler = (fn as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/filing.retry' },
    step: runner.step,
  });

  return {
    result,
    sendEventCalls: runner.sendEventCalls,
    runNames: runner.runNames(),
  };
}

function createEventData(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    profileId: testProfileId,
    sessionId: testSessionId,
    sessionMode: 'freeform',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('freeformFilingRetry', () => {
  // -------------------------------------------------------------------------
  // [WI-996] Regression: schema parse must reject invalid payloads immediately
  // -------------------------------------------------------------------------

  it('[WI-996] throws ZodError synchronously when profileId is not a UUID', async () => {
    // With the `as` cast, an invalid profileId would pass through silently.
    // With filingRetryEventSchema.parse(), it must throw a ZodError at the
    // function boundary before any step.run() is called.
    await expect(
      executeSteps({
        profileId: 'not-uuid',
        sessionId: testSessionId,
        sessionMode: 'freeform',
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-establish the default session row after clearAllMocks wipes implementations.
    // Tests that need a null row (missing-session abort) override this in their own beforeEach.
    mockDb.query.learningSessions.findFirst.mockResolvedValue(mockSessionRow);
    mockDb.query.consentStates.findFirst.mockResolvedValue(null);
    mockDb.query.membership.findFirst.mockResolvedValue(null);
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    delete process.env['IDENTITY_V2_ENABLED'];
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
    if (ORIGINAL_IDENTITY_V2_ENABLED === undefined) {
      delete process.env['IDENTITY_V2_ENABLED'];
    } else {
      process.env['IDENTITY_V2_ENABLED'] = ORIGINAL_IDENTITY_V2_ENABLED;
    }
  });

  it('should be defined as an Inngest function with the expected id', () => {
    expect((freeformFilingRetry as { opts?: { id?: string } }).opts?.id).toBe(
      'freeform-filing-retry',
    );
  });

  it('should have the correct function id', () => {
    const config = (freeformFilingRetry as any).opts;
    expect(config.id).toBe('freeform-filing-retry');
  });

  it('should trigger on app/filing.retry event', () => {
    const triggers = (freeformFilingRetry as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/filing.retry' }),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // [M8a] Break test: missing session must abort loudly, not fall through
  // -------------------------------------------------------------------------

  describe('when session does not exist for the profileId (cross-profile or stale event)', () => {
    beforeEach(() => {
      // Simulate: the scoped repo finds no row for (sessionId, profileId)
      mockDb.query.learningSessions.findFirst.mockResolvedValue(null);
    });

    it('throws an error so Inngest retries rather than silently filing into wrong profile [M8a]', async () => {
      await expect(executeSteps(createEventData())).rejects.toThrow(
        /Session not found or does not belong to profile/,
      );
    });

    it('does not call fileToLibrary when session is missing [M8a]', async () => {
      await expect(executeSteps(createEventData())).rejects.toThrow();
      expect(mockFileToLibrary).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [WI-577 / F-073 / F-095] Break test: the event payload must never be the
  // transcript source. Legacy in-flight events may still carry a
  // `sessionTranscript` field — it must be ignored and the transcript
  // rehydrated from the DB (Inngest persists event payloads in its
  // third-party event store, so trusting the field would keep the leak
  // pattern alive on the consumer side).
  // -------------------------------------------------------------------------

  describe('when a legacy event still carries sessionTranscript [WI-577]', () => {
    it('ignores the event field and rehydrates the transcript from the DB', async () => {
      mockGetSessionTranscript.mockResolvedValue({
        session: { sessionId: testSessionId },
        archived: false,
        exchanges: [
          {
            role: 'user',
            content: 'What is gravity?',
            timestamp: '2026-01-01T00:00:00Z',
          },
          {
            role: 'assistant',
            content: 'Gravity is a force.',
            timestamp: '2026-01-01T00:00:01Z',
          },
        ],
      });

      const minorText =
        'Learner: my name is Milo Janssen and I struggle with fractions';
      const { result } = await executeSteps(
        createEventData({ sessionTranscript: minorText }),
      );

      expect(mockGetSessionTranscript).toHaveBeenCalledWith(
        expect.anything(),
        testProfileId,
        testSessionId,
      );
      expect(mockFileToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTranscript:
            'Learner: What is gravity?\nTutor: Gravity is a force.',
        }),
        expect.anything(),
        expect.anything(),
      );
      // The event-supplied text must never reach the LLM filing call.
      expect(JSON.stringify(mockFileToLibrary.mock.calls)).not.toContain(
        'Milo Janssen',
      );
      expect(result).toMatchObject({ status: 'completed', bookId: 'book-001' });
    });
  });

  // -------------------------------------------------------------------------
  // Self-heal: transcript absent — fetch from DB
  // -------------------------------------------------------------------------

  describe('when sessionTranscript is absent (self-heal path)', () => {
    it('fetches transcript from DB and proceeds with filing', async () => {
      mockGetSessionTranscript.mockResolvedValue({
        session: {
          sessionId: 'session-001',
          subjectId: 'subject-001',
          topicId: null,
          sessionType: 'freeform',
          inputMode: 'text',
          startedAt: new Date().toISOString(),
          exchangeCount: 2,
          milestonesReached: [],
          wallClockSeconds: 120,
        },
        exchanges: [
          {
            role: 'user',
            content: 'What is gravity?',
            timestamp: '2026-01-01T00:00:00Z',
          },
          {
            role: 'assistant',
            content: 'Gravity is a force.',
            timestamp: '2026-01-01T00:00:01Z',
          },
        ],
      });

      const { result } = await executeSteps(createEventData());

      expect(mockGetSessionTranscript).toHaveBeenCalledWith(
        expect.anything(),
        testProfileId,
        testSessionId,
      );
      expect(mockFileToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTranscript:
            'Learner: What is gravity?\nTutor: Gravity is a force.',
        }),
        expect.anything(),
        expect.anything(),
      );
      expect(result).toMatchObject({ status: 'completed' });
    });

    it('[WI-550/F-019] does not memoize the transcript in a separate fetch-transcript step', async () => {
      mockGetSessionTranscript.mockResolvedValue({
        session: { sessionId: 'session-001' },
        exchanges: [
          {
            role: 'user',
            content: 'What is gravity?',
            timestamp: '2026-01-01T00:00:00Z',
          },
          {
            role: 'assistant',
            content: 'Gravity is a force.',
            timestamp: '2026-01-01T00:00:01Z',
          },
        ],
      });

      const { runNames } = await executeSteps(createEventData());

      expect(runNames).toContain('retry-filing');
      expect(runNames).not.toContain('fetch-transcript');
    });

    it('throws NonRetriableError when DB returns null transcript (unresolvable — no retry)', async () => {
      mockGetSessionTranscript.mockResolvedValue(null);

      await expect(executeSteps(createEventData())).rejects.toThrow(
        /Cannot file session: transcript unavailable/,
      );

      expect(mockGetSessionTranscript).toHaveBeenCalled();
      expect(mockFileToLibrary).not.toHaveBeenCalled();
    });

    it('throws NonRetriableError when session has archived transcript', async () => {
      mockGetSessionTranscript.mockResolvedValue({
        archived: true,
        exchanges: [],
      });

      await expect(executeSteps(createEventData())).rejects.toThrow(
        /Cannot file session: transcript unavailable/,
      );

      expect(mockFileToLibrary).not.toHaveBeenCalled();
    });
  });

  describe('GDPR consent gate', () => {
    it('[WI-550/F-019] skips filing and LLM work when GDPR consent is not granted', async () => {
      // WI-867: source reads isGdprProcessingAllowedV2 (v2, IDENTITY_V2_ENABLED=true).
      // Seed the v2 consent chain; old consentStates.findFirst is no longer consulted.
      seedConsentState(mockDb as unknown as Record<string, unknown>, {
        state: 'WITHDRAWN',
      });
      mockGetSessionTranscript.mockResolvedValue({
        session: { sessionId: 'session-001' },
        exchanges: [
          {
            role: 'user',
            content: 'What is gravity?',
            timestamp: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const { result, sendEventCalls, runNames } =
        await executeSteps(createEventData());

      expect(result).toEqual({
        status: 'skipped',
        reason: 'consent_not_granted',
      });
      expect(runNames).not.toContain('retry-filing');
      expect(mockBuildLibraryIndex).not.toHaveBeenCalled();
      expect(mockFileToLibrary).not.toHaveBeenCalled();
      expect(mockResolveFilingResult).not.toHaveBeenCalled();
      expect(sendEventCalls).toHaveLength(0);
    });

    it('[WI-550/F-019] skips transcript and filing work when GDPR consent is withdrawn between Inngest steps', async () => {
      // WI-867: source reads isGdprProcessingAllowedV2 (v2, IDENTITY_V2_ENABLED=true).
      // First step = CONSENTED (proceed to transcript), second step = WITHDRAWN (skip filing).
      seedConsentState(mockDb as unknown as Record<string, unknown>, {
        state: ['CONSENTED', 'WITHDRAWN'],
      });
      mockGetSessionTranscript.mockResolvedValue({
        session: { sessionId: 'session-001' },
        exchanges: [
          {
            role: 'user',
            content: 'What is gravity?',
            timestamp: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const { result, sendEventCalls, runNames } =
        await executeSteps(createEventData());

      expect(result).toEqual({
        status: 'skipped',
        reason: 'consent_not_granted',
      });
      expect(runNames).toContain('check-gdpr-consent');
      expect(runNames).toContain('retry-filing');
      expect(mockGetSessionTranscript).not.toHaveBeenCalled();
      expect(mockBuildLibraryIndex).not.toHaveBeenCalled();
      expect(mockFileToLibrary).not.toHaveBeenCalled();
      expect(mockResolveFilingResult).not.toHaveBeenCalled();
      expect(sendEventCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Completion event
  // -------------------------------------------------------------------------

  it('fires app/filing.completed event after successful filing', async () => {
    mockGetSessionTranscript.mockResolvedValue({
      session: { sessionId: 'session-001' },
      exchanges: [
        { role: 'user', content: 'Hello', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Hi', timestamp: '2026-01-01T00:00:01Z' },
      ],
    });

    const { sendEventCalls } = await executeSteps(createEventData());

    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notify-filing-completed',
          payload: expect.objectContaining({
            name: 'app/filing.completed',
            data: expect.objectContaining({
              bookId: 'book-001',
              sessionId: testSessionId,
              profileId: testProfileId,
            }),
          }),
        }),
      ]),
    );
  });

  it('fires app/filing.retry_completed event after successful retry filing', async () => {
    mockGetSessionTranscript.mockResolvedValue({
      session: { sessionId: 'session-001' },
      exchanges: [
        { role: 'user', content: 'Hello', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Hi', timestamp: '2026-01-01T00:00:01Z' },
      ],
    });

    const { sendEventCalls } = await executeSteps(createEventData());

    expect(sendEventCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notify-filing-retry-completed',
          payload: expect.objectContaining({
            name: 'app/filing.retry_completed',
            data: expect.objectContaining({
              sessionId: testSessionId,
              profileId: testProfileId,
            }),
          }),
        }),
      ]),
    );
  });

  // -------------------------------------------------------------------------
  // [CR-FIL-CONSISTENCY-02] alreadyFiled early-exit path — payload consistency
  // -------------------------------------------------------------------------

  describe('when session is already filed (alreadyFiled path)', () => {
    const filedTopicId = 'topic-filed-001';
    const filedBookId = 'book-filed-001';

    beforeEach(() => {
      // Session row shows it was already filed and has a topicId
      mockDb.query.learningSessions.findFirst.mockResolvedValue({
        filedAt: new Date('2026-01-01T10:00:00Z'),
        topicId: filedTopicId,
      });
      mockCurriculumTopicsFindFirst.mockResolvedValue({
        title: 'Newton Laws',
        bookId: filedBookId,
      });
      mockCurriculumBooksFindFirst.mockResolvedValue({ id: filedBookId });
    });

    it('skips filing and returns already_filed status', async () => {
      const { result } = await executeSteps(createEventData());
      expect(result).toMatchObject({ status: 'already_filed', skipped: true });
    });

    it('does not call fileToLibrary on the already_filed path', async () => {
      await executeSteps(createEventData());
      expect(mockFileToLibrary).not.toHaveBeenCalled();
    });

    it('emits app/filing.completed with the same key set as the success path [CR-FIL-CONSISTENCY-02]', async () => {
      const { sendEventCalls } = await executeSteps(createEventData());

      const completedCall = sendEventCalls.find(
        (c) => c.name === 'notify-filing-completed',
      );
      expect(completedCall).not.toBeUndefined();
      const payload = completedCall!.payload as {
        name: string;
        data: Record<string, unknown>;
      };

      // Must have all four data keys that the success path emits
      expect(payload.data).toHaveProperty('bookId');
      expect(payload.data).toHaveProperty('topicTitle');
      expect(payload.data).toHaveProperty('profileId', testProfileId);
      expect(payload.data).toHaveProperty('sessionId', testSessionId);
      // Resolved values from the topic lookup
      expect(payload.data.bookId).toBe(filedBookId);
      expect(payload.data.topicTitle).toBe('Newton Laws');
    });

    it('falls back to undefined bookId/topicTitle when topicId is null [CR-FIL-CONSISTENCY-02]', async () => {
      // Session filed but topicId not yet written (edge case)
      mockDb.query.learningSessions.findFirst.mockResolvedValue({
        filedAt: new Date('2026-01-01T10:00:00Z'),
        topicId: null,
      });

      const { sendEventCalls } = await executeSteps(createEventData());

      const completedCall = sendEventCalls.find(
        (c) => c.name === 'notify-filing-completed',
      );
      const payload = completedCall!.payload as {
        data: Record<string, unknown>;
      };
      // Keys must exist even when values are undefined (structure matches success path)
      expect(Object.keys(payload.data)).toContain('bookId');
      expect(Object.keys(payload.data)).toContain('topicTitle');
      expect(payload.data.bookId).toBeUndefined();
      expect(payload.data.topicTitle).toBeUndefined();
    });

    it('scopes the session read via createScopedRepository (not a raw profileId eq) [CR-FIL-SCOPE-05, M8b]', async () => {
      await executeSteps(createEventData());

      // The check-already-filed step must go through the scoped repo, which
      // delegates to mockDb.query.learningSessions.findFirst. Verifying it was
      // called exactly once confirms the scoped path ran (not a short-circuit).
      expect(mockDb.query.learningSessions.findFirst).toHaveBeenCalledTimes(1);
    });

    // [CR-FIL-LOOKUP-07] When a topic still references a book that has been
    // soft-deleted (or curriculumBooks is otherwise unavailable), the payload
    // must still carry the FK bookId from the topic row — never silently
    // emit undefined. Pre-fix this test would have failed because the code
    // re-queried curriculumBooks and used `book?.id ?? undefined`.
    it('[CR-FIL-LOOKUP-07] preserves bookId from topic row even when book lookup would return nothing', async () => {
      // Simulate: curriculumBooks.findFirst returning null (book row gone).
      // The fix ignores this lookup entirely; we keep the mock in place to
      // prove the new code path doesn't depend on it.
      mockCurriculumBooksFindFirst.mockResolvedValue(null);

      const { sendEventCalls } = await executeSteps(createEventData());

      const completedCall = sendEventCalls.find(
        (c) => c.name === 'notify-filing-completed',
      );
      const payload = completedCall!.payload as {
        data: Record<string, unknown>;
      };
      expect(payload.data.bookId).toBe(filedBookId);
      expect(payload.data.topicTitle).toBe('Newton Laws');
      // The dropped-query assertion: curriculumBooks must NOT be queried by
      // the alreadyFiled path now. If a future regression re-introduces the
      // lookup, this expectation will catch it.
      expect(mockCurriculumBooksFindFirst).not.toHaveBeenCalled();
    });
  });
});
