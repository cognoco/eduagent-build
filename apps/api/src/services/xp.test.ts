import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('./settings' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('./settings'),
  getLearningMode: jest.fn().mockResolvedValue({ mode: 'serious' }),
  getLearningModeRules: jest.fn().mockReturnValue({
    masteryGates: true,
    verifiedXpOnly: true,
    mandatorySummaries: true,
  }),
}));

import { createScopedRepository, type Database } from '@eduagent/database';
import {
  calculateTopicXp,
  verifyXp,
  decayXp,
  insertSessionXpEntry,
  syncXpLedgerStatus,
  applyReflectionMultiplier,
  getSessionXpEntry,
  REFLECTION_XP_MULTIPLIER,
} from './xp';
import { getLearningMode, getLearningModeRules } from './settings';

// ---------------------------------------------------------------------------
// calculateTopicXp
// ---------------------------------------------------------------------------

describe('calculateTopicXp', () => {
  it('calculates XP for recall depth (1x multiplier)', () => {
    const xp = calculateTopicXp(0.8, 'recall');

    expect(xp).toBe(80); // 100 * 0.8 * 1
  });

  it('calculates XP for explain depth (1.5x multiplier)', () => {
    const xp = calculateTopicXp(0.8, 'explain');

    expect(xp).toBe(120); // 100 * 0.8 * 1.5
  });

  it('calculates XP for transfer depth (2x multiplier)', () => {
    const xp = calculateTopicXp(0.8, 'transfer');

    expect(xp).toBe(160); // 100 * 0.8 * 2
  });

  it('returns 0 for zero mastery', () => {
    const xp = calculateTopicXp(0, 'transfer');

    expect(xp).toBe(0);
  });

  it('returns full XP for perfect mastery at transfer', () => {
    const xp = calculateTopicXp(1.0, 'transfer');

    expect(xp).toBe(200); // 100 * 1.0 * 2
  });

  it('rounds to nearest integer', () => {
    const xp = calculateTopicXp(0.33, 'explain');

    // 100 * 0.33 * 1.5 = 49.5 -> rounds to 50
    expect(xp).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// verifyXp
// ---------------------------------------------------------------------------

describe('verifyXp', () => {
  it('returns the same amount as pending', () => {
    expect(verifyXp(100)).toBe(100);
  });

  it('handles zero amount', () => {
    expect(verifyXp(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// decayXp
// ---------------------------------------------------------------------------

describe('decayXp', () => {
  it('decays proportionally based on mastery drop', () => {
    // 100 XP with 0.3 mastery drop => 100 - (100 * 0.3) = 70
    const result = decayXp(100, 0.3);

    expect(result).toBe(70);
  });

  it('never returns below 0', () => {
    const result = decayXp(50, 1.5);

    expect(result).toBe(0);
  });

  it('returns full amount when mastery drop is 0', () => {
    const result = decayXp(100, 0);

    expect(result).toBe(100);
  });

  it('returns 0 when mastery drop is 1 (total loss)', () => {
    const result = decayXp(100, 1.0);

    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// insertSessionXpEntry (DB-aware)
// ---------------------------------------------------------------------------

function createMockXpDb(): {
  db: Database;
  insertValues: jest.Mock;
  queryAssessmentsFindFirst: jest.Mock;
} {
  // insertSessionXpEntry now chains onConflictDoNothing after .values(...)
  // so the mock's .values must return an object with onConflictDoNothing
  // that resolves. We expose insertValues for assertions on the values
  // payload by routing it through a wrapper.
  const insertValues = jest.fn();
  const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  insertValues.mockReturnValue({ onConflictDoNothing });
  const queryAssessmentsFindFirst = jest.fn().mockResolvedValue(null);

  const db = {
    query: {
      assessments: {
        findFirst: queryAssessmentsFindFirst,
      },
    },
    insert: jest.fn().mockReturnValue({ values: insertValues }),
  } as unknown as Database;

  return { db, insertValues, queryAssessmentsFindFirst };
}

describe('insertSessionXpEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts XP when passed assessment exists and no prior entry', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    queryAssessmentsFindFirst.mockResolvedValue({
      id: 'assessment-001',
      profileId: 'profile-001',
      topicId: 'topic-001',
      status: 'passed',
      masteryScore: 0.8,
      verificationDepth: 'explain',
    });

    (createScopedRepository as jest.Mock).mockReturnValue({
      xpLedger: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-001',
        topicId: 'topic-001',
        subjectId: 'subject-001',
        amount: 120, // 100 * 0.80 * 1.5 (explain)
        status: 'pending',
      }),
    );
  });

  it('skips when topicId is null', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    await insertSessionXpEntry(db, 'profile-001', null, 'subject-001');

    expect(queryAssessmentsFindFirst).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('skips when no assessment exists', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    queryAssessmentsFindFirst.mockResolvedValue(null);

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    expect(insertValues).not.toHaveBeenCalled();
  });

  it('skips when assessment has no mastery score', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    queryAssessmentsFindFirst.mockResolvedValue({
      id: 'assessment-001',
      profileId: 'profile-001',
      topicId: 'topic-001',
      status: 'passed',
      masteryScore: null,
      verificationDepth: 'recall',
    });

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    expect(insertValues).not.toHaveBeenCalled();
  });

  it('skips when XP entry already exists (dedup)', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    queryAssessmentsFindFirst.mockResolvedValue({
      id: 'assessment-001',
      profileId: 'profile-001',
      topicId: 'topic-001',
      status: 'passed',
      masteryScore: 0.9,
      verificationDepth: 'recall',
    });

    (createScopedRepository as jest.Mock).mockReturnValue({
      xpLedger: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'xp-001',
          profileId: 'profile-001',
          topicId: 'topic-001',
          amount: 90,
        }),
      },
    });

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    expect(insertValues).not.toHaveBeenCalled();
  });

  it('calculates correct XP amount (masteryScore x verificationDepth multiplier)', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    queryAssessmentsFindFirst.mockResolvedValue({
      id: 'assessment-002',
      profileId: 'profile-001',
      topicId: 'topic-001',
      status: 'passed',
      masteryScore: 0.75,
      verificationDepth: 'transfer',
    });

    (createScopedRepository as jest.Mock).mockReturnValue({
      xpLedger: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    // 100 * 0.75 * 2.0 (transfer) = 150
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 150,
      }),
    );
  });

  it('inserts XP as verified immediately in casual mode', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    // Override mock for casual mode
    (getLearningMode as jest.Mock).mockResolvedValueOnce({ mode: 'casual' });
    (getLearningModeRules as jest.Mock).mockReturnValueOnce({
      masteryGates: false,
      verifiedXpOnly: false,
      mandatorySummaries: false,
    });

    queryAssessmentsFindFirst.mockResolvedValue({
      id: 'assessment-003',
      profileId: 'profile-001',
      topicId: 'topic-001',
      status: 'passed',
      masteryScore: 0.8,
      verificationDepth: 'recall',
    });

    (createScopedRepository as jest.Mock).mockReturnValue({
      xpLedger: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'verified',
        amount: 80,
      }),
    );
  });

  it('inserts XP as pending in serious mode', async () => {
    const { db, insertValues, queryAssessmentsFindFirst } = createMockXpDb();

    queryAssessmentsFindFirst.mockResolvedValue({
      id: 'assessment-004',
      profileId: 'profile-001',
      topicId: 'topic-001',
      status: 'passed',
      masteryScore: 0.8,
      verificationDepth: 'recall',
    });

    (createScopedRepository as jest.Mock).mockReturnValue({
      xpLedger: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await insertSessionXpEntry(db, 'profile-001', 'topic-001', 'subject-001');

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        amount: 80,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// syncXpLedgerStatus
// ---------------------------------------------------------------------------

function createMockSyncDb(
  matchedRows: Array<{ id: string }> = [{ id: 'xp-1' }],
): {
  db: Database;
  updateSet: jest.Mock;
  updateWhere: jest.Mock;
} {
  const updateReturning = jest.fn().mockResolvedValue(matchedRows);
  const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

  const db = {
    update: jest.fn().mockReturnValue({ set: updateSet }),
  } as unknown as Database;

  return { db, updateSet, updateWhere };
}

describe('syncXpLedgerStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates xp_ledger status to verified with verifiedAt timestamp', async () => {
    const { db, updateSet } = createMockSyncDb();

    const updated = await syncXpLedgerStatus(
      db,
      'profile-001',
      'topic-001',
      'verified',
    );

    expect(updated).toBe(true);
    expect(db.update).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'verified',
        verifiedAt: expect.any(Date),
      }),
    );
  });

  it('updates xp_ledger status to decayed without verifiedAt', async () => {
    const { db, updateSet } = createMockSyncDb();

    const updated = await syncXpLedgerStatus(
      db,
      'profile-001',
      'topic-001',
      'decayed',
    );

    expect(updated).toBe(true);
    expect(db.update).toHaveBeenCalled();
    const setArg = updateSet.mock.calls[0][0];
    expect(setArg.status).toBe('decayed');
    expect(setArg.verifiedAt).toBeUndefined();
  });

  it('returns false when no xp_ledger row exists', async () => {
    const { db } = createMockSyncDb([]);

    const updated = await syncXpLedgerStatus(
      db,
      'profile-001',
      'nonexistent-topic',
      'verified',
    );

    expect(updated).toBe(false);
  });
});

function createMockReflectionDb({
  session = {
    id: 'session-1',
    profileId: 'profile-001',
    topicId: 'topic-001',
  },
  entry = {
    id: 'xp-001',
    amount: 100,
    reflectionMultiplierApplied: false,
  },
  updatedRows = [{ id: 'xp-001' }],
}: {
  session?: Record<string, unknown> | null;
  entry?: Record<string, unknown> | null;
  updatedRows?: Array<{ id: string }>;
} = {}) {
  const updateReturning = jest.fn().mockResolvedValue(updatedRows);
  const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

  const db = {
    query: {
      learningSessions: {
        findFirst: jest.fn().mockResolvedValue(session),
      },
    },
    update: jest.fn().mockReturnValue({ set: updateSet }),
  } as unknown as Database;

  (createScopedRepository as jest.Mock).mockReturnValue({
    xpLedger: {
      findFirst: jest.fn().mockResolvedValue(entry),
    },
  });

  return { db, updateSet };
}

describe('REFLECTION_XP_MULTIPLIER', () => {
  it('equals 1.5', () => {
    expect(REFLECTION_XP_MULTIPLIER).toBe(1.5);
  });
});

describe('applyReflectionMultiplier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('multiplies base XP by 1.5 and rounds', async () => {
    const { db, updateSet } = createMockReflectionDb();

    const result = await applyReflectionMultiplier(
      db,
      'profile-001',
      'session-1',
    );

    expect(result).toEqual({ applied: true, newAmount: 150 });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 150,
        reflectionMultiplierApplied: true,
      }),
    );
  });

  it('rounds .5 values up', async () => {
    const { db } = createMockReflectionDb({
      entry: {
        id: 'xp-001',
        amount: 133,
        reflectionMultiplierApplied: false,
      },
    });

    const result = await applyReflectionMultiplier(
      db,
      'profile-001',
      'session-1',
    );

    expect(result).toEqual({ applied: true, newAmount: 200 });
  });

  it('is idempotent when reflectionMultiplierApplied is already true', async () => {
    const { db } = createMockReflectionDb({
      entry: {
        id: 'xp-001',
        amount: 150,
        reflectionMultiplierApplied: true,
      },
    });

    const result = await applyReflectionMultiplier(
      db,
      'profile-001',
      'session-1',
    );

    expect(result).toEqual({ applied: false, newAmount: 150 });
  });

  it('returns false when the session has no topicId', async () => {
    const { db } = createMockReflectionDb({
      session: {
        id: 'session-1',
        profileId: 'profile-001',
        topicId: null,
      },
      entry: null,
    });

    const result = await applyReflectionMultiplier(
      db,
      'profile-001',
      'session-1',
    );

    expect(result).toEqual({ applied: false, newAmount: 0 });
  });

  it('returns false when no xp_ledger row exists', async () => {
    const { db } = createMockReflectionDb({ entry: null });

    const result = await applyReflectionMultiplier(
      db,
      'profile-001',
      'session-1',
    );

    expect(result).toEqual({ applied: false, newAmount: 0 });
  });
});

describe('getSessionXpEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns base and bonus XP before reflection is applied', async () => {
    const { db } = createMockReflectionDb({
      entry: {
        id: 'xp-001',
        amount: 100,
        reflectionMultiplierApplied: false,
      },
    });

    const result = await getSessionXpEntry(db, 'profile-001', 'session-1');

    expect(result).toEqual({ baseXp: 100, reflectionBonusXp: 50 });
  });

  it('derives the original base XP after reflection is applied by this session', async () => {
    const { db } = createMockReflectionDb({
      entry: {
        id: 'xp-001',
        amount: 150,
        reflectionMultiplierApplied: true,
        reflectionAppliedBySessionId: 'session-1',
      },
    });

    const result = await getSessionXpEntry(db, 'profile-001', 'session-1');

    expect(result).toEqual({ baseXp: 100, reflectionBonusXp: 50 });
  });

  it('returns zero bonus when reflection was applied by a different session', async () => {
    const { db } = createMockReflectionDb({
      entry: {
        id: 'xp-001',
        amount: 150,
        reflectionMultiplierApplied: true,
        reflectionAppliedBySessionId: 'session-other',
      },
    });

    const result = await getSessionXpEntry(db, 'profile-001', 'session-1');

    expect(result).toEqual({ baseXp: 100, reflectionBonusXp: 0 });
  });
});
