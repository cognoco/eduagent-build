// ---------------------------------------------------------------------------
// Session Completed — Tests
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
}));

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

const mockIncrementSummarySkips = jest.fn().mockResolvedValue(1);
const mockResetSummarySkips = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/settings', () => ({
  incrementSummarySkips: (...args: unknown[]) =>
    mockIncrementSummarySkips(...args),
  resetSummarySkips: (...args: unknown[]) => mockResetSummarySkips(...args),
}));

const mockCaptureException = jest.fn();

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { sessionCompleted } from './session-completed';

// ---------------------------------------------------------------------------
// Helpers — extract Inngest step handlers from the function
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
    escalationRungs: [1, 2],
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
      'update-retention',
      'update-needs-deepening',
      'write-coaching-card',
      'update-dashboard',
      'generate-embeddings',
      'track-summary-skips',
    ]);
  });

  it('marks all steps as ok on success', async () => {
    const { result } = (await executeSteps(createEventData())) as any;
    const statuses = result.outcomes
      .filter((o: any) => o.status !== 'skipped')
      .map((o: any) => o.status);
    expect(statuses).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  });

  describe('update-retention step', () => {
    it('calls updateRetentionFromSession with correct args', async () => {
      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        'topic-001',
        4
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

    it('defaults qualityRating to 3 when not provided', async () => {
      await executeSteps(createEventData());

      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-001',
        3
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

    it('defaults qualityRating to 3 when not provided', async () => {
      await executeSteps(createEventData());

      expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        'topic-001',
        3
      );
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
    it('calls recordSessionActivity with correct date', async () => {
      await executeSteps(createEventData());

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(), // db
        'profile-001',
        '2026-02-17'
      );
    });

    it('uses current date when no timestamp provided', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await executeSteps(createEventData({ timestamp: undefined }));

      expect(mockRecordSessionActivity).toHaveBeenCalledWith(
        expect.anything(),
        'profile-001',
        today
      );
    });

    it('calls insertSessionXpEntry with correct args', async () => {
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
  // Error isolation — one failing step must not block others
  // -------------------------------------------------------------------------

  describe('error isolation', () => {
    it('continues chain when embedding step fails', async () => {
      mockStoreSessionEmbedding.mockRejectedValueOnce(
        new Error('Voyage AI rate limit')
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = (await executeSteps(
        createEventData({ summaryStatus: 'skipped' })
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

      const { result } = (await executeSteps(createEventData())) as any;

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

      const { result } = (await executeSteps(createEventData())) as any;

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

      const { result } = (await executeSteps(createEventData())) as any;

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
});
