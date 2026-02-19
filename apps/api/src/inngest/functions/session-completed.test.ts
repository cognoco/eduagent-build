// ---------------------------------------------------------------------------
// Session Completed — Tests
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn(() => ({})),
}));

const mockStoreSessionEmbedding = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/embeddings', () => ({
  storeSessionEmbedding: (...args: unknown[]) =>
    mockStoreSessionEmbedding(...args),
}));

const mockUpdateRetentionFromSession = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/retention-data', () => ({
  updateRetentionFromSession: (...args: unknown[]) =>
    mockUpdateRetentionFromSession(...args),
}));

const mockCreatePendingSessionSummary = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/summaries', () => ({
  createPendingSessionSummary: (...args: unknown[]) =>
    mockCreatePendingSessionSummary(...args),
}));

const mockRecordSessionActivity = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/streaks', () => ({
  recordSessionActivity: (...args: unknown[]) =>
    mockRecordSessionActivity(...args),
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
      await executeSteps(createEventData({ topicId: null }));

      expect(mockUpdateRetentionFromSession).not.toHaveBeenCalled();
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
  });

  describe('generate-embeddings step', () => {
    it('calls storeSessionEmbedding with session data', async () => {
      await executeSteps(createEventData());

      expect(mockStoreSessionEmbedding).toHaveBeenCalledWith(
        expect.anything(), // db
        'session-001',
        'profile-001',
        'topic-001',
        expect.stringContaining('session-001')
      );
    });
  });
});
