/**
 * Integration: Session-Completed Chain (P0-008)
 *
 * Tests the Inngest session-completed function end-to-end by directly
 * invoking the handler with a mock step runner. Validates:
 *
 * 1. Happy path: all 6 steps execute and return correct outcomes
 * 2. Error isolation: one step failing does not block others
 * 3. Skip logic: no topicId → retention/deepening steps skip
 * 4. Summary tracking: skipped → increment, submitted → reset
 * 5. FR92 interleaved topics: interleavedTopicIds updates all topics
 * 6. Return value structure (status, sessionId, outcomes)
 *
 * This complements the co-located unit test with cross-cutting chain
 * validation from the integration test suite.
 */

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
}));

const mockUpdateRetentionFromSession = jest.fn().mockResolvedValue(undefined);
const mockUpdateNeedsDeepeningProgress = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/retention-data', () => ({
  updateRetentionFromSession: (...args: unknown[]) =>
    mockUpdateRetentionFromSession(...args),
  updateNeedsDeepeningProgress: (...args: unknown[]) =>
    mockUpdateNeedsDeepeningProgress(...args),
}));

const mockCreatePendingSessionSummary = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/summaries', () => ({
  createPendingSessionSummary: (...args: unknown[]) =>
    mockCreatePendingSessionSummary(...args),
}));

const mockPrecomputeCoachingCard = jest.fn().mockResolvedValue({
  id: 'card-1',
  profileId: 'profile-001',
  type: 'challenge',
  title: 'Keep going!',
  body: 'Continue learning.',
  priority: 3,
  expiresAt: '2026-02-24T10:00:00.000Z',
  createdAt: '2026-02-23T10:00:00.000Z',
});
const mockWriteCoachingCardCache = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/coaching-cards', () => ({
  precomputeCoachingCard: (...args: unknown[]) =>
    mockPrecomputeCoachingCard(...args),
  writeCoachingCardCache: (...args: unknown[]) =>
    mockWriteCoachingCardCache(...args),
}));

const mockRecordSessionActivity = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/streaks', () => ({
  recordSessionActivity: (...args: unknown[]) =>
    mockRecordSessionActivity(...args),
}));

const mockInsertSessionXpEntry = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/xp', () => ({
  insertSessionXpEntry: (...args: unknown[]) =>
    mockInsertSessionXpEntry(...args),
}));

const mockExtractSessionContent = jest
  .fn()
  .mockResolvedValue(
    'User: What is photosynthesis?\n\nAI: Photosynthesis is...'
  );
const mockStoreSessionEmbedding = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/embeddings', () => ({
  extractSessionContent: (...args: unknown[]) =>
    mockExtractSessionContent(...args),
  storeSessionEmbedding: (...args: unknown[]) =>
    mockStoreSessionEmbedding(...args),
}));

const mockIncrementSummarySkips = jest.fn().mockResolvedValue(1);
const mockResetSummarySkips = jest.fn().mockResolvedValue(undefined);

jest.mock('../../apps/api/src/services/settings', () => ({
  incrementSummarySkips: (...args: unknown[]) =>
    mockIncrementSummarySkips(...args),
  resetSummarySkips: (...args: unknown[]) => mockResetSummarySkips(...args),
}));

const mockCaptureException = jest.fn();

jest.mock('../../apps/api/src/services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Inngest client mock — needs createFunction to return a function with .fn
jest.mock('../../apps/api/src/inngest/client', () => {
  const { Inngest } = require('inngest');
  return {
    inngest: new Inngest({ id: 'test' }),
  };
});

import { sessionCompleted } from '../../apps/api/src/inngest/functions/session-completed';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface StepOutcome {
  step: string;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
}

interface ChainResult {
  status: 'completed' | 'completed-with-errors';
  sessionId: string;
  outcomes: StepOutcome[];
}

async function executeChain(
  eventData: Record<string, unknown>
): Promise<ChainResult> {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn(),
  };

  const handler = (sessionCompleted as any).fn;
  return handler({
    event: { data: eventData, name: 'app/session.completed' },
    step: mockStep,
  });
}

function createEventData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    profileId: 'profile-int-001',
    sessionId: 'session-int-001',
    topicId: 'topic-int-001',
    subjectId: 'subject-int-001',
    summaryStatus: 'pending',
    timestamp: '2026-02-23T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Session-Completed Chain (P0-008)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
    process.env['VOYAGE_API_KEY'] = 'pa-test-key-123';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
    delete process.env['VOYAGE_API_KEY'];
  });

  // -----------------------------------------------------------------------
  // Happy path — all 7 steps execute successfully
  // -----------------------------------------------------------------------

  it('executes all 7 steps and returns completed status', async () => {
    const result = await executeChain(createEventData());

    expect(result.status).toBe('completed');
    expect(result.sessionId).toBe('session-int-001');
    expect(result.outcomes).toHaveLength(7);

    const stepNames = result.outcomes.map((o) => o.step);
    expect(stepNames).toEqual([
      'update-retention',
      'update-needs-deepening',
      'process-verification-completion',
      'write-coaching-card',
      'update-dashboard',
      'generate-embeddings',
      'track-summary-skips',
    ]);

    // All steps should be 'ok' or 'skipped' (verification skipped when no verificationType)
    for (const outcome of result.outcomes) {
      expect(['ok', 'skipped']).toContain(outcome.status);
    }
  });

  it('calls retention service with correct profileId and topicId', async () => {
    await executeChain(createEventData({ qualityRating: 4 }));

    expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
      expect.anything(), // db
      'profile-int-001',
      'topic-int-001',
      4, // qualityRating
      '2026-02-23T10:00:00.000Z' // timestamp
    );
  });

  it('defaults qualityRating to 3 when not provided', async () => {
    await executeChain(createEventData({ qualityRating: undefined }));

    expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001',
      'topic-int-001',
      3, // default qualityRating
      '2026-02-23T10:00:00.000Z' // timestamp
    );
  });

  it('calls coaching card precompute and cache', async () => {
    await executeChain(createEventData());

    expect(mockCreatePendingSessionSummary).toHaveBeenCalledWith(
      expect.anything(), // db
      'session-int-001',
      'profile-int-001',
      'topic-int-001',
      'pending'
    );

    expect(mockPrecomputeCoachingCard).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001'
    );

    expect(mockWriteCoachingCardCache).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001',
      expect.objectContaining({ type: 'challenge' })
    );
  });

  it('calls streak and XP services in update-dashboard step', async () => {
    await executeChain(createEventData());

    expect(mockRecordSessionActivity).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001',
      '2026-02-23' // date portion of timestamp
    );

    expect(mockInsertSessionXpEntry).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001',
      'topic-int-001',
      'subject-int-001'
    );
  });

  it('calls embedding services in generate-embeddings step', async () => {
    await executeChain(createEventData());

    expect(mockExtractSessionContent).toHaveBeenCalledWith(
      expect.anything(),
      'session-int-001',
      'profile-int-001'
    );

    expect(mockStoreSessionEmbedding).toHaveBeenCalledWith(
      expect.anything(),
      'session-int-001',
      'profile-int-001',
      'topic-int-001',
      expect.stringContaining('photosynthesis'), // extracted content
      'pa-test-key-123' // Voyage API key
    );
  });

  // -----------------------------------------------------------------------
  // Skip logic — no topicId → retention/deepening steps skip
  // -----------------------------------------------------------------------

  it('skips retention and deepening steps when topicId is absent', async () => {
    const result = await executeChain(createEventData({ topicId: undefined }));

    expect(result.status).toBe('completed');

    const retentionOutcome = result.outcomes.find(
      (o) => o.step === 'update-retention'
    );
    const deepeningOutcome = result.outcomes.find(
      (o) => o.step === 'update-needs-deepening'
    );

    expect(retentionOutcome?.status).toBe('skipped');
    expect(deepeningOutcome?.status).toBe('skipped');

    // Service functions should NOT have been called
    expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
    expect(mockUpdateNeedsDeepeningProgress).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error isolation — one step failing does NOT block others
  // -----------------------------------------------------------------------

  it('continues chain when one step fails (error isolation)', async () => {
    // Make embedding step throw
    mockExtractSessionContent.mockRejectedValueOnce(
      new Error('Voyage AI unavailable')
    );

    const result = await executeChain(createEventData());

    expect(result.status).toBe('completed-with-errors');

    const embeddingOutcome = result.outcomes.find(
      (o) => o.step === 'generate-embeddings'
    );
    expect(embeddingOutcome?.status).toBe('failed');
    expect(embeddingOutcome?.error).toContain('Voyage AI unavailable');

    // Other steps should still be 'ok' or 'skipped'
    const otherSteps = result.outcomes.filter(
      (o) => o.step !== 'generate-embeddings'
    );
    for (const step of otherSteps) {
      expect(['ok', 'skipped']).toContain(step.status);
    }

    // Sentry should have captured the error
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Voyage AI unavailable' }),
      expect.objectContaining({ profileId: 'profile-int-001' })
    );
  });

  // -----------------------------------------------------------------------
  // Summary tracking — skipped vs submitted
  // -----------------------------------------------------------------------

  it('increments summary skips when summaryStatus is skipped', async () => {
    await executeChain(createEventData({ summaryStatus: 'skipped' }));

    expect(mockIncrementSummarySkips).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001'
    );
    expect(mockResetSummarySkips).not.toHaveBeenCalled();
  });

  it('resets summary skips when summaryStatus is submitted', async () => {
    await executeChain(createEventData({ summaryStatus: 'submitted' }));

    expect(mockResetSummarySkips).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001'
    );
    expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
  });

  it('resets summary skips when summaryStatus is accepted', async () => {
    await executeChain(createEventData({ summaryStatus: 'accepted' }));

    expect(mockResetSummarySkips).toHaveBeenCalledWith(
      expect.anything(),
      'profile-int-001'
    );
    expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
  });

  it('does not call skip/reset when summaryStatus is pending', async () => {
    await executeChain(createEventData({ summaryStatus: 'pending' }));

    expect(mockIncrementSummarySkips).not.toHaveBeenCalled();
    expect(mockResetSummarySkips).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // FR92 — interleaved topic IDs
  // -----------------------------------------------------------------------

  it('updates retention for all interleaved topic IDs (FR92)', async () => {
    const interleavedTopicIds = ['topic-a', 'topic-b', 'topic-c'];

    await executeChain(
      createEventData({
        interleavedTopicIds,
        topicId: 'topic-int-001', // ignored when interleavedTopicIds present
      })
    );

    // Should call retention for each topic
    expect(mockUpdateRetentionFromSession).toHaveBeenCalledTimes(3);
    expect(mockUpdateNeedsDeepeningProgress).toHaveBeenCalledTimes(3);

    for (const tid of interleavedTopicIds) {
      expect(mockUpdateRetentionFromSession).toHaveBeenCalledWith(
        expect.anything(),
        'profile-int-001',
        tid,
        3, // default quality
        '2026-02-23T10:00:00.000Z' // timestamp
      );
    }
  });
});
