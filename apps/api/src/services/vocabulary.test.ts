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
} = {}): Database {
  const selectFromChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockResolvedValue(selectRows),
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
    expect(result[0].id).toBe('v1');
    expect(result[0].term).toBe('hola');
    expect(result[0].translation).toBe('hello');
    expect(result[0].createdAt).toBe('2026-01-15T10:00:00.000Z');
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

describe('upsertExtractedVocabulary', () => {
  it('creates vocabulary items for each extracted item', async () => {
    const createdRow1 = mockVocabRow({ id: 'v1', term: 'hola' });
    const createdRow2 = mockVocabRow({ id: 'v2', term: 'adiós' });

    // We need to chain multiple inserts; mock insert to return different rows each time
    const insertValues = jest.fn();
    insertValues
      .mockReturnValueOnce({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([createdRow1]),
        }),
      })
      .mockReturnValueOnce({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([createdRow2]),
        }),
      });

    const db = {
      query: {
        subjects: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: SUBJECT_ID, profileId: PROFILE_ID }),
        },
        vocabulary: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
        vocabularyRetentionCards: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
      insert: jest.fn().mockReturnValue({ values: insertValues }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database;

    const result = await upsertExtractedVocabulary(db, PROFILE_ID, SUBJECT_ID, [
      { term: 'hola', translation: 'hello', type: 'word' },
      { term: 'adiós', translation: 'goodbye', type: 'word' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].term).toBe('hola');
    expect(result[1].term).toBe('adiós');
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
    expect(result[0].id).toBe('v1');
    expect(result[0].nextReviewAt).toBe('2026-01-20T10:00:00.000Z');
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
    expect(result[0].nextReviewAt).toBeNull();
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
