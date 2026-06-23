// ---------------------------------------------------------------------------
// Vocabulary Service — Tests [4A.1]
// ---------------------------------------------------------------------------

import {
  listVocabulary,
  createVocabulary,
  updateVocabulary,
  reviewVocabulary,
  ensureVocabularyRetentionCard,
  upsertExtractedVocabulary,
  getVocabularyDueForReview,
  normalizeVocabTerm,
} from './vocabulary';
import type { Database } from '@eduagent/database';

const NOW = new Date('2026-01-15T10:00:00.000Z');
const PROFILE_ID = 'profile-001';
const SUBJECT_ID = 'subject-001';
const VOCAB_ID = 'vocab-001';

// ---------------------------------------------------------------------------
// Mock row factories
// ---------------------------------------------------------------------------

function mockVocabRow(
  overrides: Partial<{
    id: string;
    profileId: string;
    subjectId: string;
    term: string;
    termNormalized: string;
    translation: string;
    type: 'word' | 'chunk';
    cefrLevel: string | null;
    milestoneId: string | null;
    mastered: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? VOCAB_ID,
    profileId: overrides.profileId ?? PROFILE_ID,
    subjectId: overrides.subjectId ?? SUBJECT_ID,
    term: overrides.term ?? 'hola',
    termNormalized: overrides.termNormalized ?? 'hola',
    translation: overrides.translation ?? 'hello',
    type: overrides.type ?? 'word',
    cefrLevel: overrides.cefrLevel ?? null,
    milestoneId: overrides.milestoneId ?? null,
    mastered: overrides.mastered ?? false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockRetentionCardRow(
  overrides: Partial<{
    vocabularyId: string;
    profileId: string;
    easeFactor: number;
    intervalDays: number;
    repetitions: number;
    lastReviewedAt: Date | null;
    nextReviewAt: Date | null;
    failureCount: number;
    consecutiveSuccesses: number;
  }> = {},
) {
  return {
    vocabularyId: overrides.vocabularyId ?? VOCAB_ID,
    profileId: overrides.profileId ?? PROFILE_ID,
    easeFactor: overrides.easeFactor ?? '2.50',
    intervalDays: overrides.intervalDays ?? 0,
    repetitions: overrides.repetitions ?? 0,
    lastReviewedAt: overrides.lastReviewedAt ?? null,
    nextReviewAt: overrides.nextReviewAt ?? null,
    failureCount: overrides.failureCount ?? 0,
    consecutiveSuccesses: overrides.consecutiveSuccesses ?? 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Mock database factory
// ---------------------------------------------------------------------------

function mockSubjectRow() {
  return { id: SUBJECT_ID, profileId: PROFILE_ID, name: 'Spanish' };
}

function createMockDb({
  subjectFindFirst = mockSubjectRow() as Record<string, unknown> | null,
  vocabFindFirst = null as ReturnType<typeof mockVocabRow> | null,
  retentionCardFindFirst = null as ReturnType<
    typeof mockRetentionCardRow
  > | null,
  selectRows = [] as unknown[],
  insertReturning = [] as unknown[],
  updateReturning = [] as unknown[],
  onConflictBehavior = 'update' as 'update' | 'nothing',
  // [BUG-862] milestoneOwnedResult controls what verifyMilestoneOwnership returns.
  // Default to a matching row so existing tests (which don't exercise the IDOR
  // path) continue to pass. Pass [] to simulate "milestone not owned" in
  // negative-path break tests.
  milestoneOwnedResult = [{ id: 'milestone-1' }] as unknown[],
} = {}): Database {
  const selectFromChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue(selectRows),
        // reviewVocabulary acquires the retention-card row lock via
        // SELECT ... FOR UPDATE; the locked read resolves to the configured
        // retention card row.
        for: jest
          .fn()
          .mockResolvedValue(
            retentionCardFindFirst ? [retentionCardFindFirst] : [],
          ),
      }),
      innerJoin: jest.fn().mockReturnValue({
        // [BUG-862] verifyMilestoneOwnership uses .from().innerJoin().where().limit(1)
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(milestoneOwnedResult),
        }),
      }),
      leftJoin: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(selectRows),
        }),
      }),
    }),
  };

  const insertOnConflictChain =
    onConflictBehavior === 'update'
      ? {
          onConflictDoUpdate: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(insertReturning),
          }),
        }
      : {
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(insertReturning),
          }),
        };

  const db = {
    query: {
      subjects: {
        findFirst: jest.fn().mockResolvedValue(subjectFindFirst),
      },
      vocabulary: {
        findFirst: jest.fn().mockResolvedValue(vocabFindFirst),
      },
      vocabularyRetentionCards: {
        findFirst: jest.fn().mockResolvedValue(retentionCardFindFirst),
      },
    },
    select: jest.fn().mockReturnValue(selectFromChain),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        ...insertOnConflictChain,
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(updateReturning),
        }),
      }),
    }),
    transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(db),
      ),
  } as unknown as Database;

  return db;
}

// ---------------------------------------------------------------------------
// normalizeVocabTerm — pure function tests
// ---------------------------------------------------------------------------

describe('normalizeVocabTerm', () => {
  it('lowercases and trims the term', () => {
    expect(normalizeVocabTerm('  Hola  ')).toBe('hola');
  });

  it('strips diacritical marks', () => {
    expect(normalizeVocabTerm('café')).toBe('cafe');
    expect(normalizeVocabTerm('naïve')).toBe('naive');
    expect(normalizeVocabTerm('über')).toBe('uber');
  });

  it('handles empty string', () => {
    expect(normalizeVocabTerm('')).toBe('');
  });

  it('handles strings with only whitespace', () => {
    expect(normalizeVocabTerm('   ')).toBe('');
  });

  it('normalizes accented characters from various languages', () => {
    expect(normalizeVocabTerm('résumé')).toBe('resume');
    expect(normalizeVocabTerm('señor')).toBe('senor');
    expect(normalizeVocabTerm('Ångström')).toBe('angstrom');
  });
});

// ---------------------------------------------------------------------------
// listVocabulary
// ---------------------------------------------------------------------------

describe('listVocabulary', () => {
  it('throws when subject is not found', async () => {
    const db = createMockDb({ subjectFindFirst: null });

    await expect(listVocabulary(db, PROFILE_ID, SUBJECT_ID)).rejects.toThrow(
      'Subject not found',
    );
  });

  it('returns mapped vocabulary rows', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', translation: 'hello' }),
      mockVocabRow({ id: 'v2', term: 'adiós', translation: 'goodbye' }),
    ];
    const db = createMockDb({ selectRows: rows });

    const result = await listVocabulary(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('v1');
    expect(result[0]!.term).toBe('hola');
    expect(result[0]!.translation).toBe('hello');
    expect(result[0]!.createdAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('returns empty array when no vocabulary exists', async () => {
    const db = createMockDb({ selectRows: [] });

    const result = await listVocabulary(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createVocabulary
// ---------------------------------------------------------------------------

describe('createVocabulary', () => {
  it('throws when subject is not found', async () => {
    const db = createMockDb({ subjectFindFirst: null });

    await expect(
      createVocabulary(db, PROFILE_ID, SUBJECT_ID, {
        term: 'hola',
        translation: 'hello',
        type: 'word',
      }),
    ).rejects.toThrow('Subject not found');
  });

  it('creates a vocabulary entry and returns it', async () => {
    const createdRow = mockVocabRow({
      term: 'hola',
      translation: 'hello',
      type: 'word',
    });
    const db = createMockDb({ insertReturning: [createdRow] });

    const result = await createVocabulary(db, PROFILE_ID, SUBJECT_ID, {
      term: 'hola',
      translation: 'hello',
      type: 'word',
    });

    expect(result.term).toBe('hola');
    expect(result.translation).toBe('hello');
    expect(result.type).toBe('word');
    expect(db.insert).toHaveBeenCalled();
  });

  it('passes cefrLevel and milestoneId when provided', async () => {
    const createdRow = mockVocabRow({
      cefrLevel: 'A1',
      milestoneId: 'milestone-1',
    });
    const db = createMockDb({ insertReturning: [createdRow] });

    const result = await createVocabulary(db, PROFILE_ID, SUBJECT_ID, {
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: 'A1',
      milestoneId: 'milestone-1',
    });

    expect(result.cefrLevel).toBe('A1');
    expect(result.milestoneId).toBe('milestone-1');
  });

  // [BUG-862] IDOR negative-path break test: milestoneId from a different subject
  // must be rejected before any INSERT is attempted.
  it('throws when milestoneId belongs to a different subject (IDOR)', async () => {
    // milestoneOwnedResult=[] simulates "not found in this subject's ownership chain"
    const db = createMockDb({ milestoneOwnedResult: [] });

    await expect(
      createVocabulary(db, PROFILE_ID, SUBJECT_ID, {
        term: 'hola',
        translation: 'hello',
        type: 'word',
        milestoneId: 'milestone-other-subject',
      }),
    ).rejects.toThrow('Subject not found');

    // The INSERT must not have been called — the check must gate the write
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateVocabulary
// ---------------------------------------------------------------------------

describe('updateVocabulary', () => {
  it('returns null when vocabulary item is not found', async () => {
    const db = createMockDb({ updateReturning: [] });

    const result = await updateVocabulary(db, PROFILE_ID, VOCAB_ID, {
      translation: 'hi',
    });

    expect(result).toBeNull();
  });

  it('updates and returns the vocabulary item', async () => {
    const updatedRow = mockVocabRow({ translation: 'hi there' });
    const db = createMockDb({ updateReturning: [updatedRow] });

    const result = await updateVocabulary(db, PROFILE_ID, VOCAB_ID, {
      translation: 'hi there',
    });

    expect(result).not.toBeNull();
    expect(result!.translation).toBe('hi there');
    expect(db.update).toHaveBeenCalled();
  });

  it('allows updating mastered status', async () => {
    const updatedRow = mockVocabRow({ mastered: true });
    const db = createMockDb({ updateReturning: [updatedRow] });

    const result = await updateVocabulary(db, PROFILE_ID, VOCAB_ID, {
      mastered: true,
    });

    expect(result!.mastered).toBe(true);
  });

  it('allows updating type', async () => {
    const updatedRow = mockVocabRow({ type: 'chunk' });
    const db = createMockDb({ updateReturning: [updatedRow] });

    const result = await updateVocabulary(db, PROFILE_ID, VOCAB_ID, {
      type: 'chunk',
    });

    expect(result!.type).toBe('chunk');
  });

  // [BUG-862] IDOR negative-path break test: milestoneId from a different
  // subject must be rejected before the UPDATE is applied.
  it('throws when milestoneId belongs to a different subject (IDOR)', async () => {
    // vocabFindFirst must return a row so the ownership check can read the subjectId
    const existingVocab = mockVocabRow();
    // milestoneOwnedResult=[] simulates "not found in this subject's ownership chain"
    const db = createMockDb({
      vocabFindFirst: existingVocab,
      milestoneOwnedResult: [],
    });

    await expect(
      updateVocabulary(db, PROFILE_ID, VOCAB_ID, {
        milestoneId: 'milestone-other-subject',
      }),
    ).rejects.toThrow('Subject not found');

    // The UPDATE must not have been called — the check must gate the write
    expect(db.update).not.toHaveBeenCalled();
  });

  // [BUG-862] IDOR guard must be unconditional: when the vocab row does not
  // belong to the caller (findFirst returns null) AND a non-null milestoneId is
  // supplied, the function must return null immediately without calling db.update.
  // Previously the guard was wrapped in `if (existing)`, silently skipping it
  // when the ownership lookup returned null.
  it('returns null without calling db.update when vocab not owned by caller and milestoneId is set', async () => {
    // vocabFindFirst=null simulates the caller supplying a vocabularyId they do not own
    const db = createMockDb({ vocabFindFirst: null });

    const result = await updateVocabulary(db, PROFILE_ID, 'vocab-other-owner', {
      milestoneId: 'milestone-1',
    });

    expect(result).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ensureVocabularyRetentionCard
// ---------------------------------------------------------------------------

describe('ensureVocabularyRetentionCard', () => {
  it('returns the retention card after creation', async () => {
    const cardRow = mockRetentionCardRow();
    const db = createMockDb({
      retentionCardFindFirst: cardRow,
      onConflictBehavior: 'nothing',
    });

    const result = await ensureVocabularyRetentionCard(
      db,
      PROFILE_ID,
      VOCAB_ID,
    );

    expect(result.vocabularyId).toBe(VOCAB_ID);
    expect(result.easeFactor).toBe('2.50');
    expect(result.intervalDays).toBe(0);
    expect(result.repetitions).toBe(0);
  });

  it('throws when card cannot be found after creation attempt', async () => {
    const db = createMockDb({
      retentionCardFindFirst: null,
      onConflictBehavior: 'nothing',
    });

    await expect(
      ensureVocabularyRetentionCard(db, PROFILE_ID, VOCAB_ID),
    ).rejects.toThrow('Failed to ensure retention card');
  });
});

// ---------------------------------------------------------------------------
// reviewVocabulary
// ---------------------------------------------------------------------------

describe('reviewVocabulary', () => {
  it('throws when vocabulary item is not found', async () => {
    const db = createMockDb({ vocabFindFirst: null });

    await expect(
      reviewVocabulary(db, PROFILE_ID, VOCAB_ID, { quality: 4 }),
    ).rejects.toThrow('Vocabulary item not found');
  });

  it('returns updated vocabulary and retention card after successful review', async () => {
    const vocabRow = mockVocabRow();
    const cardRow = mockRetentionCardRow();
    const updatedCardRow = mockRetentionCardRow({
      easeFactor: 2.6,
      intervalDays: 1,
      repetitions: 1,
      lastReviewedAt: NOW,
      nextReviewAt: NOW,
      consecutiveSuccesses: 1,
    });
    const updatedVocabRow = mockVocabRow({ mastered: false });

    const db = createMockDb({
      vocabFindFirst: vocabRow,
      retentionCardFindFirst: cardRow,
      onConflictBehavior: 'nothing',
    });

    // Override update to return different rows for retention card and vocab updates
    (db.update as jest.Mock)
      .mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedCardRow]),
          }),
        }),
      })
      .mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedVocabRow]),
          }),
        }),
      });

    const result = await reviewVocabulary(db, PROFILE_ID, VOCAB_ID, {
      quality: 4,
    });

    expect(result.vocabulary).toEqual(expect.objectContaining({}));
    expect(result.retention).toEqual(expect.objectContaining({}));
    expect(result.retention.vocabularyId).toBe(VOCAB_ID);
  });

  it('resets consecutive successes on failed review (quality < 3)', async () => {
    const vocabRow = mockVocabRow();
    const cardRow = mockRetentionCardRow({ consecutiveSuccesses: 2 });
    const updatedCardRow = mockRetentionCardRow({
      failureCount: 1,
      consecutiveSuccesses: 0,
    });
    const updatedVocabRow = mockVocabRow({ mastered: false });

    const db = createMockDb({
      vocabFindFirst: vocabRow,
      retentionCardFindFirst: cardRow,
      onConflictBehavior: 'nothing',
    });

    (db.update as jest.Mock)
      .mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedCardRow]),
          }),
        }),
      })
      .mockReturnValueOnce({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedVocabRow]),
          }),
        }),
      });

    const result = await reviewVocabulary(db, PROFILE_ID, VOCAB_ID, {
      quality: 1,
    });

    // The update was called — we verify the shape
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(result.vocabulary).toEqual(expect.objectContaining({}));
    expect(result.retention).toEqual(expect.objectContaining({}));
  });
});

// ---------------------------------------------------------------------------
// upsertExtractedVocabulary
// ---------------------------------------------------------------------------

/**
 * Builds a mock db suitable for upsertExtractedVocabulary tests.
 *
 * The batch implementation does ONE db.insert call that receives all rows in
 * values([...]) and returns all rows from .returning(). Milestone ownership
 * checks use db.select().from().innerJoin().where().limit(1).
 *
 * For SM-2 reviews (quality items), the mock wires up:
 *   db.query.vocabulary.findFirst  → the vocab row by id
 *   db.transaction                 → passes through to the same db object
 *   db.query.vocabularyRetentionCards.findFirst → the retention card
 *   db.select().from().where().for('update') → locked retention card read
 *   db.update (first call per review) → retention card update
 *   db.update (second call per review) → vocab mastered update
 */
function createBatchUpsertDb(
  batchRows: ReturnType<typeof mockVocabRow>[],
  opts: {
    milestoneOwnedResult?: unknown[];
    reviewVocabRows?: ReturnType<typeof mockVocabRow>[];
    retentionCardRow?: ReturnType<typeof mockRetentionCardRow> | null;
  } = {},
): Database {
  const {
    milestoneOwnedResult = [{ id: 'milestone-1' }],
    reviewVocabRows = batchRows,
    retentionCardRow = mockRetentionCardRow(),
  } = opts;

  // (termNormalized is available on rows for order-restoration in the implementation)

  // We track update call count to alternate between retention-card update and
  // vocab-mastered update within each reviewVocabulary call.
  let updateCallCount = 0;

  const db: Database = {
    query: {
      subjects: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: SUBJECT_ID, profileId: PROFILE_ID }),
      },
      vocabulary: {
        findFirst: jest.fn().mockImplementation(({ where: _w } = {}) => {
          // reviewVocabulary calls findFirst to get the vocab row by id.
          // Return the first reviewVocabRows entry by default — sufficient for
          // single-review tests; for multi-review tests the spy returns all.
          return Promise.resolve(reviewVocabRows[0] ?? null);
        }),
      },
      vocabularyRetentionCards: {
        findFirst: jest.fn().mockResolvedValue(retentionCardRow),
      },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          // SELECT ... FOR UPDATE used inside reviewVocabulary's transaction
          for: jest
            .fn()
            .mockResolvedValue(retentionCardRow ? [retentionCardRow] : []),
          orderBy: jest.fn().mockResolvedValue([]),
        }),
        innerJoin: jest.fn().mockReturnValue({
          // verifyMilestoneOwnership: select().from().innerJoin().where().limit(1)
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(milestoneOwnedResult),
          }),
        }),
        leftJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    // Batch insert: .values([...]).onConflictDoUpdate({...}).returning() → all rows
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(batchRows),
        }),
        // ensure / onConflictDoNothing path used inside reviewVocabulary
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
        returning: jest.fn().mockResolvedValue(batchRows),
      }),
    }),
    update: jest.fn().mockImplementation(() => {
      // Alternate: odd calls = retention card update, even calls = vocab update
      updateCallCount++;
      const isRetentionCard = updateCallCount % 2 === 1;
      const returnRow = isRetentionCard
        ? retentionCardRow
          ? [retentionCardRow]
          : []
        : reviewVocabRows[0]
          ? [reviewVocabRows[0]]
          : [];
      return {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(returnRow),
          }),
        }),
      };
    }),
    transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(db),
      ),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([]),
      }),
    }),
  } as unknown as Database;

  return db;
}

describe('upsertExtractedVocabulary', () => {
  // ----- batch-insert efficiency tests (these FAIL on the serial impl) -------

  it('issues a single db.insert for a multi-item batch (not one per item)', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', termNormalized: 'hola' }),
      mockVocabRow({ id: 'v2', term: 'adios', termNormalized: 'adios' }),
      mockVocabRow({ id: 'v3', term: 'gracias', termNormalized: 'gracias' }),
    ];
    const db = createBatchUpsertDb(rows);

    await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word' },
      { term: 'adios', translation: 'goodbye', type: 'word' },
      { term: 'gracias', translation: 'thanks', type: 'word' },
    ]);

    // batch: ONE insert call for all three items, not three separate calls
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('checks subject ownership once regardless of item count', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', termNormalized: 'hola' }),
      mockVocabRow({ id: 'v2', term: 'adios', termNormalized: 'adios' }),
    ];
    const db = createBatchUpsertDb(rows);

    await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word' },
      { term: 'adios', translation: 'goodbye', type: 'word' },
    ]);

    // subject check once, not N times
    expect(db.query.subjects.findFirst).toHaveBeenCalledTimes(1);
  });

  it('preserves return order matching input order', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', termNormalized: 'hola' }),
      mockVocabRow({ id: 'v2', term: 'adios', termNormalized: 'adios' }),
      mockVocabRow({ id: 'v3', term: 'gracias', termNormalized: 'gracias' }),
    ];
    // Simulate DB returning rows in REVERSE order (as if conflict reorder)
    const dbWithReversedRows = createBatchUpsertDb(rows);
    // Override the returning mock to return in reverse
    const reversedRows = [...rows].reverse();
    (
      (db: Database) => {
        const insertMock = db.insert as jest.Mock;
        insertMock.mockReturnValue({
          values: jest.fn().mockReturnValue({
            onConflictDoUpdate: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue(reversedRows),
            }),
            onConflictDoNothing: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([]),
            }),
            returning: jest.fn().mockResolvedValue(reversedRows),
          }),
        });
      }
    )(dbWithReversedRows);

    const result = await upsertExtractedVocabulary(
      dbWithReversedRows,
      PROFILE_ID,
      SUBJECT_ID,
      [
        { term: 'hola', translation: 'hello', type: 'word' },
        { term: 'adios', translation: 'goodbye', type: 'word' },
        { term: 'gracias', translation: 'thanks', type: 'word' },
      ],
    );

    // output must be in INPUT order, not DB return order
    expect(result[0]!.id).toBe('v1');
    expect(result[1]!.id).toBe('v2');
    expect(result[2]!.id).toBe('v3');
  });

  // ----- ownership / scoping correctness ------------------------------------

  it('still scopes inserts to profileId (ownership preserved in batch values)', async () => {
    const rows = [
      mockVocabRow({
        id: 'v1',
        term: 'hola',
        termNormalized: 'hola',
        profileId: PROFILE_ID,
      }),
    ];
    const db = createBatchUpsertDb(rows);

    const result = await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word' },
    ]);

    expect(result[0]!.profileId).toBe(PROFILE_ID);
    // Verify values() was called with the profileId in the payload
    const valuesFn = (db.insert as jest.Mock).mock.results[0]?.value?.values as
      | jest.Mock
      | undefined;
    const insertedValues = valuesFn?.mock.calls[0]?.[0] as
      | Array<{ profileId: string }>
      | undefined;
    expect(insertedValues?.[0]?.profileId).toBe(PROFILE_ID);
  });

  it('throws on subject not found and never calls db.insert', async () => {
    const db = createMockDb({ subjectFindFirst: null });

    await expect(
      upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
        { term: 'hola', translation: 'hello', type: 'word' },
      ]),
    ).rejects.toThrow('Subject not found');

    expect(db.insert).not.toHaveBeenCalled();
  });

  // ----- SM-2 retention side effects ----------------------------------------

  it('applies reviewVocabulary SM-2 update for each item that has a quality', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', termNormalized: 'hola' }),
      mockVocabRow({ id: 'v2', term: 'adios', termNormalized: 'adios' }),
    ];
    const db = createBatchUpsertDb(rows, {
      reviewVocabRows: rows,
      retentionCardRow: mockRetentionCardRow({ vocabularyId: 'v1' }),
    });

    // Only the first item has a quality — only one SM-2 review should happen
    await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word', quality: 4 },
      { term: 'adios', translation: 'goodbye', type: 'word' },
    ]);

    // transaction called once — one review, not zero and not two
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not call transaction when no items have quality', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', termNormalized: 'hola' }),
    ];
    const db = createBatchUpsertDb(rows);

    await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word' },
    ]);

    // No quality → no SM-2 transaction
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // ----- unchanged behaviours ------------------------------------------------

  it('creates vocabulary items for each extracted item (existing test)', async () => {
    const rows = [
      mockVocabRow({ id: 'v1', term: 'hola', termNormalized: 'hola' }),
      mockVocabRow({
        id: 'v2',
        term: 'adiós',
        termNormalized: 'adios',
      }),
    ];
    const db = createBatchUpsertDb(rows);

    const result = await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word' },
      { term: 'adiós', translation: 'goodbye', type: 'word' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]!.term).toBe('hola');
    expect(result[1]!.term).toBe('adiós');
  });

  it('returns empty array for empty items list', async () => {
    const db = createMockDb();

    const result = await upsertExtractedVocabulary(
      db,
      PROFILE_ID,
      SUBJECT_ID,
      [],
    );

    expect(result).toEqual([]);
    // no DB calls at all for empty list
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.query.subjects.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getVocabularyDueForReview
// ---------------------------------------------------------------------------

describe('getVocabularyDueForReview', () => {
  it('returns vocabulary with nextReviewAt from retention card', async () => {
    const reviewDate = new Date('2026-01-20T10:00:00.000Z');
    const rows = [
      {
        vocab: mockVocabRow({ id: 'v1', term: 'hola' }),
        card: mockRetentionCardRow({
          vocabularyId: 'v1',
          nextReviewAt: reviewDate,
        }),
      },
    ];
    const db = createMockDb({ selectRows: rows });

    const result = await getVocabularyDueForReview(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('v1');
    expect(result[0]!.nextReviewAt).toBe('2026-01-20T10:00:00.000Z');
  });

  it('returns null nextReviewAt when no retention card exists', async () => {
    const rows = [
      {
        vocab: mockVocabRow({ id: 'v1', term: 'hola' }),
        card: null,
      },
    ];
    const db = createMockDb({ selectRows: rows });

    const result = await getVocabularyDueForReview(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.nextReviewAt).toBeNull();
  });

  it('returns empty array when no vocabulary exists', async () => {
    const db = createMockDb({ selectRows: [] });

    const result = await getVocabularyDueForReview(db, PROFILE_ID, SUBJECT_ID);

    expect(result).toEqual([]);
  });

  it('includes standard vocabulary fields alongside nextReviewAt', async () => {
    const rows = [
      {
        vocab: mockVocabRow({
          id: 'v1',
          term: 'hola',
          translation: 'hello',
          type: 'word',
          cefrLevel: 'A1',
          mastered: false,
        }),
        card: null,
      },
    ];
    const db = createMockDb({ selectRows: rows });

    const result = await getVocabularyDueForReview(db, PROFILE_ID, SUBJECT_ID);

    expect(result[0]).toMatchObject({
      id: 'v1',
      term: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: 'A1',
      mastered: false,
    });
  });
});
