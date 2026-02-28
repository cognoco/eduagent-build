// ---------------------------------------------------------------------------
// EVALUATE Data Service — Tests (FR128-133)
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

jest.mock('./evaluate', () => ({
  shouldTriggerEvaluate: jest.fn(),
  handleEvaluateFailure: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import { createScopedRepository } from '@eduagent/database';
import {
  checkEvaluateEligibility,
  advanceEvaluateRung,
  processEvaluateFailureEscalation,
  getEvaluateSessionState,
} from './evaluate-data';
import { shouldTriggerEvaluate, handleEvaluateFailure } from './evaluate';

const profileId = 'profile-001';
const topicId = 'topic-001';
const sessionId = 'session-001';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDb(overrides?: {
  queryResults?: Record<string, unknown>;
}): Database {
  const updateSetWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateSetWhere });
  const updateMock = jest.fn().mockReturnValue({ set: updateSet });

  return {
    query: {
      retentionCards: {
        findFirst: jest
          .fn()
          .mockResolvedValue(overrides?.queryResults?.retentionCard ?? null),
      },
      curriculumTopics: {
        findFirst: jest
          .fn()
          .mockResolvedValue(overrides?.queryResults?.topic ?? null),
      },
    },
    update: updateMock,
  } as unknown as Database;
}

function createMockRepo(overrides?: {
  retentionCard?: unknown;
  session?: unknown;
}): void {
  (createScopedRepository as jest.Mock).mockReturnValue({
    retentionCards: {
      findFirst: jest.fn().mockResolvedValue(overrides?.retentionCard ?? null),
    },
    sessions: {
      findFirst: jest.fn().mockResolvedValue(overrides?.session ?? null),
    },
  });
}

// ---------------------------------------------------------------------------
// checkEvaluateEligibility
// ---------------------------------------------------------------------------

describe('checkEvaluateEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not eligible when no retention card exists', async () => {
    createMockRepo({ retentionCard: null });
    const db = createMockDb({
      queryResults: { topic: { id: topicId, title: 'Photosynthesis' } },
    });

    const result = await checkEvaluateEligibility(db, profileId, topicId);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No retention card');
    expect(result.topicTitle).toBe('Photosynthesis');
  });

  it('returns eligible when retention is strong', async () => {
    const card = {
      topicId,
      profileId,
      easeFactor: '2.70',
      repetitions: 3,
      evaluateDifficultyRung: 2,
    };
    createMockRepo({ retentionCard: card });
    (shouldTriggerEvaluate as jest.Mock).mockReturnValue(true);
    const db = createMockDb({
      queryResults: { topic: { id: topicId, title: 'Photosynthesis' } },
    });

    const result = await checkEvaluateEligibility(db, profileId, topicId);

    expect(result.eligible).toBe(true);
    expect(result.currentRung).toBe(2);
    expect(result.easeFactor).toBe(2.7);
    expect(result.repetitions).toBe(3);
    expect(result.reason).toBeUndefined();
  });

  it('returns not eligible when ease factor below threshold', async () => {
    const card = {
      topicId,
      profileId,
      easeFactor: '2.20',
      repetitions: 5,
      evaluateDifficultyRung: null,
    };
    createMockRepo({ retentionCard: card });
    (shouldTriggerEvaluate as jest.Mock).mockReturnValue(false);
    const db = createMockDb({
      queryResults: { topic: { id: topicId, title: 'Algebra' } },
    });

    const result = await checkEvaluateEligibility(db, profileId, topicId);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Ease factor below 2.5');
  });

  it('returns not eligible when no successful reviews', async () => {
    const card = {
      topicId,
      profileId,
      easeFactor: '2.50',
      repetitions: 0,
      evaluateDifficultyRung: null,
    };
    createMockRepo({ retentionCard: card });
    (shouldTriggerEvaluate as jest.Mock).mockReturnValue(false);
    const db = createMockDb({
      queryResults: { topic: null },
    });

    const result = await checkEvaluateEligibility(db, profileId, topicId);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No successful reviews');
    // Falls back to topicId when topic not found
    expect(result.topicTitle).toBe(topicId);
  });

  it('defaults evaluateDifficultyRung to 1 when null', async () => {
    const card = {
      topicId,
      profileId,
      easeFactor: '2.60',
      repetitions: 2,
      evaluateDifficultyRung: null,
    };
    createMockRepo({ retentionCard: card });
    (shouldTriggerEvaluate as jest.Mock).mockReturnValue(true);
    const db = createMockDb({
      queryResults: { topic: { id: topicId, title: 'Test Topic' } },
    });

    const result = await checkEvaluateEligibility(db, profileId, topicId);

    expect(result.currentRung).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// advanceEvaluateRung
// ---------------------------------------------------------------------------

describe('advanceEvaluateRung', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advances rung from 1 to 2', async () => {
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: 1,
        },
      },
    });

    const result = await advanceEvaluateRung(db, profileId, topicId);

    expect(result).toBe(2);
    expect(db.update).toHaveBeenCalled();
  });

  it('caps rung at 4', async () => {
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: 4,
        },
      },
    });

    const result = await advanceEvaluateRung(db, profileId, topicId);

    expect(result).toBe(4);
  });

  it('returns 1 when no card exists', async () => {
    const db = createMockDb();

    const result = await advanceEvaluateRung(db, profileId, topicId);

    expect(result).toBe(1);
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processEvaluateFailureEscalation
// ---------------------------------------------------------------------------

describe('processEvaluateFailureEscalation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reveals flaw on first failure', async () => {
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: 3,
        },
      },
    });
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'reveal_flaw',
      message: 'Let me show you the flaw.',
    });

    const result = await processEvaluateFailureEscalation(
      db,
      profileId,
      topicId,
      1
    );

    expect(result.action).toBe('reveal_flaw');
    expect(handleEvaluateFailure).toHaveBeenCalledWith(1, 3);
  });

  it('lowers difficulty rung on second failure', async () => {
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: 3,
        },
      },
    });
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'lower_difficulty',
      message: 'Lowering difficulty.',
      newDifficultyRung: 2,
    });

    const result = await processEvaluateFailureEscalation(
      db,
      profileId,
      topicId,
      2
    );

    expect(result.action).toBe('lower_difficulty');
    expect(result.newDifficultyRung).toBe(2);
    // Should update DB
    expect(db.update).toHaveBeenCalled();
  });

  it('resets rung to 1 on exit_to_standard', async () => {
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: 3,
        },
      },
    });
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'exit_to_standard',
      message: 'Exit to standard review.',
    });

    await processEvaluateFailureEscalation(db, profileId, topicId, 3);

    expect(db.update).toHaveBeenCalled();
  });

  it('handles missing retention card gracefully', async () => {
    const db = createMockDb();
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'reveal_flaw',
      message: 'No card but still responds.',
    });

    const result = await processEvaluateFailureEscalation(
      db,
      profileId,
      topicId,
      1
    );

    expect(result.action).toBe('reveal_flaw');
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getEvaluateSessionState
// ---------------------------------------------------------------------------

describe('getEvaluateSessionState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when session is not evaluate type', async () => {
    createMockRepo({
      session: {
        id: sessionId,
        verificationType: 'standard',
        topicId,
      },
    });
    const db = createMockDb();

    const result = await getEvaluateSessionState(db, profileId, sessionId);

    expect(result).toBeNull();
  });

  it('returns null when session not found', async () => {
    createMockRepo({ session: null });
    const db = createMockDb();

    const result = await getEvaluateSessionState(db, profileId, sessionId);

    expect(result).toBeNull();
  });

  it('returns evaluate state for evaluate session', async () => {
    createMockRepo({
      session: {
        id: sessionId,
        verificationType: 'evaluate',
        topicId,
      },
    });
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: 3,
        },
      },
    });

    const result = await getEvaluateSessionState(db, profileId, sessionId);

    expect(result).toEqual({
      sessionId,
      topicId,
      difficultyRung: 3,
      consecutiveFailures: 0,
      lastFailureAction: null,
    });
  });

  it('defaults difficulty rung to 1 when null on card', async () => {
    createMockRepo({
      session: {
        id: sessionId,
        verificationType: 'evaluate',
        topicId,
      },
    });
    const db = createMockDb({
      queryResults: {
        retentionCard: {
          id: 'card-1',
          topicId,
          profileId,
          evaluateDifficultyRung: null,
        },
      },
    });

    const result = await getEvaluateSessionState(db, profileId, sessionId);

    expect(result?.difficultyRung).toBe(1);
  });

  it('returns null when session has no topicId', async () => {
    createMockRepo({
      session: {
        id: sessionId,
        verificationType: 'evaluate',
        topicId: null,
      },
    });
    const db = createMockDb();

    const result = await getEvaluateSessionState(db, profileId, sessionId);

    expect(result).toBeNull();
  });
});
