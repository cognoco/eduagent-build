// ---------------------------------------------------------------------------
// Session Completed — Tests
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../../test-utils/database-module';
import { PgDialect } from 'drizzle-orm/pg-core';

const col = (name: string) => ({ name });
const chainable = () => ({
  from: () => ({
    where: () => ({
      orderBy: () => ({ limit: () => Promise.resolve([]) }),
      limit: () => Promise.resolve([]),
    }),
  }),
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
  update: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([]),
    }),
  }),
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
    memoryFacts: {
      id: col('id'),
      profileId: col('profileId'),
      text: col('text'),
      category: col('category'),
      embedding: col('embedding'),
      supersededBy: col('supersededBy'),
    },
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

// Default fixture UUIDs used across all tests via createEventData().
// Must satisfy z.string().uuid() — the filing-timed-out event schema
// (and other event schemas) tightened to UUID-only after FILING-TIMEOUT-OBS.
const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const TOPIC_ID = '00000000-0000-4000-8000-000000000003';
const SUBJECT_ID = '00000000-0000-4000-8000-000000000004';

// Separate UUIDs used in the BUG-852 wait-for-filing timeout tests so
// assertions on those specific values remain distinct from the defaults above.
const validProfileId = '00000000-0000-4000-8000-000000000011';
const validSessionId = '00000000-0000-4000-8000-000000000012';

const mockStoreSessionEmbedding = jest.fn().mockResolvedValue(undefined);
const mockExtractSessionContent = jest
  .fn()
  .mockResolvedValue('User: What is algebra?\n\nAI: Algebra is...');

jest.mock(
  '../../services/embeddings' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/embeddings',
    ) as typeof import('../../services/embeddings');
    return {
      ...actual,
      storeSessionEmbedding: (...args: unknown[]) =>
        mockStoreSessionEmbedding(...args),
      extractSessionContent: (...args: unknown[]) =>
        mockExtractSessionContent(...args),
    };
  },
);

const mockUpdateRetentionFromSession = jest.fn().mockResolvedValue(undefined);
const mockUpdateNeedsDeepeningProgress = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/retention-data' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/retention-data',
    ) as typeof import('../../services/retention-data');
    return {
      ...actual,
      updateRetentionFromSession: (...args: unknown[]) =>
        mockUpdateRetentionFromSession(...args),
      updateNeedsDeepeningProgress: (...args: unknown[]) =>
        mockUpdateNeedsDeepeningProgress(...args),
    };
  },
);

const mockGetCurrentLanguageProgress = jest.fn().mockResolvedValue(null);

jest.mock(
  '../../services/language-curriculum' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/language-curriculum',
    ) as typeof import('../../services/language-curriculum');
    return {
      ...actual,
      getCurrentLanguageProgress: (...args: unknown[]) =>
        mockGetCurrentLanguageProgress(...args),
    };
  },
);

const mockExtractVocabularyFromTranscript = jest.fn().mockResolvedValue([]);

jest.mock(
  '../../services/vocabulary-extract' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/vocabulary-extract',
    ) as typeof import('../../services/vocabulary-extract');
    return {
      ...actual,
      extractVocabularyFromTranscript: (...args: unknown[]) =>
        mockExtractVocabularyFromTranscript(...args),
    };
  },
);

const mockUpsertExtractedVocabulary = jest.fn().mockResolvedValue([]);

jest.mock(
  '../../services/vocabulary' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/vocabulary',
    ) as typeof import('../../services/vocabulary');
    return {
      ...actual,
      upsertExtractedVocabulary: (...args: unknown[]) =>
        mockUpsertExtractedVocabulary(...args),
    };
  },
);

const mockCreatePendingSessionSummary = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/summaries' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/summaries',
    ) as typeof import('../../services/summaries');
    return {
      ...actual,
      createPendingSessionSummary: (...args: unknown[]) =>
        mockCreatePendingSessionSummary(...args),
    };
  },
);

const mockPrecomputeCoachingCard = jest.fn().mockResolvedValue({
  id: 'card-1',
  profileId: PROFILE_ID,
  type: 'challenge',
  title: 'Ready?',
  body: 'Continue.',
  priority: 3,
  expiresAt: '2026-02-18T10:00:00.000Z',
  createdAt: '2026-02-17T10:00:00.000Z',
  topicId: TOPIC_ID,
  difficulty: 'medium',
  xpReward: 50,
});
const mockWriteCoachingCardCache = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/coaching-cards' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/coaching-cards',
    ) as typeof import('../../services/coaching-cards');
    return {
      ...actual,
      precomputeCoachingCard: (...args: unknown[]) =>
        mockPrecomputeCoachingCard(...args),
      writeCoachingCardCache: (...args: unknown[]) =>
        mockWriteCoachingCardCache(...args),
    };
  },
);

const mockRecordSessionActivity = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/streaks' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/streaks',
    ) as typeof import('../../services/streaks');
    return {
      ...actual,
      recordSessionActivity: (...args: unknown[]) =>
        mockRecordSessionActivity(...args),
    };
  },
);

const mockInsertSessionXpEntry = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/xp' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/xp',
  ) as typeof import('../../services/xp');
  return {
    ...actual,
    insertSessionXpEntry: (...args: unknown[]) =>
      mockInsertSessionXpEntry(...args),
  };
});

const mockExtractAndStoreHomeworkSummary = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock(
  '../../services/homework-summary' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/homework-summary',
    ) as typeof import('../../services/homework-summary');
    return {
      ...actual,
      extractAndStoreHomeworkSummary: (...args: unknown[]) =>
        mockExtractAndStoreHomeworkSummary(...args),
    };
  },
);

const mockIncrementSummarySkips = jest.fn().mockResolvedValue(1);
const mockResetSummarySkips = jest.fn().mockResolvedValue(undefined);
const mockUpdateMedianResponseSeconds = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/settings' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/settings',
    ) as typeof import('../../services/settings');
    return {
      ...actual,
      incrementSummarySkips: (...args: unknown[]) =>
        mockIncrementSummarySkips(...args),
      resetSummarySkips: (...args: unknown[]) => mockResetSummarySkips(...args),
      updateMedianResponseSeconds: (...args: unknown[]) =>
        mockUpdateMedianResponseSeconds(...args),
    };
  },
);

const mockQueueCelebration = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/celebrations' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/celebrations',
    ) as typeof import('../../services/celebrations');
    return {
      ...actual,
      queueCelebration: (...args: unknown[]) => mockQueueCelebration(...args),
    };
  },
);

const mockProcessEvaluateCompletion = jest.fn().mockResolvedValue(undefined);
const mockProcessTeachBackCompletion = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/verification-completion' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/verification-completion',
    ) as typeof import('../../services/verification-completion');
    return {
      ...actual,
      processEvaluateCompletion: (...args: unknown[]) =>
        mockProcessEvaluateCompletion(...args),
      processTeachBackCompletion: (...args: unknown[]) =>
        mockProcessTeachBackCompletion(...args),
    };
  },
);

const mockRefreshProgressSnapshot = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/snapshot-aggregation' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/snapshot-aggregation',
    ) as typeof import('../../services/snapshot-aggregation');
    return {
      ...actual,
      refreshProgressSnapshot: (...args: unknown[]) =>
        mockRefreshProgressSnapshot(...args),
    };
  },
);

const mockGenerateSessionInsights = jest
  .fn()
  .mockResolvedValue({ valid: false, reason: 'parse_error' });
const mockBuildBrowseHighlight = jest
  .fn()
  .mockReturnValue('Emma browsed a topic — 1 min');
const mockGenerateAndStoreLlmSummary = jest.fn().mockResolvedValue({
  narrative:
    'Worked through algebra and named the balancing step while checking each move.',
  topicsCovered: ['algebra', 'balancing equations'],
  sessionState: 'completed',
  reEntryRecommendation:
    'Start with a new one-step equation and ask the learner to explain each inverse operation.',
});

jest.mock(
  '../../services/session-highlights' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/session-highlights',
    ) as typeof import('../../services/session-highlights');
    return {
      ...actual,
      generateSessionInsights: (...args: unknown[]) =>
        mockGenerateSessionInsights(...args),
      buildBrowseHighlight: (...args: unknown[]) =>
        mockBuildBrowseHighlight(...args),
    };
  },
);

jest.mock(
  '../../services/session-llm-summary' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/session-llm-summary',
    ) as typeof import('../../services/session-llm-summary');
    return {
      ...actual,
      generateAndStoreLlmSummary: (...args: unknown[]) =>
        mockGenerateAndStoreLlmSummary(...args),
    };
  },
);

const mockCaptureException = jest.fn();

jest.mock('../../services/sentry' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

// Learner-profile service — mocked so the analyze-learner-profile step can
// be driven through its consent gate without hitting the real LLM or DB.
// Default return: pending consent, so the step short-circuits (matches the
// prior db-mock-driven behavior). Positive-path tests override this.
const mockGetLearningProfile = jest.fn();
const mockAnalyzeSessionTranscript = jest.fn();
const mockApplyAnalysis = jest.fn();

jest.mock(
  '../../services/learner-profile' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/learner-profile',
    ) as typeof import('../../services/learner-profile');
    return {
      ...actual,
      getLearningProfile: (...args: unknown[]) =>
        mockGetLearningProfile(...args),
      analyzeSessionTranscript: (...args: unknown[]) =>
        mockAnalyzeSessionTranscript(...args),
      applyAnalysis: (...args: unknown[]) => mockApplyAnalysis(...args),
    };
  },
);

import { sessionCompleted, embedNewFactsForProfile } from './session-completed';
import { createDatabase } from '@eduagent/database';
import type { Database } from '@eduagent/database';

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
  eventData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const steps: Record<string, () => Promise<unknown>> = {};

  const mockStep = {
    run: jest.fn(async (name: string, fn: () => Promise<unknown>) => {
      steps[name] = fn;
      return fn();
    }),
    // [SWEEP-SILENT-RECOVERY] Production now dispatches a queryable
    // app/session.filing_timed_out event via step.sendEvent when the
    // 60s wait-for-filing window expires. Stub here so the handler
    // doesn't TypeError on `step.sendEvent is not a function`.
    sendEvent: jest.fn().mockResolvedValue(undefined),
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
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    profileId: PROFILE_ID,
    sessionId: SESSION_ID,
    topicId: TOPIC_ID,
    subjectId: SUBJECT_ID,
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
    expect(sessionCompleted).toBeTruthy();
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
      ]),
    );
  });

  it('does not wait for filing when the session was auto-closed', async () => {
    const { mockStep } = (await executeSteps(
      createEventData({ topicId: null, summaryStatus: 'auto_closed' }),
    )) as any;

    expect(mockStep.waitForEvent).not.toHaveBeenCalled();
  });

  // [BUG-852] When step.waitForEvent('wait-for-filing') returns null (60s
  // timeout fired), we previously proceeded silently with stale topic
  // placement — invisible in production observability. The fix escalates
  // via Sentry so we can quantify how often the window is too short.
  it('[BUG-852] escalates via Sentry when filing waitForEvent times out', async () => {
    // Default mockStep.waitForEvent already returns null (= timeout). Use a
    // homework-type session with no topicId so the if-branch is entered.
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const { mockStep } = (await executeSteps(
      createEventData({
        profileId: validProfileId,
        sessionId: validSessionId,
        topicId: null,
        sessionType: 'homework',
      }),
    )) as any;

    expect(mockStep.waitForEvent).toHaveBeenCalledWith(
      'wait-for-filing',
      expect.objectContaining({ event: 'app/filing.completed' }),
    );
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('waitForEvent timed out'),
      }),
      expect.objectContaining({ profileId: validProfileId }),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('filing waitForEvent timed out'),
    );
    // [SWEEP-SILENT-RECOVERY] Filing-timeout must also dispatch an Inngest
    // event for non-Sentry observability (oncall pages on rate spikes).
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      'filing-timed-out',
      expect.objectContaining({
        name: 'app/session.filing_timed_out',
        data: expect.objectContaining({
          sessionId: validSessionId,
          profileId: validProfileId,
          sessionType: 'homework',
          timeoutMs: 60000,
        }),
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  // [BUG-852] Complement test — when filing event arrives in time (non-null),
  // no Sentry escalation should fire. Guards against over-reporting that
  // would drown out real timeouts in alerting.
  it('[BUG-852] does NOT escalate when filing waitForEvent returns an event', async () => {
    mockCaptureException.mockClear();
    const localMockStep = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
      sendEvent: jest.fn().mockResolvedValue(undefined),
      sleep: jest.fn(),
      waitForEvent: jest
        .fn()
        .mockResolvedValue({ data: { sessionId: SESSION_ID } }),
    };
    const handler = (sessionCompleted as unknown as { fn: any }).fn;
    await handler({
      event: {
        data: createEventData({ topicId: null, sessionType: 'homework' }),
        name: 'app/session.completed',
      },
      step: localMockStep,
    });

    expect(localMockStep.waitForEvent).toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('waitForEvent timed out'),
      }),
      expect.anything(),
    );
  });

  it('returns completed status with sessionId and outcomes', async () => {
    const { result } = await executeSteps(createEventData());
    expect(result).toEqual(
      expect.objectContaining({
        status: 'completed',
        sessionId: SESSION_ID,
        outcomes: expect.any(Array),
      }),
    );
  });

  it('returns all step outcomes', async () => {
    const { result } = (await executeSteps(createEventData())) as any;
    const stepNames = result.outcomes.map((o: any) => o.step);
    expect(stepNames).toEqual([
      'process-verification-completion',
      'relearn-retention-reset',
      'update-retention',
      'update-vocabulary-retention',
      'update-needs-deepening',
      'check-milestone-completion',
      'write-coaching-card',
      'generate-session-insights',
      'generate-learner-recap',
      'generate-llm-summary',
      'analyze-learner-profile',
      'embed-new-memory-facts',
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
      createEventData({ qualityRating: 4 }),
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
      'ok',
      'ok',
    ]);
    // verification-completion step should be skipped for standard sessions
    const verificationOutcome = result.outcomes.find(
      (o: any) => o.step === 'process-verification-completion',
    );
    expect(verificationOutcome.status).toBe('skipped');
  });

  describe('update-retention step', () => {
    it('calls updateRetentionFromSession with correct args including timestamp', async () => {
      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        TOPIC_ID,
        4,
        '2026-02-17T10:00:00.000Z', // timestamp from event data
      );
    });

    it('skips retention update when no topicId', async () => {
      const { result } = (await executeSteps(
        createEventData({ topicId: null }),
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention',
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('skips retention update when qualityRating not provided and reason is silence_timeout (F-8)', async () => {
      const { result } = (await executeSteps(
        createEventData({ reason: 'silence_timeout' }),
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention',
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('skips retention update when no qualityRating and reason is user_ended (STATUS-STRICT)', async () => {
      const { result } = (await executeSteps(
        createEventData({ reason: 'user_ended' }),
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention',
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('skips retention update when no qualityRating, no reason, and session has topicId (STATUS-STRICT)', async () => {
      const { result } = (await executeSteps(createEventData())) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention',
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('skips retention update when no qualityRating and no topicId and no reason (F-8)', async () => {
      const { result } = (await executeSteps(
        createEventData({ topicId: null }),
      )) as any;

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
      const retentionOutcome = result.outcomes.find(
        (o: any) => o.step === 'update-retention',
      );
      expect(retentionOutcome.status).toBe('skipped');
    });

    it('loops over interleavedTopicIds when present (FR92)', async () => {
      await executeSteps(
        createEventData({
          interleavedTopicIds: ['topic-a', 'topic-b', 'topic-c'],
          qualityRating: 4,
        }),
      );

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledTimes(3);
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        'topic-a',
        4,
        '2026-02-17T10:00:00.000Z',
      );
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        'topic-b',
        4,
        '2026-02-17T10:00:00.000Z',
      );
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        'topic-c',
        4,
        '2026-02-17T10:00:00.000Z',
      );
    });

    it('prefers interleavedTopicIds over single topicId (FR92)', async () => {
      await executeSteps(
        createEventData({
          topicId: TOPIC_ID,
          interleavedTopicIds: ['topic-a', 'topic-b'],
          qualityRating: 4,
        }),
      );

      // Should call for each interleaved topic, NOT for single topicId
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledTimes(2);
      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        TOPIC_ID,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('relearn-retention-reset step', () => {
    it('resets the retention card after a relearn session with exchanges', async () => {
      const { result } = (await executeSteps(
        createEventData({
          mode: 'relearn',
          exchangeCount: 3,
          qualityRating: 4,
        }),
      )) as any;

      const resetOutcome = result.outcomes.find(
        (o: any) => o.step === 'relearn-retention-reset',
      );
      expect(resetOutcome.status).toBe('ok');
      expect(mockSessionCompletedDb.update).toHaveBeenCalled();
    });

    it('skips the reset when relearn has zero exchanges', async () => {
      const { result } = (await executeSteps(
        createEventData({
          mode: 'relearn',
          exchangeCount: 0,
          qualityRating: 4,
        }),
      )) as any;

      const resetOutcome = result.outcomes.find(
        (o: any) => o.step === 'relearn-retention-reset',
      );
      expect(resetOutcome.status).toBe('skipped');
    });

    it('skips the reset for non-relearn sessions', async () => {
      const { result } = (await executeSteps(
        createEventData({
          mode: 'learning',
          exchangeCount: 3,
          qualityRating: 4,
        }),
      )) as any;

      const resetOutcome = result.outcomes.find(
        (o: any) => o.step === 'relearn-retention-reset',
      );
      expect(resetOutcome.status).toBe('skipped');
    });

    it('skips the reset when relearn has no explicit quality signal', async () => {
      const { result } = (await executeSteps(
        createEventData({
          mode: 'relearn',
          exchangeCount: 3,
          qualityRating: undefined,
        }),
      )) as any;

      const resetOutcome = result.outcomes.find(
        (o: any) => o.step === 'relearn-retention-reset',
      );
      expect(resetOutcome.status).toBe('skipped');
    });
  });

  describe('update-needs-deepening step', () => {
    it('calls updateNeedsDeepeningProgress with correct args', async () => {
      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        TOPIC_ID,
        4,
      );
    });

    it('skips needs-deepening update when no topicId', async () => {
      const { result } = (await executeSteps(
        createEventData({ topicId: null }),
      )) as any;

      expect(mockUpdateNeedsDeepeningProgress).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-needs-deepening',
      );
      expect(outcome.status).toBe('skipped');
    });

    it('skips needs-deepening update when qualityRating not provided (issue #19)', async () => {
      const { result } = (await executeSteps(createEventData())) as any;

      expect(mockUpdateNeedsDeepeningProgress).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-needs-deepening',
      );
      expect(outcome.status).toBe('skipped');
    });

    it('loops over interleavedTopicIds when present (FR92)', async () => {
      await executeSteps(
        createEventData({
          interleavedTopicIds: ['topic-a', 'topic-b', 'topic-c'],
          qualityRating: 5,
        }),
      );

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledTimes(3);
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        'topic-a',
        5,
      );
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        'topic-b',
        5,
      );
      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        'topic-c',
        5,
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
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: () => Promise.resolve([]) }),
              limit: () => Promise.resolve([]),
            }),
          }),
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
      id: SUBJECT_ID,
      profileId: PROFILE_ID,
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    };

    afterEach(() => {
      resetDatabaseUrl();
    });

    it('skips when subjectId is not provided', async () => {
      const { result } = (await executeSteps(
        createEventData({ subjectId: null }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
      );
      expect(outcome.status).toBe('skipped');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
      expect(mockUpsertExtractedVocabulary).not.toHaveBeenCalled();
    });

    it('skips when subjectId is undefined', async () => {
      const { result } = (await executeSteps(
        createEventData({ subjectId: undefined }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
      );
      expect(outcome.status).toBe('skipped');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('skips when subject is not found in DB', async () => {
      setupSubjectMock(null);

      const { result } = (await executeSteps(createEventData())) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
      );
      expect(outcome.status).toBe('ok');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('skips when subject pedagogyMode is not four_strands', async () => {
      setupSubjectMock({
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        pedagogyMode: 'socratic',
        languageCode: null,
      });

      const { result } = (await executeSteps(createEventData())) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
      );
      expect(outcome.status).toBe('ok');
      expect(mockExtractVocabularyFromTranscript).not.toHaveBeenCalled();
    });

    it('skips when subject has no languageCode', async () => {
      setupSubjectMock({
        id: SUBJECT_ID,
        profileId: PROFILE_ID,
        pedagogyMode: 'four_strands',
        languageCode: null,
      });

      const { result } = (await executeSteps(createEventData())) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
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
        null, // cefrLevel (no language progress in this test)
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
        PROFILE_ID,
        SUBJECT_ID,
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
        ]),
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
        PROFILE_ID,
        SUBJECT_ID,
        expect.arrayContaining([expect.objectContaining({ quality: 5 })]),
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
        PROFILE_ID,
        SUBJECT_ID,
        expect.arrayContaining([expect.objectContaining({ quality: 3 })]),
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
        PROFILE_ID,
        SUBJECT_ID,
        expect.arrayContaining([
          expect.objectContaining({ milestoneId: undefined }),
        ]),
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
        PROFILE_ID,
        SUBJECT_ID,
        expect.arrayContaining([
          expect.objectContaining({ term: 'hola', cefrLevel: 'A2' }),
        ]),
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
        PROFILE_ID,
        SUBJECT_ID,
        expect.arrayContaining([
          expect.objectContaining({ term: 'hola', cefrLevel: 'B1' }),
        ]),
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
        PROFILE_ID,
        SUBJECT_ID,
      );
      // Called at least twice: once for previousLanguageProgress, once for nextLanguageProgress
      const vocabRetentionCalls =
        mockGetCurrentLanguageProgress.mock.calls.filter(
          (call: unknown[]) => call[1] === PROFILE_ID && call[2] === SUBJECT_ID,
        );
      expect(vocabRetentionCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('isolates errors without blocking other steps', async () => {
      setupSubjectMock(fourStrandsSubject);
      mockExtractVocabularyFromTranscript.mockRejectedValueOnce(
        new Error('LLM extraction failed'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
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
        createEventData({ qualityRating: 4 }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'update-vocabulary-retention',
      );
      expect(outcome.status).toBe('ok');
    });
  });

  describe('write-coaching-card step', () => {
    it('creates a pending session summary', async () => {
      await executeSteps(createEventData());

      expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
        expect.anything(), // db
        SESSION_ID,
        PROFILE_ID,
        TOPIC_ID,
        'pending',
      );
    });

    it('precomputes and caches a coaching card', async () => {
      await executeSteps(createEventData());

      expect(mockPrecomputeCoachingCard).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
      );
      expect(mockWriteCoachingCardCache).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        expect.objectContaining({ type: expect.any(String) }),
      );
    });
  });

  describe('update-dashboard step', () => {
    it('calls recordSessionActivity when quality >= 3 (recall pass)', async () => {
      await executeSteps(createEventData({ qualityRating: 3 }));

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        '2026-02-17',
      );
    });

    // [F-044] Sessions with user engagement now count toward streaks.
    // The old gate (completionQualityRating >= 3) was a bug — most close paths
    // never set qualityRating, so streaks were never updated.
    it('calls recordSessionActivity when no qualityRating but user had exchanges (F-044)', async () => {
      await executeSteps(createEventData());

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        '2026-02-17',
      );
    });

    it('calls recordSessionActivity when quality < 3 (user still engaged, F-044)', async () => {
      await executeSteps(createEventData({ qualityRating: 2 }));

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        '2026-02-17',
      );
    });

    it('uses current date when no timestamp provided', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await executeSteps(
        createEventData({ timestamp: undefined, qualityRating: 4 }),
      );

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        today,
      );
    });

    it('still calls insertSessionXpEntry even without qualityRating', async () => {
      await executeSteps(createEventData());

      expect(mockInsertSessionXpEntry).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        TOPIC_ID,
        SUBJECT_ID,
      );
    });

    it('passes null topicId when topicId is undefined', async () => {
      await executeSteps(createEventData({ topicId: undefined }));

      expect(mockInsertSessionXpEntry).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        null,
        SUBJECT_ID,
      );
    });
  });

  describe('generate-embeddings step', () => {
    it('extracts real session content for embedding', async () => {
      await executeSteps(createEventData());

      expect(mockExtractSessionContent).toHaveBeenCalledWith(
        expect.anything(),
        SESSION_ID,
        PROFILE_ID,
      );
    });

    it('calls storeSessionEmbedding with extracted content and API key', async () => {
      await executeSteps(createEventData());

      expect(mockStoreSessionEmbedding).toHaveBeenCalledWith(
        expect.anything(),
        SESSION_ID,
        PROFILE_ID,
        TOPIC_ID,
        'User: What is algebra?\n\nAI: Algebra is...',
        'pa-test-key-123',
      );
    });
  });

  describe('generate-llm-summary step', () => {
    it('stores the llm summary after learner recap generation', async () => {
      await executeSteps(createEventData());

      expect(mockGenerateAndStoreLlmSummary).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sessionId: SESSION_ID,
          profileId: PROFILE_ID,
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          summaryId: 'summary-1',
        }),
      );
    });

    it('emits app/session.summary.generated without inline narrative text', async () => {
      const { mockStep } = (await executeSteps(createEventData())) as any;

      expect(mockStep.sendEvent).toHaveBeenCalledWith(
        'notify-session-summary-generated',
        expect.objectContaining({
          name: 'app/session.summary.generated',
          data: expect.objectContaining({
            profileId: PROFILE_ID,
            sessionId: SESSION_ID,
            sessionSummaryId: 'summary-1',
            topicsCount: 2,
            sessionState: 'completed',
            narrativeLength: expect.any(Number),
          }),
        }),
      );
    });

    it('emits app/session.summary.failed when summary generation returns null', async () => {
      mockGenerateAndStoreLlmSummary.mockResolvedValueOnce(null);

      const { mockStep } = (await executeSteps(createEventData())) as any;

      expect(mockStep.sendEvent).toHaveBeenCalledWith(
        'notify-session-summary-failed',
        expect.objectContaining({
          name: 'app/session.summary.failed',
          data: expect.objectContaining({
            profileId: PROFILE_ID,
            sessionId: SESSION_ID,
            sessionSummaryId: 'summary-1',
          }),
        }),
      );
    });
  });

  describe('extract-homework-summary step', () => {
    it('skips homework extraction for non-homework sessions', async () => {
      const { result } = (await executeSteps(createEventData())) as any;

      expect(mockExtractAndStoreHomeworkSummary).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'extract-homework-summary',
      );
      expect(outcome.status).toBe('skipped');
    });

    it('extracts and stores summary for homework sessions', async () => {
      const { result } = (await executeSteps(
        createEventData({ sessionType: 'homework' }),
      )) as any;

      expect(mockExtractAndStoreHomeworkSummary).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        SESSION_ID,
      );
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'extract-homework-summary',
      );
      expect(outcome.status).toBe('ok');
    });
  });

  describe('process-verification-completion step', () => {
    it('skips when verificationType is not set', async () => {
      const { result } = (await executeSteps(createEventData())) as any;
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
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
        createEventData({ verificationType: 'evaluate' }),
      )) as any;

      expect(mockProcessEvaluateCompletion).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        SESSION_ID,
        TOPIC_ID,
      );
      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
      );
      expect(outcome.status).toBe('ok');
    });

    it('calls processTeachBackCompletion for teach_back sessions (FR138-143)', async () => {
      const { result } = (await executeSteps(
        createEventData({ verificationType: 'teach_back' }),
      )) as any;

      expect(mockProcessTeachBackCompletion).toHaveBeenCalledWith(
        expect.anything(), // db
        PROFILE_ID,
        SESSION_ID,
      );
      expect(mockProcessEvaluateCompletion).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
      );
      expect(outcome.status).toBe('ok');
    });

    it('skips when topicId is null (no topic to assess)', async () => {
      const { result } = (await executeSteps(
        createEventData({ verificationType: 'teach_back', topicId: null }),
      )) as any;

      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
      );
      expect(outcome.status).toBe('skipped');
    });

    it('skips and warns for unknown verificationType (C-05)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ verificationType: 'unknown_future_type' }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
      );
      expect(outcome.status).toBe('skipped');
      expect(mockProcessEvaluateCompletion).not.toHaveBeenCalled();
      expect(mockProcessTeachBackCompletion).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown verificationType'),
      );

      consoleSpy.mockRestore();
    });

    it('skips silently when verificationType is null (C-05)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ verificationType: null }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
      );
      expect(outcome.status).toBe('skipped');
      // null is expected — no "Unknown verificationType" warning should be logged
      const verificationWarnings = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes('Unknown verificationType'),
      );
      expect(verificationWarnings).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it('isolates errors without blocking other steps', async () => {
      mockProcessTeachBackCompletion.mockRejectedValueOnce(
        new Error('Assessment parse error'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ verificationType: 'teach_back', qualityRating: 4 }),
      )) as any;

      const outcome = result.outcomes.find(
        (o: any) => o.step === 'process-verification-completion',
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
        createEventData({ qualityRating: 4 }),
      )) as any;

      expect(mockAnalyzeSessionTranscript).not.toHaveBeenCalled();
      expect(mockApplyAnalysis).not.toHaveBeenCalled();
      // Step still runs and completes ok — the early return is success.
      const outcome = result.outcomes.find(
        (o: any) => o.step === 'analyze-learner-profile',
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
        PROFILE_ID,
        expect.objectContaining({ interests: ['space'] }),
        null,
        'inferred',
        SUBJECT_ID,
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
        PROFILE_ID,
      );
      expect(mockResetSummarySkips).not.toHaveBeenCalled();
    });

    it('resets skip count when summaryStatus is submitted', async () => {
      await executeSteps(createEventData({ summaryStatus: 'submitted' }));

      expect(mockResetSummarySkips).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
      );
      expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
    });

    it('resets skip count when summaryStatus is accepted', async () => {
      await executeSteps(createEventData({ summaryStatus: 'accepted' }));

      expect(mockResetSummarySkips).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
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
        createEventData({ qualityRating: 4 }),
      )) as any;
      const embeddingOutcome1 = result1.outcomes.find(
        (o: any) => o.step === 'generate-embeddings',
      );
      expect(embeddingOutcome1.status).toBe('failed');

      // Second invocation (simulating Inngest retry) — embedding step succeeds
      const { result: result2 } = (await executeSteps(
        createEventData({ qualityRating: 4 }),
      )) as any;
      const embeddingOutcome2 = result2.outcomes.find(
        (o: any) => o.step === 'generate-embeddings',
      );
      expect(embeddingOutcome2.status).toBe('ok');

      consoleSpy.mockRestore();
    });

    it('[FIX-INNGEST-1] update-retention is critical: first call throws so Inngest retries', async () => {
      mockUpdateRetentionFromSession.mockRejectedValueOnce(
        new Error('DB connection reset'),
      );
      await expect(
        executeSteps(createEventData({ qualityRating: 4 })),
      ).rejects.toThrow('DB connection reset');
      mockUpdateRetentionFromSession.mockResolvedValueOnce(undefined);
      const { result: result2 } = (await executeSteps(
        createEventData({ qualityRating: 4 }),
      )) as any;
      const retentionOutcome2 = result2.outcomes.find(
        (o: any) => o.step === 'update-retention',
      );
      expect(retentionOutcome2.status).toBe('ok');
    });

    it('[FIX-INNGEST-1] soft step failures include structured extra.step and extra.surface tags', async () => {
      mockPrecomputeCoachingCard.mockRejectedValueOnce(
        new Error('Redis timeout'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Redis timeout' }),
        expect.objectContaining({
          profileId: PROFILE_ID,
          extra: expect.objectContaining({
            step: 'write-coaching-card',
            surface: 'session-completed',
          }),
        }),
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
        new Error('Voyage AI rate limit'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ summaryStatus: 'skipped', qualityRating: 4 }),
      )) as any;

      // Embedding failed, but other steps ran
      expect(mockUpdateRetentionFromSession).toHaveBeenCalled();
      expect(mockPrecomputeCoachingCard).toHaveBeenCalled();
      expect(mockRecordSessionActivity).toHaveBeenCalled();
      expect(mockIncrementSummarySkips).toHaveBeenCalled();

      // Sentry captured the error
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ profileId: PROFILE_ID }),
      );

      // Status reflects partial failure
      expect(result.status).toBe('completed-with-errors');
      const embeddingOutcome = result.outcomes.find(
        (o: any) => o.step === 'generate-embeddings',
      );
      expect(embeddingOutcome.status).toBe('failed');
      expect(embeddingOutcome.error).toContain('Voyage AI rate limit');

      consoleSpy.mockRestore();
    });

    it('continues chain when coaching card step fails', async () => {
      mockPrecomputeCoachingCard.mockRejectedValueOnce(
        new Error('DB connection timeout'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 }),
      )) as any;

      // Steps after coaching card still ran
      expect(mockRecordSessionActivity).toHaveBeenCalled();
      expect(mockStoreSessionEmbedding).toHaveBeenCalled();

      expect(result.status).toBe('completed-with-errors');
      const cardOutcome = result.outcomes.find(
        (o: any) => o.step === 'write-coaching-card',
      );
      expect(cardOutcome.status).toBe('failed');

      consoleSpy.mockRestore();
    });

    it('[FIX-INNGEST-1] retention step failure throws — stops pipeline (critical step)', async () => {
      mockUpdateRetentionFromSession.mockRejectedValueOnce(
        new Error('SM-2 calculation error'),
      );

      await expect(
        executeSteps(createEventData({ qualityRating: 4 })),
      ).rejects.toThrow('SM-2 calculation error');

      // No downstream steps ran — DB error stopped the pipeline
      expect(mockPrecomputeCoachingCard).not.toHaveBeenCalled();
      expect(mockRecordSessionActivity).not.toHaveBeenCalled();
      expect(mockStoreSessionEmbedding).not.toHaveBeenCalled();
    });

    it('reports multiple soft-step failures independently', async () => {
      mockPrecomputeCoachingCard.mockRejectedValueOnce(new Error('Card fail'));
      mockStoreSessionEmbedding.mockRejectedValueOnce(new Error('Voyage fail'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 }),
      )) as any;

      const failed = result.outcomes.filter((o: any) => o.status === 'failed');
      expect(failed).toHaveLength(2);
      expect(failed.map((f: any) => f.step)).toEqual(
        expect.arrayContaining(['write-coaching-card', 'generate-embeddings']),
      );

      expect(mockCaptureException).toHaveBeenCalledTimes(2);
      expect(mockUpdateRetentionFromSession).toHaveBeenCalled();
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
        PROFILE_ID,
        'comet',
        'streak_7',
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
        PROFILE_ID,
        'orions_belt',
        'streak_30',
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
        'streak_7',
      );
      expect(mockQueueCelebration).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'streak_30',
      );
    });

    it('does not queue streak celebrations when quality < 3 (no streak update)', async () => {
      await executeSteps(createEventData({ qualityRating: 2 }));

      expect(mockQueueCelebration).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'streak_7',
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
        },
      );
    });

    it('runs re-read-session step when topicId is null', async () => {
      // Sequence: first findFirst call is from re-read-session (returns backfilled topicId),
      // second call is from analyze-learner-profile (returns rawInput only).
      mockSessionCompletedDb.query.learningSessions.findFirst
        .mockResolvedValueOnce({ rawInput: null, topicId: 'topic-from-db' })
        .mockResolvedValueOnce({ rawInput: null, topicId: null });

      const { mockStep } = (await executeSteps(
        createEventData({ topicId: null, qualityRating: 4 }),
      )) as any;

      // re-read-session step must have been invoked
      expect(mockStep.run).toHaveBeenCalledWith(
        're-read-session',
        expect.any(Function),
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
        SESSION_ID,
        PROFILE_ID,
        'topic-from-db',
        'pending',
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
        SESSION_ID,
        PROFILE_ID,
        null,
        'pending',
      );
    });

    it('keeps topicId null when re-read row has no topicId', async () => {
      mockSessionCompletedDb.query.learningSessions.findFirst
        .mockResolvedValueOnce({ rawInput: null, topicId: null })
        .mockResolvedValueOnce({ rawInput: null, topicId: null });

      await executeSteps(createEventData({ topicId: null, qualityRating: 4 }));

      expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
        expect.anything(),
        SESSION_ID,
        PROFILE_ID,
        null,
        'pending',
      );
    });

    it('skips re-read-session step when topicId is already set', async () => {
      const { mockStep } = (await executeSteps(
        createEventData({ topicId: TOPIC_ID }),
      )) as any;

      // re-read-session must NOT be called when topicId is already known
      const reReadCall = (mockStep.run as jest.Mock).mock.calls.find(
        ([name]: [string]) => name === 're-read-session',
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
        PROFILE_ID,
        expect.any(Object),
        null, // subjectName (null when DB lookup returns no name)
        'inferred',
        SUBJECT_ID, // subjectId threaded from event data
      );
    });
  });
  // ---------------------------------------------------------------------------
  // [FIX-INNGEST-1] Critical vs soft step break tests
  // Proves that runCritical steps throw (Inngest retries) while runIsolated
  // steps absorb errors (pipeline continues). These tests are the "break tests"
  // required by CLAUDE.md for every security/correctness fix.
  // ---------------------------------------------------------------------------

  describe('[FIX-INNGEST-1] critical step break tests', () => {
    it('update-dashboard throws on recordSessionActivity failure (critical)', async () => {
      // update-dashboard has no try/catch — DB errors must propagate to Inngest.
      // Silently absorbing would mean XP or streak is permanently lost.
      mockRecordSessionActivity.mockRejectedValueOnce(
        new Error('Streak DB write failed'),
      );

      await expect(
        executeSteps(createEventData({ qualityRating: 4 })),
      ).rejects.toThrow('Streak DB write failed');
    });

    it('update-dashboard throws on insertSessionXpEntry failure (critical)', async () => {
      mockInsertSessionXpEntry.mockRejectedValueOnce(
        new Error('XP insert constraint violation'),
      );

      await expect(
        executeSteps(createEventData({ qualityRating: 4 })),
      ).rejects.toThrow('XP insert constraint violation');
    });

    it('soft steps (generate-embeddings, write-coaching-card) do NOT throw (runIsolated)', async () => {
      // Verifies the two-tier isolation: soft steps return { status: 'failed' }
      // instead of throwing, so the overall function still resolves.
      mockStoreSessionEmbedding.mockRejectedValueOnce(
        new Error('Voyage rate limit'),
      );
      mockPrecomputeCoachingCard.mockRejectedValueOnce(
        new Error('Card LLM error'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Must NOT throw
      const { result } = (await executeSteps(
        createEventData({ qualityRating: 4 }),
      )) as any;

      expect(result.status).toBe('completed-with-errors');
      const embeddingOutcome = result.outcomes.find(
        (o: any) => o.step === 'generate-embeddings',
      );
      const cardOutcome = result.outcomes.find(
        (o: any) => o.step === 'write-coaching-card',
      );
      expect(embeddingOutcome.status).toBe('failed');
      expect(cardOutcome.status).toBe('failed');

      consoleSpy.mockRestore();
    });

    it('dispatches app/session.completed_with_errors event when soft steps fail', async () => {
      // [FIX-INNGEST-1] Soft-step failures must emit a queryable Inngest event
      // so on-call can page on volume spikes without Sentry access.
      mockStoreSessionEmbedding.mockRejectedValueOnce(
        new Error('Voyage error'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockStep = {
        run: jest.fn(async (name: string, fn: () => Promise<unknown>) => fn()),
        sendEvent: jest.fn().mockResolvedValue(undefined),
        sleep: jest.fn(),
        waitForEvent: jest.fn().mockResolvedValue(null),
      };

      const handler = (sessionCompleted as any).fn;
      await handler({
        event: {
          data: createEventData({ qualityRating: 4 }),
          name: 'app/session.completed',
        },
        step: mockStep,
      });

      expect(mockStep.sendEvent).toHaveBeenCalledWith(
        'session-completed-with-errors',
        expect.objectContaining({
          name: 'app/session.completed_with_errors',
          data: expect.objectContaining({
            sessionId: SESSION_ID,
            profileId: PROFILE_ID,
            failedSteps: expect.arrayContaining([
              expect.objectContaining({ step: 'generate-embeddings' }),
            ]),
          }),
        }),
      );

      consoleSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// [I3] embedNewFactsForProfile — idempotent UPDATE guard
//
// Finding: if two concurrent session-completed runs overlap, both pay the
// Voyage cost and the second writer's UPDATE would overwrite the first.
// Fix: the UPDATE WHERE clause includes `isNull(memoryFacts.embedding)` so
// a row that was already embedded by a concurrent run is a no-op.
//
// These tests verify:
// 1. The UPDATE WHERE condition includes an IS NULL check on the embedding
//    column, preventing double-writes in concurrent runs.
// 2. When SELECT returns no rows (all already embedded — filtered by the
//    SELECT-level isNull guard), the embedder is never called.
// ---------------------------------------------------------------------------

describe('embedNewFactsForProfile', () => {
  const PROFILE_ID_EMB = '00000000-0000-4000-8000-000000000099';

  it('[I3] UPDATE WHERE includes isNull(embedding) — prevents double-write on concurrent runs', async () => {
    // Simulate SELECT returning one unembedded row.
    const fakeRow = {
      id: 'fact-abc',
      text: 'Likes maths',
      category: 'preference',
    };

    // Capture the WHERE condition passed to update().set().where() so we can
    // verify it contains the IS NULL guard.
    const capturedWhereArg: unknown[] = [];
    const mockUpdate = {
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation((cond: unknown) => {
          capturedWhereArg.push(cond);
          return Promise.resolve();
        }),
      }),
    };

    const mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([fakeRow]),
            }),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue(mockUpdate),
    } as unknown as Database;

    const mockEmbedder = jest
      .fn()
      .mockResolvedValue({ ok: true, vector: [0.1, 0.2, 0.3] });

    const result = await embedNewFactsForProfile(
      mockDb,
      PROFILE_ID_EMB,
      mockEmbedder,
    );

    // Embedder was called once for the unembedded row.
    expect(mockEmbedder).toHaveBeenCalledTimes(1);
    expect(result.embedded).toBe(1);
    expect(result.failed).toBe(0);

    // The WHERE condition must have been captured — no missing guard.
    expect(capturedWhereArg).toHaveLength(1);

    // Verify the WHERE condition serialises to SQL that contains IS NULL.
    // This proves the idempotency guard: a concurrent second writer whose UPDATE
    // fires after the first has already set embedding will be a no-op (0 rows
    // matched) rather than overwriting the vector.
    //
    // PgDialect.sqlToQuery converts the drizzle condition to a SQL string with
    // positional params, e.g. "($1 = $2 and $3 = $4 and $5 is null)".
    const dialect = new PgDialect();
    const whereCondition = capturedWhereArg[0] as {
      getSQL: () => import('drizzle-orm').SQL;
    };
    expect(typeof whereCondition?.getSQL).toBe('function');

    const { sql: sqlString } = dialect.sqlToQuery(whereCondition.getSQL());
    // The IS NULL guard must appear — if it were absent, a concurrent second
    // writer would overwrite an already-set embedding vector.
    expect(sqlString).toMatch(/\bis null\)?$/i);
    expect(sqlString.match(/\bis null/gi)).toHaveLength(1);
  });

  it('[I3] embedder is not called when all rows already have embeddings (SELECT isNull filter)', async () => {
    // When SELECT WHERE embedding IS NULL returns no rows, the embedder must not fire.
    const mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
      update: jest.fn(),
    } as unknown as Database;

    const mockEmbedder = jest.fn();

    const result = await embedNewFactsForProfile(
      mockDb,
      PROFILE_ID_EMB,
      mockEmbedder,
    );

    expect(mockEmbedder).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(result.embedded).toBe(0);
    expect(result.scanned).toBe(0);
  });
});
