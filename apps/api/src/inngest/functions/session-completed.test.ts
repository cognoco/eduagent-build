// ---------------------------------------------------------------------------
// Session Completed — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';

const col = (name: string) => ({ name });
const chainable = () => ({
  from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
});
const mockSessionCompletedDb = createTransactionalMockDb({
  query: {
    sessionEvents: { findMany: jest.fn().mockResolvedValue([]) },
    curriculumTopics: { findFirst: jest.fn().mockResolvedValue(null) },
    subjects: { findFirst: jest.fn().mockResolvedValue(null) },
    learningProfiles: {
      findFirst: jest.fn().mockResolvedValue({
        memoryConsentStatus: 'pending',
        memoryCollectionEnabled: false,
        memoryEnabled: false,
      }),
    },
    streaks: { findFirst: jest.fn().mockResolvedValue(null) },
    // analyze-learner-profile reads the session row for rawInput
    learningSessions: {
      findFirst: jest.fn().mockResolvedValue({ rawInput: null, topicId: null }),
    },
    // generate-session-insights reads summary row and profile
    sessionSummaries: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'summary-1', sessionId: 'session-1' }),
    },
    profiles: {
      findFirst: jest.fn().mockResolvedValue({ displayName: 'Emma' }),
    },
    // Snapshot aggregation reads these directly — supply empty results
    // so production code can use db.query.progressSnapshots and
    // db.query.milestones without defensive guards.
    progressSnapshots: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    milestones: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
  select: chainable,
});
const mockDatabaseModule = createDatabaseModuleMock({
  db: mockSessionCompletedDb,
  exports: {
    sessionEvents: {
      sessionId: col('sessionId'),
      profileId: col('profileId'),
      createdAt: col('createdAt'),
      eventType: col('eventType'),
    },
    retentionCards: {
      profileId: col('profileId'),
      topicId: col('topicId'),
      repetitions: col('repetitions'),
    },
    curriculumTopics: { id: col('id'), title: col('title') },
    learningProfiles: { profileId: col('profileId') },
    learningSessions: { id: col('id'), profileId: col('profileId') },
    subjects: { id: col('id'), profileId: col('profileId') },
    sessionSummaries: {
      id: col('id'),
      sessionId: col('sessionId'),
      profileId: col('profileId'),
    },
    profiles: { id: col('id'), displayName: col('displayName') },
    streaks: { profileId: col('profileId') },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

const mockStoreSessionEmbedding = jest.fn().mockResolvedValue(undefined);
const mockExtractSessionContent = jest
  .fn()
  .mockResolvedValue('User: What is algebra?\n\nAI: Algebra is...');

jest.mock('../../services/embeddings', () => ({
  storeSessionEmbedding: (...args: unknown[]) =>
    mockStoreSessionEmbedding(...args),
  extractSessionContent: (...args: unknown[]) =>
    mockExtractSessionContent(...args),
}));

const mockUpdateRetentionFromSession = jest.fn().mockResolvedValue(undefined);
const mockUpdateNeedsDeepeningProgress = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/retention-data', () => ({
  updateRetentionFromSession: (...args: unknown[]) =>
    mockUpdateRetentionFromSession(...args),
  updateNeedsDeepeningProgress: (...args: unknown[]) =>
    mockUpdateNeedsDeepeningProgress(...args),
}));

const mockGetCurrentLanguageProgress = jest.fn().mockResolvedValue(null);

jest.mock('../../services/language-curriculum', () => ({
  getCurrentLanguageProgress: (...args: unknown[]) =>
    mockGetCurrentLanguageProgress(...args),
}));

const mockExtractVocabularyFromTranscript = jest.fn().mockResolvedValue([]);

jest.mock('../../services/vocabulary-extract', () => ({
  extractVocabularyFromTranscript: (...args: unknown[]) =>
    mockExtractVocabularyFromTranscript(...args),
}));

const mockUpsertExtractedVocabulary = jest.fn().mockResolvedValue([]);

jest.mock('../../services/vocabulary', () => ({
  upsertExtractedVocabulary: (...args: unknown[]) =>
    mockUpsertExtractedVocabulary(...args),
}));

const mockCreatePendingSessionSummary = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/summaries', () => ({
  createPendingSessionSummary: (...args: unknown[]) =>
    mockCreatePendingSessionSummary(...args),
}));

const mockPrecomputeCoachingCard = jest.fn().mockResolvedValue({
  id: 'card-1',
  profileId: 'profile-001',
  type: 'challenge',
  title: 'Ready?',
  body: 'Continue.',
  priority: 3,
  expiresAt: '2026-02-18T10:00:00.000Z',
  createdAt: '2026-02-17T10:00:00.000Z',
  topicId: 'topic-001',
  difficulty: 'medium',
  xpReward: 50,
});
const mockWriteCoachingCardCache = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/coaching-cards', () => ({
  precomputeCoachingCard: (...args: unknown[]) =>
    mockPrecomputeCoachingCard(...args),
  writeCoachingCardCache: (...args: unknown[]) =>
    mockWriteCoachingCardCache(...args),
}));

const mockRecordSessionActivity = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/streaks', () => ({
  recordSessionActivity: (...args: unknown[]) =>
    mockRecordSessionActivity(...args),
}));

const mockInsertSessionXpEntry = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/xp', () => ({
  insertSessionXpEntry: (...args: unknown[]) =>
    mockInsertSessionXpEntry(...args),
}));

const mockExtractAndStoreHomeworkSummary = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock('../../services/homework-summary', () => ({
  extractAndStoreHomeworkSummary: (...args: unknown[]) =>
    mockExtractAndStoreHomeworkSummary(...args),
}));

const mockIncrementSummarySkips = jest.fn().mockResolvedValue(1);
const mockResetSummarySkips = jest.fn().mockResolvedValue(undefined);
const mockUpdateMedianResponseSeconds = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/settings', () => ({
  incrementSummarySkips: (...args: unknown[]) =>
    mockIncrementSummarySkips(...args),
  resetSummarySkips: (...args: unknown[]) => mockResetSummarySkips(...args),
  updateMedianResponseSeconds: (...args: unknown[]) =>
    mockUpdateMedianResponseSeconds(...args),
}));

const mockQueueCelebration = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/celebrations', () => ({
  queueCelebration: (...args: unknown[]) => mockQueueCelebration(...args),
}));

const mockProcessEvaluateCompletion = jest.fn().mockResolvedValue(undefined);
const mockProcessTeachBackCompletion = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/verification-completion', () => ({
  processEvaluateCompletion: (...args: unknown[]) =>
    mockProcessEvaluateCompletion(...args),
  processTeachBackCompletion: (...args: unknown[]) =>
    mockProcessTeachBackCompletion(...args),
}));

const mockRefreshProgressSnapshot = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/snapshot-aggregation', () => ({
  refreshProgressSnapshot: (...args: unknown[]) =>
    mockRefreshProgressSnapshot(...args),
}));

const mockGenerateSessionInsights = jest
  .fn()
  .mockResolvedValue({ valid: false, reason: 'parse_error' });
const mockBuildBrowseHighlight = jest
  .fn()
  .mockReturnValue('Emma browsed a topic — 1 min');

jest.mock('../../services/session-highlights', () => ({
  generateSessionInsights: (...args: unknown[]) =>
    mockGenerateSessionInsights(...args),
  buildBrowseHighlight: (...args: unknown[]) =>
    mockBuildBrowseHighlight(...args),
}));

const mockCaptureException = jest.fn();

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Learner-profile service — mocked so the analyze-learner-profile step can
// be driven through its consent gate without hitting the real LLM or DB.
// Default return: pending consent, so the step short-circuits (matches the
// prior db-mock-driven behavior). Positive-path tests override this.
const mockGetLearningProfile = jest.fn();
const mockAnalyzeSessionTranscript = jest.fn();
const mockApplyAnalysis = jest.fn();

jest.mock('../../services/learner-profile', () => ({
  getLearningProfile: (...args: unknown[]) => mockGetLearningProfile(...args),
  analyzeSessionTranscript: (...args: unknown[]) =>
    mockAnalyzeSessionTranscript(...args),
  applyAnalysis: (...args: unknown[]) => mockApplyAnalysis(...args),
}));

import { sessionCompleted } from './session-completed';
import { createDatabase } from '@eduagent/database';

// ---------------------------------------------------------------------------
// Helpers — manual step extraction for sessionCompleted
//
// Why not InngestTestEngine (@inngest/test)?
// This function uses per-step try/catch error isolation: each step.run()
// callback catches its own errors and returns { status: 'failed', error }
// instead of throwing. This lets the function always resolve with a complete
// outcomes array. InngestTestEngine intercepts step errors at the engine
// level, which breaks the error-isolation pattern (18 tests fail). Manual
// extraction is required until InngestTestEngine supports this pattern.
// ---------------------------------------------------------------------------

/** Simulates Inngest step.run by capturing step handlers */
async function executeSteps(
  eventData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const steps: Record<string, () => Promise<unknown>> = {};

  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      steps[name] = fn;
      return fn();
    }),
    sleep: jest.fn(),
    waitForEvent: jest.fn().mockResolvedValue(null),
  };

  const handler = (sessionCompleted as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/session.completed' },
    step: mockStep,
  });

  return { result, steps, mockStep };
}

function createEventData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    profileId: 'profile-001',
    sessionId: 'session-001',
    topicId: 'topic-001',
    subjectId: 'subject-001',
    summaryStatus: 'pending',
    sessionType: 'learning',
    escalationRungs: [1, 2],
    exchangeCount: 2,
    timestamp: '2026-02-17T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sessionCompleted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['VOYAGE_API_KEY'] = 'pa-test-key-123';
    // Default: pending consent — analyze-learner-profile step short-circuits.
    // Positive-path tests override to consent='granted' + collection=true.
    mockGetLearningProfile.mockResolvedValue({
      memoryConsentStatus: 'pending',
      memoryCollectionEnabled: false,
    });
    mockAnalyzeSessionTranscript.mockResolvedValue(null);
    mockApplyAnalysis.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
    delete process.env['VOYAGE_API_KEY'];
  });

  it('should be defined as an Inngest function', () => {
    expect(sessionCompleted).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (sessionCompleted as any).opts;
    expect(config.id).toBe('session-completed');
  });

  it('should trigger on app/session.completed event', () => {
    const triggers = (sessionCompleted as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/session.completed' }),
      ])
    );
  });

  it('does not wait for filing when the session was auto-closed', async () => {
    const { mockStep } = (await executeSteps(
      createEventData({ topicId: null, summaryStatus: 'auto_closed' })
    )) as any;

    expect(mockStep.waitForEvent).not.toHaveBeenCalled();
  });

  it('returns completed status with sessionId and outcomes', async () => {
    const { result } = await executeSteps(createEventData());
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        sessionId: 'session-001',
        outcomes: expect.any(Array),
      })
    );
  });

  it('returns all step outcomes', async () => {
    const { result } = (await executeSteps(createEventData())) as any;
    const stepNames = result.outcomes.map((o: any) => o.step);
    expect(stepNames).toEqual([
      'process-verification-completion',
      'update-retention',
      'update-vocabulary-retention',
      'update-needs-deepening',
      'check-milestone-completion',
      'write-coaching-card',
      'generate-session-insights',
      'generate-learner-recap',
      'analyze-learner-profile',
      'update-dashboard',
      'generate-embeddings',
      'extract-homework-summary',
      'track-summary-skips',
      'update-pace-baseline',
      'queue-celebrations',
    ]);
  });

  it('marks all steps as ok on success (verification step skipped for standard)', async () => {
    const { result } = (await executeSteps(
      createEventData({ qualityRating: 4 })
    )) as any;
    const statuses = result.outcomes
      .filter((o: any) => o.status !== 'skipped')
      .map((o: any) => o.status);
    expect(statuses).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
    // verification-completion step should be skipped for standard sessions
    const verificationOutcome = result.outcomes.find(
      (o: any) => o.step === 'process-verification-completion'
    );
    expect(verificationOutcome.status).toBe('skipped');
  });

  describe('update-retention step', () => {
    it('calls updateRetentionFromSession with correct args including timestamp', async () => {
      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'topic-001',
        4,
        '2026-02-17T10:00:00.000Z' // timestamp from event data
      );
    });

    it('skips retention update when no topicId', async () => {
      const { result } = (await executeSteps(
        createEventData({ topicId: null })
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention'
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('skips retention update when qualityRating not provided and reason is silence_timeout (F-8)', async () => {
      const { result } = (await executeSteps(
        createEventData({ reason: 'silence_timeout' })
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention'
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('uses fallback quality=3 when no qualityRating and session has topicId and reason is user_ended (F-8)', async () => {
      await executeSteps(createEventData({ reason: 'user_ended' }));

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-001',
        3,
        '2026-02-17T10:00:00.000Z'
      );
    });

    it('uses fallback quality=3 when no qualityRating, no reason, and session has topicId (F-8)', async () => {
      await executeSteps(createEventData());

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-001',
        3,
        '2026-02-17T10:00:00.000Z'
      );
    });

    it('skips retention update when no qualityRating and no topicId and no reason (F-8)', async () => {
      const { result } = (await executeSteps(
        createEventData({ topicId: null })
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention'
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('loops over interleavedTopicIds when present (FR92)', async () => {
      await executeSteps(
        createEventData({
          interleavedTopicIds: ['topic-a', 'topic-b', 'topic-c'],
          qualityRating: 4,
        })
      );

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledTimes(3);
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-a',
        4,
        '2026-02-17T10:00:00.000Z'
      );
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-b',
        4,
        '2026-02-17T10:00:00.000Z'
      );
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-c',
        4,
        '2026-02-17T10:00:00.000Z'
      );
    });

    it('prefers interleavedTopicIds over single topicId (FR92)', async () => {
      await executeSteps(
        createEventData({
          topicId: 'topic-001',
          interleavedTopicIds: ['topic-a', 'topic-b'],
          qualityRating: 4,
        })
      );

      // Should call for each interleaved topic, NOT for single topicId
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledTimes(2);
      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-001',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('update-needs-deepening step', () => {
    it('calls updateNeedsDeepeningProgress with correct args', async () => {
      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'topic-001',
        4
      );
    });

    it('skips needs-deepening update when no topicId', async () => {
      const { result } = (await executeSteps(
        createEventData({ topicId: null })
      )) as any;

      expect(mockUpdateNeedsDeepeningProgress).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-needs-deepening'
      );
      expect(outcome.status).toBe('skipped');
    });

    it('skips needs-deepening update when qualityRating not provided (issue #19)', async () => {
      const { result } = (await executeSteps(createEventData())) as any;

      expect(mockUpdateNeedsDeepeningProgress).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-needs-deepening'
      );
      expect(outcome.status).toBe('skipped');
    });

    it('loops over interleavedTopicIds when present (FR92)', async () => {
      await executeSteps(
        createEventData({
          interleavedTopicIds: ['topic-a', 'topic-b', 'topic-c'],
          qualityRating: 5,
        })
      );

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledTimes(3);
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-a',
        5
      );
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-b',
        5
      );
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-c',
        5
      );
    });
  });

  describe('update-vocabulary-retention step', () => {
    // getStepDatabase() caches the db instance per URL. We need to reset
    // the cache before each test so the fresh createDatabase() mock is used.
    // Import the reset helper from the inngest helpers module.
    const { resetDatabaseUrl } = require('../helpers');

    function setupSubjectMock(subjectData: Record<string, unknown> | null) {
      // Reset the db cache so getStepDatabase() calls createDatabase() again
      resetDatabaseUrl();
      // Override the createDatabase mock to return a db with the desired subject
      (createDatabase as jest.Mock).mockImplementationOnce(() => {
        const chainable = () => ({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
        });
        const db: Record<string, unknown> = {
          query: {
            sessionEvents: { findMany: jest.fn().mockResolvedValue([]) },
            curriculumTopics: { findFirst: jest.fn().mockResolvedValue(null) },
            subjects: {
              findFirst: jest.fn().mockResolvedValue(subjectData),
            },
            learningProfiles: {
              findFirst: jest.fn().mockResolvedValue({
                memoryConsentStatus: 'pending',
                memoryCollectionEnabled: false,
                memoryEnabled: false,
              }),
            },
            streaks: { findFirst: jest.fn().mockResolvedValue(null) },
          },
          select: chainable,
        };
        db.transaction = jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
        return db;
      });
    }

    const fourStrandsSubject = {
      id: 'subject-001',
      profileId: 'profile-001',
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    };

    afterEach(() => {
      resetDatabaseUrl();
    });

    it('skips when subjectId is not provided', async () => {
      const { result } = (await executeSteps(
        createEventData({ subjectId: null })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('skipped');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
      expect(mockUpsertExtractedVocabulary).not.toHaveBeenCalled();
    });

    it('skips when subjectId is undefined', async () => {
      const { result } = (await executeSteps(
        createEventData({ subjectId: undefined })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('skipped');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('skips when subject is not found in DB', async () => {
      setupSubjectMock(null);

      const { result } = (await executeSteps(createEventData())) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('ok');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('skips when subject pedagogyMode is not four_strands', async () => {
      setupSubjectMock({
        id: 'subject-001',
        profileId: 'profile-001',
        pedagogyMode: 'socratic',
        languageCode: null,
      });

      const { result } = (await executeSteps(createEventData())) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('ok');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('skips when subject has no languageCode', async () => {
      setupSubjectMock({
        id: 'subject-001',
        profileId: 'profile-001',
        pedagogyMode: 'four_strands',
        languageCode: null,
      });

      const { result } = (await executeSteps(createEventData())) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('ok');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('extracts vocabulary from session transcript', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
      ]);

      await executeSteps(createEventData());

      expect(mockExtractVocabularyFromTranscript).toHaveBeenCalledWith(
        expect.any(Array), // transcript
        'es', // languageCode
        null // cefrLevel (no language progress in this test)
      );
    });

    it('does not upsert when no vocabulary is extracted', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([]);

      await executeSteps(createEventData());

      expect(mockUpsertExtractedVocabulary).not.toHaveBeenCalled();
    });

    it('upserts extracted vocabulary with correct args', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
        { term: 'buenos días', translation: 'good morning', type: 'chunk' },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue({
        currentMilestone: { milestoneId: 'milestone-1' },
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpsertExtractedVocabulary).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'subject-001',
        expect.arrayContaining([
          expect.objectContaining({
            term: 'hola',
            translation: 'hello',
            type: 'word',
            milestoneId: 'milestone-1',
            quality: 4,
          }),
          expect.objectContaining({
            term: 'buenos días',
            translation: 'good morning',
            type: 'chunk',
            milestoneId: 'milestone-1',
            quality: 4,
          }),
        ])
      );
    });

    it('clamps quality rating to [0, 5] range', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue(null);

      await executeSteps(createEventData({ qualityRating: 10 }));

      expect(mockUpsertExtractedVocabulary).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'subject-001',
        expect.arrayContaining([expect.objectContaining({ quality: 5 })])
      );
    });

    it('defaults quality to 3 when qualityRating is not provided', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue(null);

      await executeSteps(createEventData());

      expect(mockUpsertExtractedVocabulary).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'subject-001',
        expect.arrayContaining([expect.objectContaining({ quality: 3 })])
      );
    });

    it('passes undefined milestoneId when no current milestone exists', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue(null);

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpsertExtractedVocabulary).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'subject-001',
        expect.arrayContaining([
          expect.objectContaining({ milestoneId: undefined }),
        ])
      );
    });

    it('prefers LLM-assigned cefrLevel over milestone fallback [LANG-01]', async () => {
      setupSubjectMock(fourStrandsSubject);
      // LLM returns cefrLevel: 'A2' on the item; milestone level is 'B1'
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word', cefrLevel: 'A2' },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue({
        currentLevel: 'B1',
        currentMilestone: { milestoneId: 'milestone-1' },
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpsertExtractedVocabulary).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'subject-001',
        expect.arrayContaining([
          expect.objectContaining({ term: 'hola', cefrLevel: 'A2' }),
        ])
      );
    });

    it('falls back to milestone cefrLevel when LLM returns null [LANG-01]', async () => {
      setupSubjectMock(fourStrandsSubject);
      // LLM returns cefrLevel: null; milestone level is 'B1'
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word', cefrLevel: null },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue({
        currentLevel: 'B1',
        currentMilestone: { milestoneId: 'milestone-1' },
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpsertExtractedVocabulary).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'subject-001',
        expect.arrayContaining([
          expect.objectContaining({ term: 'hola', cefrLevel: 'B1' }),
        ])
      );
    });

    it('fetches language progress before and after vocabulary upsert', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
      ]);
      const mockProgress = {
        currentMilestone: { milestoneId: 'milestone-1' },
      };
      mockGetCurrentLanguageProgress.mockResolvedValue(mockProgress);

      await executeSteps(createEventData({ qualityRating: 4 }));

      // getCurrentLanguageProgress is called at least twice (before and after upsert)
      expect(mockGetCurrentLanguageProgress).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'subject-001'
      );
      // Called at least twice: once for previousLanguageProgress, once for nextLanguageProgress
      const vocabRetentionCalls =
        mockGetCurrentLanguageProgress.mock.calls.filter(
          (call: unknown[]) =>
            call[1] === 'profile-001' && call[2] === 'subject-001'
        );
      expect(vocabRetentionCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('isolates errors without blocking other steps', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockRejectedValueOnce(
        new Error('LLM extraction failed')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('failed');
      expect(outcome.error).toContain('LLM extraction failed');

      // Other steps still ran
      expect(mockPrecomputeCoachingCard).toHaveBeenCalled();
      expect(mockRecordSessionActivity).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('reports step as ok on success', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockResolvedValueOnce([
        { term: 'hola', translation: 'hello', type: 'word' },
      ]);
      mockGetCurrentLanguageProgress.mockResolvedValue(null);

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention'
      );
      expect(outcome.status).toBe('ok');
    });
  });

  describe('write-coaching-card step', () => {
    it('creates a pending session summary', async () => {
      await executeSteps(createEventData());

      expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
        expect.anything(), // db
        'session-001',
        'profile-001',
        'topic-001',
        'pending'
      );
    });

    it('precomputes and caches a coaching card', async () => {
      await executeSteps(createEventData());

      expect(mockPrecomputeCoachingCard).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001'
      );
      expect(mockWriteCoachingCardCache).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        expect.objectContaining({ type: expect.any(String) })
      );
    });
  });

  describe('update-dashboard step', () => {
    it('calls recordSessionActivity when quality >= 3 (recall pass)', async () => {
      await executeSteps(createEventData({ qualityRating: 3 }));

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        '2026-02-17'
      );
    });

    // [F-044] Sessions with user engagement now count toward streaks.
    // The old gate (completionQualityRating >= 3) was a bug — most close paths
    // never set qualityRating, so streaks were never updated.
    it('calls recordSessionActivity when no qualityRating but user had exchanges (F-044)', async () => {
      await executeSteps(createEventData());

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        '2026-02-17'
      );
    });

    it('calls recordSessionActivity when quality < 3 (user still engaged, F-044)', async () => {
      await executeSteps(createEventData({ qualityRating: 2 }));

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        '2026-02-17'
      );
    });

    it('uses current date when no timestamp provided', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await executeSteps(
        createEventData({ timestamp: undefined, qualityRating: 4 })
      );

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        today
      );
    });

    it('still calls insertSessionXpEntry even without qualityRating', async () => {
      await executeSteps(createEventData());

      expect(mockInsertSessionXpEntry).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'topic-001',
        'subject-001'
      );
    });

    it('passes null topicId when topicId is undefined', async () => {
      await executeSteps(createEventData({ topicId: undefined }));

      expect(mockInsertSessionXpEntry).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        null,
        'subject-001'
      );
    });
  });

  describe('generate-embeddings step', () => {
    it('extracts real session content for embedding', async () => {
      await executeSteps(createEventData());

      expect(mockExtractSessionContent).toHaveBeenCalledWith(
        expect.anything(),
        'session-001',
        'profile-001'
      );
    });

    it('calls storeSessionEmbedding with extracted content and API key', async () => {
      await executeSteps(createEventData());

      expect(mockStoreSessionEmbedding).toHaveBeenCalledWith(
        expect.anything(),
        'session-001',
        'profile-001',
        'topic-001',
        'User: What is algebra?\n\nAI: Algebra is...',
        'pa-test-key-123'
      );
    });
  });

  describe('extract-homework-summary step', () => {
    it('skips homework extraction for non-homework sessions', async () => {
      const { result } = (await executeSteps(createEventData())) as any;

      expect(mockExtractAndStoreHomeworkSummary).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'extract-homework-summary'
      );
      expect(outcome.status).toBe('skipped');
    });

    it('extracts and stores summary for homework sessions', async () => {
      const { result } = (await executeSteps(
        createEventData({ sessionType: 'homework' })
      )) as any;

      expect(mockExtractAndStoreHomeworkSummary).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'session-001'
      );
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'extract-homework-summary'
      );
      expect(outcome.status).toBe('ok');
    });
  });

  describe('process-verification-completion step', () => {
    it('skips when verificationType is not set', async () => {
      const { result } = (await executeSteps(createEventData())) as any;
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('skipped');
      expect(mockProcessEvaluateCompletion).not.toHaveBeenCalled();
      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
    });

    it('skips when verificationType is standard', async () => {
      await executeSteps(createEventData({ verificationType: 'standard' }));
      expect(mockProcessEvaluateCompletion).not.toHaveBeenCalled();
      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
    });

    it('calls processEvaluateCompletion for evaluate sessions', async () => {
      const { result } = (await executeSteps(
        createEventData({ verificationType: 'evaluate' })
      )) as any;

      expect(mockProcessEvaluateCompletion).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'session-001',
        'topic-001'
      );
      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('ok');
    });

    it('calls processTeachBackCompletion for teach_back sessions (FR138-143)', async () => {
      const { result } = (await executeSteps(
        createEventData({ verificationType: 'teach_back' })
      )) as any;

      expect(mockProcessTeachBackCompletion).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'session-001',
        'topic-001'
      );
      expect(mockProcessEvaluateCompletion).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('ok');
    });

    it('skips when topicId is null (no topic to assess)', async () => {
      const { result } = (await executeSteps(
        createEventData({ verificationType: 'teach_back', topicId: null })
      )) as any;

      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('skipped');
    });

    it('skips and warns for unknown verificationType (C-05)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ verificationType: 'unknown_future_type' })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('skipped');
      expect(mockProcessEvaluateCompletion).not.toHaveBeenCalled();
      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown verificationType')
      );

      consoleSpy.mockRestore();
    });

    it('skips silently when verificationType is null (C-05)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ verificationType: null })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('skipped');
      // null is expected — no "Unknown verificationType" warning should be logged
      const verificationWarnings = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes('Unknown verificationType')
      );
      expect(verificationWarnings).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it('isolates errors without blocking other steps', async () => {
      mockProcessTeachBackCompletion.mockRejectedValueOnce(
        new Error('Assessment parse error')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ verificationType: 'teach_back', qualityRating: 4 })
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion'
      );
      expect(outcome.status).toBe('failed');
      expect(outcome.error).toContain('Assessment parse error');

      // Other steps still ran
      expect(mockPrecomputeCoachingCard).toHaveBeenCalled();
      expect(mockRecordSessionActivity).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // analyze-learner-profile step — Epic 16 Adaptive Memory
  //
  // The step runs AFTER write-coaching-card so profile analysis never
  // delays the user-facing card. It is gated by BOTH:
  //   memoryConsentStatus === 'granted' AND memoryCollectionEnabled === true
  // A regression that inverts either check would silently collect data
  // against consent, or silently skip collection when consent exists.
  // These tests pin down all three gate paths.
  // -------------------------------------------------------------------------

  describe('analyze-learner-profile step', () => {
    it('skips applyAnalysis when memoryConsentStatus is pending', async () => {
      mockGetLearningProfile.mockResolvedValue({
        memoryConsentStatus: 'pending',
        memoryCollectionEnabled: false,
      });

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;

      expect(mockAnalyzeSessionTranscript).not.toHaveBeenCalled();
      expect(mockApplyAnalysis).not.toHaveBeenCalled();
      // Step still runs and completes ok — the early return is success.
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'analyze-learner-profile'
      );
      expect(outcome.status).toBe('ok');
    });

    it('skips applyAnalysis when consent granted but collection disabled', async () => {
      mockGetLearningProfile.mockResolvedValue({
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: false,
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      // Gate check: both conditions must be true. Disabling collection alone
      // must prevent both transcript analysis AND applyAnalysis.
      expect(mockAnalyzeSessionTranscript).not.toHaveBeenCalled();
      expect(mockApplyAnalysis).not.toHaveBeenCalled();
    });

    it('calls applyAnalysis on the happy path (consent granted + collection enabled)', async () => {
      mockGetLearningProfile.mockResolvedValue({
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: true,
      });
      mockAnalyzeSessionTranscript.mockResolvedValue({
        explanationEffectiveness: null,
        interests: ['space'],
        strengths: null,
        struggles: null,
        resolvedTopics: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockAnalyzeSessionTranscript).toHaveBeenCalled();
      // applyAnalysis must fire with the authenticated profileId, the
      // analysis, subject name, source, and subjectId [CR-119.3].
      expect(mockApplyAnalysis).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        expect.objectContaining({ interests: ['space'] }),
        null,
        'inferred',
        'subject-001'
      );
    });

    it('does not call applyAnalysis when analyzeSessionTranscript returns null', async () => {
      mockGetLearningProfile.mockResolvedValue({
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: true,
      });
      // Transcript analysis short-circuited (e.g., empty transcript)
      mockAnalyzeSessionTranscript.mockResolvedValue(null);

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockAnalyzeSessionTranscript).toHaveBeenCalled();
      expect(mockApplyAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('track-summary-skips step', () => {
    it('increments skip count when summaryStatus is skipped', async () => {
      await executeSteps(createEventData({ summaryStatus: 'skipped' }));

      expect(mockIncrementSummarySkips).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001'
      );
      expect(mockResetSummarySkips).not.toHaveBeenCalled();
    });

    it('resets skip count when summaryStatus is submitted', async () => {
      await executeSteps(createEventData({ summaryStatus: 'submitted' }));

      expect(mockResetSummarySkips).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001'
      );
      expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
    });

    it('resets skip count when summaryStatus is accepted', async () => {
      await executeSteps(createEventData({ summaryStatus: 'accepted' }));

      expect(mockResetSummarySkips).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001'
      );
      expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
    });

    it('does not increment or reset when summaryStatus is pending', async () => {
      await executeSteps(createEventData({ summaryStatus: 'pending' }));

      expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
      expect(mockResetSummarySkips).not.toHaveBeenCalled();
    });

    it('does not increment or reset when summaryStatus is undefined', async () => {
      await executeSteps(createEventData({ summaryStatus: undefined }));

      expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
      expect(mockResetSummarySkips).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Step-level retry simulation
  // Uses manual step extraction (see helper comment above for rationale).
  // These tests validate retry recovery by calling executeSteps() twice.
  // -------------------------------------------------------------------------

  describe('step-level retry behavior', () => {
    it('recovers on step retry after transient embedding failure', async () => {
      // First call fails, simulating a transient error that Inngest would retry
      mockStoreSessionEmbedding
        .mockRejectedValueOnce(new Error('Voyage AI rate limit'))
        .mockResolvedValueOnce(undefined);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // First invocation — embedding step fails
      const { result: result1 } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;
      const embeddingOutcome1 = result1.outcomes.find(
        (o: any) => o.step === 'generate-embeddings'
      );
      expect(embeddingOutcome1.status).toBe('failed');

      // Second invocation (simulating Inngest retry) — embedding step succeeds
      const { result: result2 } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;
      const embeddingOutcome2 = result2.outcomes.find(
        (o: any) => o.step === 'generate-embeddings'
      );
      expect(embeddingOutcome2.status).toBe('ok');

      consoleSpy.mockRestore();
    });

    it('recovers on step retry after transient retention failure', async () => {
      mockUpdateRetentionFromSession
        .mockRejectedValueOnce(new Error('DB connection reset'))
        .mockResolvedValueOnce(undefined);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // First invocation — retention step fails
      const { result: result1 } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;
      const retentionOutcome1 = result1.outcomes.find(
        (o: any) => o.step === 'update-retention'
      );
      expect(retentionOutcome1.status).toBe('failed');

      // Second invocation (simulating retry) — succeeds
      const { result: result2 } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;
      const retentionOutcome2 = result2.outcomes.find(
        (o: any) => o.step === 'update-retention'
      );
      expect(retentionOutcome2.status).toBe('ok');

      consoleSpy.mockRestore();
    });

    it('captures all errors to sentry on each step failure', async () => {
      mockPrecomputeCoachingCard.mockRejectedValueOnce(
        new Error('Redis timeout')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Redis timeout' }),
        expect.objectContaining({ profileId: 'profile-001' })
      );

      consoleSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation — one failing step must not block others
  // -------------------------------------------------------------------------

  describe('error isolation', () => {
    it('continues chain when embedding step fails', async () => {
      mockStoreSessionEmbedding.mockRejectedValueOnce(
        new Error('Voyage AI rate limit')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ summaryStatus: 'skipped', qualityRating: 4 })
      )) as any;

      // Embedding failed, but other steps ran
      expect(mockUpdateRetentionFromSession).toHaveBeenCalled();
      expect(mockPrecomputeCoachingCard).toHaveBeenCalled();
      expect(mockRecordSessionActivity).toHaveBeenCalled();
      expect(mockIncrementSummarySkips).toHaveBeenCalled();

      // Sentry captured the error
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ profileId: 'profile-001' })
      );

      // Status reflects partial failure
      expect(result.status).toBe('completed-with-errors');
      const embeddingOutcome = result.outcomes.find(
        (o: any) => o.step === 'generate-embeddings'
      );
      expect(embeddingOutcome.status).toBe('failed');
      expect(embeddingOutcome.error).toContain('Voyage AI rate limit');

      consoleSpy.mockRestore();
    });

    it('continues chain when coaching card step fails', async () => {
      mockPrecomputeCoachingCard.mockRejectedValueOnce(
        new Error('DB connection timeout')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;

      // Steps after coaching card still ran
      expect(mockRecordSessionActivity).toHaveBeenCalled();
      expect(mockStoreSessionEmbedding).toHaveBeenCalled();

      expect(result.status).toBe('completed-with-errors');
      const cardOutcome = result.outcomes.find(
        (o: any) => o.step === 'write-coaching-card'
      );
      expect(cardOutcome.status).toBe('failed');

      consoleSpy.mockRestore();
    });

    it('continues chain when retention step fails', async () => {
      mockUpdateRetentionFromSession.mockRejectedValueOnce(
        new Error('SM-2 calculation error')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;

      // All subsequent steps still ran
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalled();
      expect(mockPrecomputeCoachingCard).toHaveBeenCalled();
      expect(mockRecordSessionActivity).toHaveBeenCalled();
      expect(mockStoreSessionEmbedding).toHaveBeenCalled();

      expect(result.status).toBe('completed-with-errors');

      consoleSpy.mockRestore();
    });

    it('reports multiple failures independently', async () => {
      mockUpdateRetentionFromSession.mockRejectedValueOnce(
        new Error('SM-2 fail')
      );
      mockStoreSessionEmbedding.mockRejectedValueOnce(new Error('Voyage fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 })
      )) as any;

      // Two independent failures
      const failed = result.outcomes.filter((o: any) => o.status === 'failed');
      expect(failed).toHaveLength(2);
      expect(failed.map((f: any) => f.step)).toEqual(
        expect.arrayContaining(['update-retention', 'generate-embeddings'])
      );

      // Sentry called for each failure
      expect(mockCaptureException).toHaveBeenCalledTimes(2);

      // Non-failing steps still ran
      expect(mockPrecomputeCoachingCard).toHaveBeenCalled();
      expect(mockRecordSessionActivity).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // [CR-119.1]: Streak celebrations use step result, not mutable closure
  // ---------------------------------------------------------------------------
  describe('queue-celebrations step (streak milestones)', () => {
    it('queues streak_7 celebration when recordSessionActivity returns 7-day streak', async () => {
      mockRecordSessionActivity.mockResolvedValue({
        currentStreak: 7,
        longestStreak: 7,
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockQueueCelebration).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'comet',
        'streak_7'
      );
    });

    it('queues streak_30 celebration when recordSessionActivity returns 30-day streak', async () => {
      mockRecordSessionActivity.mockResolvedValue({
        currentStreak: 30,
        longestStreak: 30,
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockQueueCelebration).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'orions_belt',
        'streak_30'
      );
    });

    it('does not queue streak celebrations when streak is not a milestone', async () => {
      mockRecordSessionActivity.mockResolvedValue({
        currentStreak: 5,
        longestStreak: 5,
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockQueueCelebration).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'streak_7'
      );
      expect(mockQueueCelebration).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'streak_30'
      );
    });

    it('does not queue streak celebrations when quality < 3 (no streak update)', async () => {
      await executeSteps(createEventData({ qualityRating: 2 }));

      expect(mockQueueCelebration).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'streak_7'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // [F-6]: Re-read topicId after filing wait timeout
  // When a freeform session's topicId is null in the event, the pipeline
  // re-reads the session row after waitForEvent in case filing completed just
  // before the 60s timeout. Downstream steps must use the backfilled topicId.
  // ---------------------------------------------------------------------------
  describe('re-read-session step [F-6]', () => {
    beforeEach(() => {
      // Reset the once-queue on findFirst so tests don't bleed into each other.
      // jest.clearAllMocks() clears call counts but not mockResolvedValueOnce
      // queues; mockReset() clears everything and re-applies the default.
      mockSessionCompletedDb.query.learningSessions.findFirst.mockReset();
      mockSessionCompletedDb.query.learningSessions.findFirst.mockResolvedValue(
        {
          rawInput: null,
          topicId: null,
        }
      );
    });

    it('runs re-read-session step when topicId is null', async () => {
      // Sequence: first findFirst call is from re-read-session (returns backfilled topicId),
      // second call is from analyze-learner-profile (returns rawInput only).
      mockSessionCompletedDb.query.learningSessions.findFirst
        .mockResolvedValueOnce({ rawInput: null, topicId: 'topic-from-db' })
        .mockResolvedValueOnce({ rawInput: null, topicId: null });

      const { mockStep } = (await executeSteps(
        createEventData({ topicId: null, qualityRating: 4 })
      )) as any;

      // re-read-session step must have been invoked
      expect(mockStep.run).toHaveBeenCalledWith(
        're-read-session',
        expect.any(Function)
      );
    });

    it('uses backfilled topicId for downstream steps when re-read returns a topicId', async () => {
      // re-read finds topicId; downstream session summary must receive it
      mockSessionCompletedDb.query.learningSessions.findFirst
        .mockResolvedValueOnce({ rawInput: null, topicId: 'topic-from-db' })
        .mockResolvedValueOnce({ rawInput: null, topicId: null });

      await executeSteps(createEventData({ topicId: null, qualityRating: 4 }));

      // createPendingSessionSummary is in the write-coaching-card step and
      // receives topicId. It must now get the backfilled value, not null.
      expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
        expect.anything(),
        'session-001',
        'profile-001',
        'topic-from-db',
        'pending'
      );
    });

    it('keeps topicId null when re-read returns no row', async () => {
      // Both findFirst calls return null row (no session found)
      mockSessionCompletedDb.query.learningSessions.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await executeSteps(createEventData({ topicId: null, qualityRating: 4 }));

      // topicId stays null — summary must receive null
      expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
        expect.anything(),
        'session-001',
        'profile-001',
        null,
        'pending'
      );
    });

    it('keeps topicId null when re-read row has no topicId', async () => {
      mockSessionCompletedDb.query.learningSessions.findFirst
        .mockResolvedValueOnce({ rawInput: null, topicId: null })
        .mockResolvedValueOnce({ rawInput: null, topicId: null });

      await executeSteps(createEventData({ topicId: null, qualityRating: 4 }));

      expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
        expect.anything(),
        'session-001',
        'profile-001',
        null,
        'pending'
      );
    });

    it('skips re-read-session step when topicId is already set', async () => {
      const { mockStep } = (await executeSteps(
        createEventData({ topicId: 'topic-001' })
      )) as any;

      // re-read-session must NOT be called when topicId is already known
      const reReadCall = (mockStep.run as jest.Mock).mock.calls.find(
        ([name]: [string]) => name === 're-read-session'
      );
      expect(reReadCall).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // [CR-119.3]: applyAnalysis receives subjectId for exact urgency boost match
  // ---------------------------------------------------------------------------
  describe('analyze-learner-profile step (subjectId threading)', () => {
    it('passes subjectId to applyAnalysis for urgency boost precision', async () => {
      mockGetLearningProfile.mockResolvedValue({
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: true,
      });
      mockAnalyzeSessionTranscript.mockResolvedValue({
        explanationEffectiveness: null,
        interests: null,
        strengths: null,
        struggles: null,
        resolvedTopics: null,
        communicationNotes: null,
        engagementLevel: null,
        confidence: 'high',
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      // applyAnalysis args: (db, profileId, analysis, subjectName, source, subjectId)
      expect(mockApplyAnalysis).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        expect.any(Object),
        null, // subjectName (null when DB lookup returns no name)
        'inferred',
        'subject-001' // subjectId threaded from event data
      );
    });
  });
});
