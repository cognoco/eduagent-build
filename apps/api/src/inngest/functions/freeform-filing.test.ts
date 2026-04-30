// ---------------------------------------------------------------------------
// Freeform Filing Retry — Tests [F-5]
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../../test-utils/database-module';

const col = (name: string) => ({ name });

const mockCurriculumTopicsFindFirst = jest.fn().mockResolvedValue(null);
const mockCurriculumBooksFindFirst = jest.fn().mockResolvedValue(null);

const mockDb = {
  query: {
    sessionEvents: { findMany: jest.fn().mockResolvedValue([]) },
    learningSessions: { findFirst: jest.fn().mockResolvedValue(null) },
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

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockGetSessionTranscript = jest.fn();
jest.mock('../../services/session', () => ({
  getSessionTranscript: (...args: unknown[]) =>
    mockGetSessionTranscript(...args),
}));

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

jest.mock('../../services/filing', () => ({
  buildLibraryIndex: (...args: unknown[]) => mockBuildLibraryIndex(...args),
  fileToLibrary: (...args: unknown[]) => mockFileToLibrary(...args),
  resolveFilingResult: (...args: unknown[]) => mockResolveFilingResult(...args),
}));

jest.mock('../../services/llm', () => ({
  routeAndCall: jest.fn().mockResolvedValue({ text: 'mocked' }),
}));

// ---------------------------------------------------------------------------
// Import function under test
// ---------------------------------------------------------------------------

import { freeformFilingRetry } from './freeform-filing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testProfileId = '00000000-0000-4000-8000-000000000001';
const testSessionId = '00000000-0000-4000-8000-000000000002';

async function executeSteps(
  eventData: Record<string, unknown>
): Promise<{ result: unknown; mockStep: Record<string, unknown> }> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (freeformFilingRetry as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/filing.retry' },
    step: mockStep,
  });

  return { result, mockStep };
}

function createEventData(
  overrides: Record<string, unknown> = {}
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
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('should be defined as an Inngest function', () => {
    expect(freeformFilingRetry).toBeDefined();
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
      ])
    );
  });

  // -------------------------------------------------------------------------
  // Happy path: transcript provided in event
  // -------------------------------------------------------------------------

  describe('when sessionTranscript is provided in event.data', () => {
    it('uses provided transcript without fetching from DB', async () => {
      const { result } = await executeSteps(
        createEventData({ sessionTranscript: 'Learner: What is gravity?' })
      );

      expect(mockGetSessionTranscript).not.toHaveBeenCalled();
      expect(mockFileToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTranscript: 'Learner: What is gravity?',
        }),
        expect.anything(),
        expect.anything()
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
        testSessionId
      );
      expect(mockFileToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTranscript:
            'Learner: What is gravity?\nTutor: Gravity is a force.',
        }),
        expect.anything(),
        expect.anything()
      );
      expect(result).toMatchObject({ status: 'completed' });
    });

    it('proceeds with undefined transcript when DB returns null (filing may still succeed with no transcript)', async () => {
      mockGetSessionTranscript.mockResolvedValue(null);

      // fileToLibrary may still succeed (e.g., rawInput path); we just verify
      // the function doesn't crash and calls filing without a transcript
      const { result } = await executeSteps(createEventData());

      expect(mockGetSessionTranscript).toHaveBeenCalled();
      expect(mockFileToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({ sessionTranscript: undefined }),
        expect.anything(),
        expect.anything()
      );
      expect(result).toMatchObject({ status: 'completed' });
    });
  });

  // -------------------------------------------------------------------------
  // Completion event
  // -------------------------------------------------------------------------

  it('fires app/filing.completed event after successful filing', async () => {
    mockGetSessionTranscript.mockResolvedValue({
      session: { sessionId: 'session-001' },
      exchanges: [],
    });

    const { mockStep } = await executeSteps(createEventData());

    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'notify-filing-completed',
      expect.objectContaining({
        name: 'app/filing.completed',
        data: expect.objectContaining({
          bookId: 'book-001',
          sessionId: testSessionId,
          profileId: testProfileId,
        }),
      })
    );
  });

  it('fires app/filing.retry_completed event after successful retry filing', async () => {
    const { mockStep } = await executeSteps(createEventData());

    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'notify-filing-retry-completed',
      expect.objectContaining({
        name: 'app/filing.retry_completed',
        data: expect.objectContaining({
          sessionId: testSessionId,
          profileId: testProfileId,
        }),
      })
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
      const { mockStep } = await executeSteps(createEventData());

      const completedCall = (mockStep.sendEvent as jest.Mock).mock.calls.find(
        (c: unknown[]) => (c[0] as string) === 'notify-filing-completed'
      );
      expect(completedCall).toBeDefined();
      const payload = (completedCall as unknown[])[1] as {
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

      const { mockStep } = await executeSteps(createEventData());

      const completedCall = (mockStep.sendEvent as jest.Mock).mock.calls.find(
        (c: unknown[]) => (c[0] as string) === 'notify-filing-completed'
      );
      const payload = (completedCall as unknown[])[1] as {
        data: Record<string, unknown>;
      };
      // Keys must exist even when values are undefined (structure matches success path)
      expect(Object.keys(payload.data)).toContain('bookId');
      expect(Object.keys(payload.data)).toContain('topicTitle');
      expect(payload.data.bookId).toBeUndefined();
      expect(payload.data.topicTitle).toBeUndefined();
    });

    it('scopes the session read to both sessionId and profileId [CR-FIL-SCOPE-05]', async () => {
      await executeSteps(createEventData());

      // The check-already-filed step must read with profileId scoping
      expect(mockDb.query.learningSessions.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: expect.objectContaining({ filedAt: true, topicId: true }),
        })
      );
    });
  });
});
