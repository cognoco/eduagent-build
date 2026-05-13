// ---------------------------------------------------------------------------
// Freeform Filing Retry — Tests [F-5]
// ---------------------------------------------------------------------------

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
  },
});

jest.mock('@eduagent/database', () => ({
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
}));

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockGetSessionTranscript = jest.fn();
jest.mock(
  '../../services/session' /* gc1-allow: isolates unit test from DB-backed transcript service */,
  () => ({
    getSessionTranscript: (...args: unknown[]) =>
      mockGetSessionTranscript(...args),
  }),
);

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

jest.mock(
  '../../services/filing' /* gc1-allow: isolates unit test from DB-backed filing service */,
  () => ({
    buildLibraryIndex: (...args: unknown[]) => mockBuildLibraryIndex(...args),
    fileToLibrary: (...args: unknown[]) => mockFileToLibrary(...args),
    resolveFilingResult: (...args: unknown[]) =>
      mockResolveFilingResult(...args),
  }),
);

jest.mock('../../services/llm', () => ({
  routeAndCall: jest.fn().mockResolvedValue({ text: 'mocked' }),
}));

// ---------------------------------------------------------------------------
// Import function under test
// ---------------------------------------------------------------------------

import { freeformFilingRetry } from './freeform-filing';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import type { InngestStepSendEventCall } from '../../test-utils/inngest-step-runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testProfileId = '00000000-0000-4000-8000-000000000001';
const testSessionId = '00000000-0000-4000-8000-000000000002';

async function executeSteps(
  eventData: Record<string, unknown>,
): Promise<{ result: unknown; sendEventCalls: InngestStepSendEventCall[] }> {
  const { step, sendEventCalls } = createInngestStepRunner();

  const handler = (freeformFilingRetry as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/filing.retry' },
    step,
  });

  return { result, sendEventCalls };
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
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-establish the default session row after clearAllMocks wipes implementations.
    // Tests that need a null row (missing-session abort) override this in their own beforeEach.
    mockDb.query.learningSessions.findFirst.mockResolvedValue(mockSessionRow);
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect(freeformFilingRetry).toBeTruthy();
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
  // Happy path: transcript provided in event
  // -------------------------------------------------------------------------

  describe('when sessionTranscript is provided in event.data', () => {
    it('uses provided transcript without fetching from DB', async () => {
      const { result } = await executeSteps(
        createEventData({ sessionTranscript: 'Learner: What is gravity?' }),
      );

      expect(mockGetSessionTranscript).not.toHaveBeenCalled();
      expect(mockFileToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTranscript: 'Learner: What is gravity?',
        }),
        expect.anything(),
        expect.anything(),
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
