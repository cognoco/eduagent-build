// ---------------------------------------------------------------------------
// Book Suggestion Generation — Unit Tests
// ---------------------------------------------------------------------------

import { jest } from '@jest/globals';

const routeAndCallMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('./llm' /* gc1-allow: LLM external boundary */, () => ({
  routeAndCall: (...args: unknown[]) => routeAndCallMock(...args),
}));

const loggerWarnMock = jest.fn<(...args: unknown[]) => void>();
jest.mock('./logger' /* gc1-allow: metric verification */, () => ({
  createLogger: () => ({
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  generateCategorizedBookSuggestions,
  COOLDOWN_MS,
} from './book-suggestion-generation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROFILE_ID = 'profile-abc';
const SUBJECT_ID = 'subject-xyz';

function makeSubject(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBJECT_ID,
    profileId: PROFILE_ID,
    name: 'Ancient History',
    pedagogyMode: 'classic',
    bookSuggestionsLastGenerationAttemptedAt: null,
    ...overrides,
  };
}

function makeLlmResult(suggestions: unknown[] = []) {
  return {
    response: JSON.stringify({ suggestions }),
  };
}

function makeSuggestion(
  title: string,
  category: 'related' | 'explore' = 'explore',
) {
  return {
    title,
    description: `A book about ${title}`,
    emoji: '📚',
    category,
  };
}

/**
 * Build a full transaction mock. Each call to `tx.select()` consumes the
 * next entry from `selectReturns` in order. Update and insert are
 * independently controllable.
 */
function makeTx(opts: {
  lockGot?: boolean;
  unpicked?: Array<{ id: string }>;
  existingBookTitles?: string[];
  existingSuggestionTitles?: string[];
  studiedTopics?: string[];
  updateResolves?: boolean;
  insertResolves?: boolean;
  insertRejects?: unknown;
}) {
  const {
    lockGot = true,
    unpicked = [],
    existingBookTitles = [],
    existingSuggestionTitles = [],
    studiedTopics = [],
    insertRejects,
  } = opts;

  // select() calls inside the transaction, in order:
  //   1. unpicked bookSuggestions check
  //   2. existingBookTitles (curriculumBooks)
  //   3. existingSuggestionTitles (bookSuggestions)
  //   4. studiedTopics (learningSessions join chain)
  const selectResults = [
    unpicked,
    existingBookTitles.map((title) => ({ title })),
    existingSuggestionTitles.map((title) => ({ title })),
    studiedTopics.map((title) => ({ title, ts: new Date() })),
  ];
  let selectCallIndex = 0;

  const buildSelectChain = (result: unknown[]) => {
    const chain: Record<string, jest.Mock> = {};
    const terminal = jest
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValue(result);
    chain['from'] = jest.fn().mockReturnValue(chain);
    chain['where'] = jest.fn().mockReturnValue(chain);
    chain['innerJoin'] = jest.fn().mockReturnValue(chain);
    chain['orderBy'] = jest.fn().mockReturnValue(chain);
    chain['limit'] = terminal;
    // Make the chain itself thenable so awaiting it resolves the result.
    // Some calls are awaited directly (no .limit()), others via .limit().
    (chain as unknown as Promise<unknown[]>)['then'] = <
      TResult1 = unknown[],
      TResult2 = never,
    >(
      onFulfilled?:
        | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);
    return chain;
  };

  const selectMock = jest.fn().mockImplementation(() => {
    const result = selectResults[selectCallIndex] ?? [];
    selectCallIndex++;
    return buildSelectChain(result);
  });

  const updateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const updateMock = jest.fn().mockReturnValue(updateChain);

  const insertChain = insertRejects
    ? {
        values: jest
          .fn<() => Promise<never>>()
          .mockRejectedValue(insertRejects),
      }
    : { values: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };
  const insertMock = jest.fn().mockReturnValue(insertChain);

  const executeMock = jest
    .fn<() => Promise<{ rows: Array<{ got: boolean }> }>>()
    .mockResolvedValue({ rows: [{ got: lockGot }] });

  return {
    tx: {
      execute: executeMock,
      select: selectMock,
      update: updateMock,
      insert: insertMock,
    } as never,
    mocks: {
      execute: executeMock,
      select: selectMock,
      update: updateMock,
      insert: insertMock,
      insertValues: insertChain.values,
      updateWhere: updateChain.where,
    },
  };
}

function makeDb(
  subject: Record<string, unknown> | null,
  txCallback?: (cb: (tx: never) => Promise<void>) => Promise<void>,
) {
  const transactionMock =
    txCallback != null
      ? jest.fn<typeof txCallback>().mockImplementation(txCallback)
      : jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  return {
    db: {
      query: {
        subjects: {
          findFirst: jest
            .fn<() => Promise<Record<string, unknown> | null>>()
            .mockResolvedValue(subject),
        },
      },
      transaction: transactionMock,
    } as never,
    transactionMock,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateCategorizedBookSuggestions', () => {
  beforeEach(() => {
    routeAndCallMock.mockReset();
    loggerWarnMock.mockReset();
  });

  // -------------------------------------------------------------------------
  // Task 2 — COOLDOWN_MS is 5 minutes
  // -------------------------------------------------------------------------
  it('COOLDOWN_MS is 5 minutes (300 000 ms)', () => {
    expect(COOLDOWN_MS).toBe(5 * 60 * 1000);
  });

  // -------------------------------------------------------------------------
  // Task 1 — Cool-down skip path
  // -------------------------------------------------------------------------
  describe('cool-down skip', () => {
    it('returns early without LLM call when within cool-down window', async () => {
      const recentlyAttempted = new Date(Date.now() - COOLDOWN_MS + 10_000);
      const subject = makeSubject({
        bookSuggestionsLastGenerationAttemptedAt: recentlyAttempted,
      });
      const { db, transactionMock } = makeDb(subject);

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('emits cooldown failure metric when skipping', async () => {
      const recentlyAttempted = new Date(Date.now() - COOLDOWN_MS + 5_000);
      const subject = makeSubject({
        bookSuggestionsLastGenerationAttemptedAt: recentlyAttempted,
      });
      const { db } = makeDb(subject);

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'cooldown' }),
      );
    });

    it('proceeds when cool-down has elapsed', async () => {
      // Just past the window — should enter transaction
      const longAgo = new Date(Date.now() - COOLDOWN_MS - 1_000);
      const subject = makeSubject({
        bookSuggestionsLastGenerationAttemptedAt: longAgo,
      });

      const { tx } = makeTx({
        unpicked: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      });
      const { db, transactionMock } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(transactionMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Task 3 — Language subject (four_strands) early return
  // -------------------------------------------------------------------------
  describe('four_strands pedagogy mode', () => {
    it('returns early without LLM call when pedagogyMode is four_strands', async () => {
      const subject = makeSubject({ pedagogyMode: 'four_strands' });
      const { db, transactionMock } = makeDb(subject);

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('emits language_subject failure metric', async () => {
      const subject = makeSubject({ pedagogyMode: 'four_strands' });
      const { db } = makeDb(subject);

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'language_subject' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // No subject early return
  // -------------------------------------------------------------------------
  describe('subject not found', () => {
    it('returns early without LLM call when subject is null', async () => {
      const { db, transactionMock } = makeDb(null);

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('emits no_subject failure metric', async () => {
      const { db } = makeDb(null);

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'no_subject' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Task 5 — Lock-loser path
  // -------------------------------------------------------------------------
  describe('advisory lock — lock loser', () => {
    it('does not call LLM when lock is not acquired', async () => {
      const subject = makeSubject();
      const { tx, mocks } = makeTx({ lockGot: false });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('emits lock_loser failure metric', async () => {
      const subject = makeSubject();
      const { tx } = makeTx({ lockGot: false });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'lock_loser' }),
      );
    });

    it('skips LLM and update when lock result rows array contains got: false', async () => {
      const subject = makeSubject();
      // Simulate lock result as plain array (alternative neon-serverless shape)
      const { tx } = makeTx({ lockGot: false });
      // Override execute to return array directly (not wrapped in .rows)
      (tx as never as { execute: jest.Mock }).execute = jest
        .fn<() => Promise<Array<{ got: boolean }>>>()
        .mockResolvedValue([{ got: false }]);

      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).not.toHaveBeenCalled();
    });

    it('throws when tx.execute returns an unexpected Drizzle result shape', async () => {
      const subject = makeSubject();
      const { tx } = makeTx({ lockGot: true });
      // Return a shape that is neither { rows: [...] } nor a plain array
      // — simulates a future Drizzle driver upgrade changing the result shape.
      (tx as never as { execute: jest.Mock }).execute = jest
        .fn<() => Promise<{ result: boolean }>>()
        .mockResolvedValue({ result: true });

      const { db } = makeDb(subject, async (cb) => cb(tx));

      await expect(
        generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID),
      ).rejects.toThrow(
        'pg_try_advisory_xact_lock returned an unexpected Drizzle result shape',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Unpicked count guard (≥4 → skip)
  // -------------------------------------------------------------------------
  describe('unpicked count guard', () => {
    it('skips LLM when 4 or more unpicked suggestions already exist', async () => {
      const subject = makeSubject();
      const { tx, mocks } = makeTx({
        unpicked: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('proceeds with LLM when fewer than 4 unpicked suggestions exist', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([makeSuggestion('New Book')]),
      );

      const { tx } = makeTx({
        unpicked: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Task 4 — Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('stamps cool-down BEFORE calling LLM, then inserts 4 suggestions', async () => {
      const subject = makeSubject();
      const callOrder: string[] = [];

      const suggestions = [
        makeSuggestion('Book A', 'related'),
        makeSuggestion('Book B', 'related'),
        makeSuggestion('Book C', 'explore'),
        makeSuggestion('Book D', 'explore'),
      ];
      routeAndCallMock.mockImplementation(async () => {
        callOrder.push('llm');
        return makeLlmResult(suggestions);
      });

      // Build tx with a custom update chain that records call order
      const { tx, mocks } = makeTx({});

      // Replace update().set().where() with one that records before resolving.
      // Using a standalone resolved-value mock avoids the recursive-call trap
      // that occurs when assigning mockImplementation back to the same mock ref.
      mocks.updateWhere.mockImplementation(async () => {
        callOrder.push('stamp');
      });

      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      // Cool-down stamp must come before LLM call
      expect(callOrder.indexOf('stamp')).toBeLessThan(callOrder.indexOf('llm'));

      // All 4 suggestions inserted
      expect(mocks.insertValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Book A', category: 'related' }),
          expect.objectContaining({ title: 'Book B', category: 'related' }),
          expect.objectContaining({ title: 'Book C', category: 'explore' }),
          expect.objectContaining({ title: 'Book D', category: 'explore' }),
        ]),
      );
      expect(mocks.insertValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ subjectId: SUBJECT_ID }),
        ]),
      );
    });

    it('calls routeAndCall with the expected message shape', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([makeSuggestion('History Basics')]),
      );

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
        2,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Task 6 — LLM failure emits metric and does not throw
  // -------------------------------------------------------------------------
  describe('LLM failure handling', () => {
    it('does not throw when routeAndCall rejects — returns classified outcome', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockRejectedValue(new Error('LLM network error'));

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await expect(
        generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID),
      ).resolves.toBe('network');
    });

    it('emits a structured metric via logger.warn on LLM rejection', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockRejectedValue(new Error('network timeout'));

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({
          metric: 'book_suggestion_generation_failed',
          profileId: PROFILE_ID,
          subjectId: SUBJECT_ID,
          reason: expect.stringMatching(/timeout|network|unknown/),
        }),
      );
    });

    it('does not insert when routeAndCall rejects', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockRejectedValue(new Error('quota exceeded'));

      const { tx, mocks } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('classifies quota errors as "quota"', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockRejectedValue(new Error('quota exceeded'));

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'quota' }),
      );
    });

    it('classifies timeout errors as "timeout"', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockRejectedValue(new Error('request timed out'));

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'timeout' }),
      );
    });

    it('emits "parse" metric when LLM returns invalid JSON structure', async () => {
      const subject = makeSubject();
      // Valid JSON but wrong shape — missing `suggestions` key
      routeAndCallMock.mockResolvedValue({
        response: JSON.stringify({ wrong_key: [] }),
      });

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(loggerWarnMock).toHaveBeenCalledWith(
        'book_suggestion_generation_failed',
        expect.objectContaining({ reason: 'parse' }),
      );
    });

    it('swallows unique constraint violations (23505) without rethrowing — treats race-loss as success', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([makeSuggestion('Unique Book')]),
      );

      const uniqueError = Object.assign(new Error('unique violation'), {
        code: '23505',
      });
      const { tx } = makeTx({ insertRejects: uniqueError });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      // A 23505 collision means a concurrent inserter beat us — the partial
      // unique index `(subject_id, lower(title)) WHERE picked_at IS NULL`
      // guarantees at least one suggestion landed for the user, so report
      // 'success' to the caller rather than a failure reason.
      await expect(
        generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID),
      ).resolves.toBe('success');
    });

    it('rethrows non-unique constraint DB errors', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([makeSuggestion('Some Book')]),
      );

      const dbError = Object.assign(new Error('connection lost'), {
        code: '08006',
      });
      const { tx } = makeTx({ insertRejects: dbError });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await expect(
        generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID),
      ).rejects.toThrow('connection lost');
    });
  });

  // -------------------------------------------------------------------------
  // Task 7 — Dedup against existing titles
  // -------------------------------------------------------------------------
  describe('dedup against existing titles (real areEquivalentBookTitles)', () => {
    it('filters out LLM suggestions equivalent to existing book titles', async () => {
      const subject = makeSubject();
      // LLM returns 4 suggestions, 2 are variants of existing titles
      const suggestions = [
        makeSuggestion('Ancient History Guide'), // duplicate of existing book
        makeSuggestion('Roman Empire Overview'), // duplicate of existing suggestion
        makeSuggestion('Greek Mythology'), // NEW
        makeSuggestion('Medieval Knights'), // NEW
      ];
      routeAndCallMock.mockResolvedValue(makeLlmResult(suggestions));

      const { tx, mocks } = makeTx({
        existingBookTitles: ['Ancient History Guide'], // exact match
        existingSuggestionTitles: ['Roman Empire Overview'], // exact match
      });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      // Only the 2 non-duplicate suggestions should be inserted
      expect(mocks.insertValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Greek Mythology' }),
          expect.objectContaining({ title: 'Medieval Knights' }),
        ]),
      );
      const insertedTitles = (
        mocks.insertValues.mock.calls[0] as Array<Array<{ title: string }>>
      )[0].map((s) => s.title);
      expect(insertedTitles).toHaveLength(2);
      expect(insertedTitles).not.toContain('Ancient History Guide');
      expect(insertedTitles).not.toContain('Roman Empire Overview');
    });

    it('does not insert anything when all LLM suggestions are duplicates', async () => {
      const subject = makeSubject();
      const suggestions = [
        makeSuggestion('Existing Book One'),
        makeSuggestion('Existing Book Two'),
      ];
      routeAndCallMock.mockResolvedValue(makeLlmResult(suggestions));

      const { tx, mocks } = makeTx({
        existingBookTitles: ['Existing Book One', 'Existing Book Two'],
      });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('uses case-insensitive equivalence matching (real areEquivalentBookTitles)', async () => {
      const subject = makeSubject();
      // Existing title is lowercase; LLM returns title-case version
      const suggestions = [
        makeSuggestion('Ancient Rome History'), // case-insensitive match
        makeSuggestion('Brand New Topic Here'), // genuinely new
      ];
      routeAndCallMock.mockResolvedValue(makeLlmResult(suggestions));

      const { tx, mocks } = makeTx({
        existingBookTitles: ['ancient rome history'],
      });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      const insertedTitles = (
        mocks.insertValues.mock.calls[0] as Array<Array<{ title: string }>>
      )[0].map((s) => s.title);
      expect(insertedTitles).not.toContain('Ancient Rome History');
      expect(insertedTitles).toContain('Brand New Topic Here');
    });
  });
});
