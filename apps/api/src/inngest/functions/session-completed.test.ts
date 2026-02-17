import { sessionCompleted } from './session-completed';

// ---------------------------------------------------------------------------
// Mock setup — database, retention package, streaks service
// ---------------------------------------------------------------------------

const mockFindFirstRetentionCard = jest.fn();
const mockFindFirstStreak = jest.fn();
const mockDbUpdate = jest.fn().mockReturnValue({
  set: jest
    .fn()
    .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
});
const mockDbInsert = jest.fn().mockReturnValue({
  values: jest.fn().mockResolvedValue(undefined),
});

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({
    update: mockDbUpdate,
    insert: mockDbInsert,
    execute: jest.fn(),
  })),
  createScopedRepository: jest.fn(() => ({
    retentionCards: { findFirst: mockFindFirstRetentionCard },
    streaks: { findFirst: mockFindFirstStreak },
  })),
  retentionCards: { topicId: 'topicId', id: 'id', profileId: 'profileId' },
  streaks: { id: 'id', profileId: 'profileId' },
  sessionSummaries: {},
  storeEmbedding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@eduagent/retention', () => ({
  sm2: jest.fn(() => ({
    card: {
      easeFactor: 2.6,
      interval: 6,
      repetitions: 2,
      lastReviewedAt: '2026-02-17T00:00:00.000Z',
      nextReviewAt: '2026-02-23T00:00:00.000Z',
    },
    wasSuccessful: true,
  })),
}));

jest.mock('../../services/streaks', () => ({
  recordDailyActivity: jest.fn(() => ({
    newState: {
      currentStreak: 5,
      longestStreak: 10,
      lastActivityDate: '2026-02-17',
      gracePeriodStartDate: null,
    },
    streakBroken: false,
  })),
}));

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
    mockFindFirstRetentionCard.mockResolvedValue(null);
    mockFindFirstStreak.mockResolvedValue(null);
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
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

  it('should return completed status with sessionId', async () => {
    const { result } = await executeSteps(createEventData());
    expect(result).toEqual({ status: 'completed', sessionId: 'session-001' });
  });

  describe('update-retention step', () => {
    it('calls sm2 and updates retention card when card exists', async () => {
      const { sm2 } = jest.requireMock('@eduagent/retention');
      mockFindFirstRetentionCard.mockResolvedValue({
        id: 'card-001',
        easeFactor: '2.50',
        intervalDays: 1,
        repetitions: 1,
        lastReviewedAt: new Date('2026-02-16T00:00:00Z'),
        nextReviewAt: new Date('2026-02-17T00:00:00Z'),
      });

      await executeSteps(createEventData({ qualityRating: 4 }));

      expect(sm2).toHaveBeenCalledWith({
        quality: 4,
        card: {
          easeFactor: 2.5,
          interval: 1,
          repetitions: 1,
          lastReviewedAt: '2026-02-16T00:00:00.000Z',
          nextReviewAt: '2026-02-17T00:00:00.000Z',
        },
      });
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('skips update when no retention card exists', async () => {
      const { sm2 } = jest.requireMock('@eduagent/retention');
      mockFindFirstRetentionCard.mockResolvedValue(null);

      await executeSteps(createEventData());

      expect(sm2).not.toHaveBeenCalled();
    });

    it('defaults qualityRating to 3 when not provided', async () => {
      const { sm2 } = jest.requireMock('@eduagent/retention');
      mockFindFirstRetentionCard.mockResolvedValue({
        id: 'card-001',
        easeFactor: '2.50',
        intervalDays: 1,
        repetitions: 0,
        lastReviewedAt: null,
        nextReviewAt: null,
      });

      await executeSteps(createEventData());

      expect(sm2).toHaveBeenCalledWith(expect.objectContaining({ quality: 3 }));
    });
  });

  describe('write-coaching-card step', () => {
    it('inserts a session summary row', async () => {
      await executeSteps(createEventData());

      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('update-dashboard step', () => {
    it('calls recordDailyActivity when streak exists', async () => {
      const { recordDailyActivity } = jest.requireMock(
        '../../services/streaks'
      );
      mockFindFirstStreak.mockResolvedValue({
        id: 'streak-001',
        currentStreak: 4,
        longestStreak: 10,
        lastActivityDate: '2026-02-16',
        gracePeriodStartDate: null,
      });

      await executeSteps(createEventData());

      expect(recordDailyActivity).toHaveBeenCalledWith(
        {
          currentStreak: 4,
          longestStreak: 10,
          lastActivityDate: '2026-02-16',
          gracePeriodStartDate: null,
        },
        '2026-02-17'
      );
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('does not update streaks when no streak row exists', async () => {
      const { recordDailyActivity } = jest.requireMock(
        '../../services/streaks'
      );
      mockFindFirstStreak.mockResolvedValue(null);

      await executeSteps(createEventData());

      expect(recordDailyActivity).not.toHaveBeenCalled();
    });
  });

  describe('generate-embeddings step', () => {
    it('calls storeEmbedding with session data', async () => {
      const { storeEmbedding } = jest.requireMock('@eduagent/database');

      await executeSteps(createEventData());

      expect(storeEmbedding).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sessionId: 'session-001',
          profileId: 'profile-001',
          topicId: 'topic-001',
          content: expect.stringContaining('session-001'),
          embedding: expect.arrayContaining([0]),
        })
      );
    });
  });
});
