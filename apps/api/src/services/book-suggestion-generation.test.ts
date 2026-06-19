// ---------------------------------------------------------------------------
// Book Suggestion Generation — Unit Tests
// ---------------------------------------------------------------------------

import { jest } from '@jest/globals';

const routeAndCallMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('./llm' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => routeAndCallMock(...args),
  };
});

const loggerWarnMock = jest.fn<(...args: unknown[]) => void>();
jest.mock('./logger' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('./logger') as typeof import('./logger');
  return {
    ...actual,
    createLogger: () => ({
      warn: (...args: unknown[]) => loggerWarnMock(...args),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };
});

import {
  buildPrompt,
  extractBookSuggestionJson,
  generateCategorizedBookSuggestions,
  sanitizeBookSuggestionOutput,
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
  freshSubjectFound?: boolean;
  freshSubjectLastAttemptedAt?: Date | null;
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
    freshSubjectFound = true,
    freshSubjectLastAttemptedAt = null,
    unpicked = [],
    existingBookTitles = [],
    existingSuggestionTitles = [],
    studiedTopics = [],
    insertRejects,
  } = opts;

  // [WI-194] The service now invokes db.transaction() twice — once before
  // the LLM call (Phase 1: lock + reserve + read prompt inputs) and once
  // after (Phase 3: re-lock + re-check + insert). Phase 1 makes 5 select
  // calls; Phase 3 makes 1 select call (the unpicked re-check). All select
  // calls go through this single tx mock so we feed the script in order.
  //   1. Phase 1: fresh subject cooldown re-read
  //   2. Phase 1: unpicked bookSuggestions check
  //   3. Phase 1: existingBookTitles (curriculumBooks)
  //   4. Phase 1: existingSuggestionTitles (bookSuggestions)
  //   5. Phase 1: studiedTopics (learningSessions join chain)
  //   6. Phase 3: unpicked re-check
  const selectResults = [
    freshSubjectFound ? [{ lastAttemptedAt: freshSubjectLastAttemptedAt }] : [],
    unpicked,
    existingBookTitles.map((title) => ({ title })),
    existingSuggestionTitles.map((title) => ({ title })),
    studiedTopics.map((title) => ({ title, ts: new Date() })),
    unpicked,
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
    (chain as unknown as PromiseLike<unknown[]>).then = ((
      onFulfilled?: ((value: unknown[]) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected)) as PromiseLike<
      unknown[]
    >['then'];
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

  // [WI-77 M3] Insert chain now supports per-row
  //   tx.insert(table).values(row).onConflictDoNothing().returning({ id })
  // shape. The legacy bulk insert returning a Promise from `.values(rows)`
  // is no longer used. `values()` synchronously returns the builder, which
  // exposes `onConflictDoNothing()` -> the same builder, which exposes
  // `returning()` -> a Promise of inserted rows (default: one stub id).
  const returningMock = insertRejects
    ? jest
        .fn<() => Promise<Array<{ id: string }>>>()
        .mockRejectedValue(insertRejects)
    : jest
        .fn<() => Promise<Array<{ id: string }>>>()
        .mockResolvedValue([{ id: 'stub-suggestion-id' }]);
  const onConflictDoNothingMock = jest.fn().mockReturnValue({
    returning: returningMock,
  });
  const valuesMock = jest.fn().mockReturnValue({
    onConflictDoNothing: onConflictDoNothingMock,
    // Legacy callers awaiting `values(...)` directly are gone; this Promise
    // shape stays around as a soft fallback for any edge case.
    then: ((onFulfilled?: ((value: void) => unknown) | null) =>
      Promise.resolve(undefined).then(
        onFulfilled,
      )) as PromiseLike<void>['then'],
  });
  const insertChain = { values: valuesMock };
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
  // [WI-194] The service now calls db.transaction() twice — Phase 1 (lock +
  // reserve + read prompt inputs) and Phase 3 (re-lock + re-check + insert).
  // The same `tx` mock services both calls; its scripted select results
  // include entries for both phases (see makeTx).
  const transactionMock =
    txCallback != null
      ? jest.fn<typeof txCallback>().mockImplementation(txCallback)
      : jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  // [BUG-861] db.update() is called directly (outside any transaction) to
  // reset the cooldown stamp on transient LLM failures. Expose it so tests
  // can assert on it.
  const dbUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const dbUpdateMock = jest.fn().mockReturnValue(dbUpdateChain);

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
      update: dbUpdateMock,
    } as never,
    transactionMock,
    dbUpdateMock,
    dbUpdateChain,
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

    it('re-checks cooldown after acquiring the lock before calling the LLM', async () => {
      const staleInitialRead = new Date(Date.now() - COOLDOWN_MS - 1_000);
      const freshLockedRead = new Date(Date.now() - COOLDOWN_MS + 10_000);
      const subject = makeSubject({
        bookSuggestionsLastGenerationAttemptedAt: staleInitialRead,
      });
      const { tx, mocks } = makeTx({
        freshSubjectLastAttemptedAt: freshLockedRead,
      });
      const { db } = makeDb(subject, async (cb) => cb(tx));

      const outcome = await generateCategorizedBookSuggestions(
        db,
        PROFILE_ID,
        SUBJECT_ID,
      );

      expect(outcome).toBe('cooldown');
      expect(routeAndCallMock).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
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
  // Language subjects
  // -------------------------------------------------------------------------
  describe('four_strands pedagogy mode', () => {
    it('generates language-aware suggestions instead of skipping the picker', async () => {
      const subject = makeSubject({
        name: 'French',
        pedagogyMode: 'four_strands',
        languageCode: 'fr',
      });
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([makeSuggestion('Travel Conversations')]),
      );

      const { tx, mocks } = makeTx({});
      const { db, transactionMock } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(transactionMock).toHaveBeenCalled();
      expect(routeAndCallMock).toHaveBeenCalled();
      const [messages] = routeAndCallMock.mock.calls[0]!;
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining(
              'The subject is a language-learning subject',
            ),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining(
              '<target_language>French</target_language>',
            ),
          }),
        ]),
      );
      const insertedRows = mocks.insertValues.mock.calls.map(
        (call) => call[0] as { title: string },
      );
      expect(insertedRows.map((r) => r.title)).toContain(
        'Travel Conversations',
      );
    });

    it('uses the subject name as target language when the code is outside the local catalog', async () => {
      const subject = makeSubject({
        name: 'English',
        pedagogyMode: 'four_strands',
        languageCode: 'en',
      });
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([makeSuggestion('Everyday Speaking')]),
      );

      const { tx } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      const messages = routeAndCallMock.mock.calls[0]![0] as Array<{
        content: string;
      }>;
      expect(messages[0]?.content).toContain('The learner is studying English');
      expect(messages[1]?.content).toContain(
        '<target_language>English</target_language>',
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

      // All 4 suggestions inserted — [WI-77 M3] per-row inserts, one call each.
      const insertedRows = mocks.insertValues.mock.calls.map(
        (call) =>
          call[0] as { title: string; category: string; subjectId: string },
      );
      expect(insertedRows.map((r) => r.title)).toEqual(
        expect.arrayContaining(['Book A', 'Book B', 'Book C', 'Book D']),
      );
      expect(insertedRows.every((r) => r.subjectId === SUBJECT_ID)).toBe(true);
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
        expect.objectContaining({
          flow: 'book.suggestion',
          responseFormat: 'json',
        }),
      );
    });

    it('retries malformed JSON once and inserts the repaired sanitized suggestions', async () => {
      const subject = makeSubject();
      routeAndCallMock
        .mockResolvedValueOnce({
          response:
            '{"suggestions":[{"title":"Broken","description":"x","emoji":"📚","category":"explore"}], essel',
        })
        .mockResolvedValueOnce(
          makeLlmResult([
            {
              title: 'Evidence and Causes',
              description:
                'Compare causes in 1914, the early 20th century, and 80% claims through evidence.',
              emoji: '📚',
              category: 'explore',
            },
          ]),
        );

      const { tx, mocks } = makeTx({});
      const { db } = makeDb(subject, async (cb) => cb(tx));

      await generateCategorizedBookSuggestions(db, PROFILE_ID, SUBJECT_ID);

      expect(routeAndCallMock).toHaveBeenCalledTimes(2);
      const retryMessages = routeAndCallMock.mock.calls[1]?.[0] as Array<{
        content: string;
      }>;
      expect(retryMessages[retryMessages.length - 1]?.content).toContain(
        'previous response failed validation',
      );
      const insertedRows = mocks.insertValues.mock.calls.map(
        (call) => call[0] as { title: string; description: string },
      );
      expect(insertedRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Evidence and Causes',
            description: expect.not.stringMatching(
              /1914|early 20th century|80%/,
            ),
          }),
        ]),
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

    // -------------------------------------------------------------------------
    // [BUG-861] Transient LLM failure must reset cooldown stamp to NULL
    // -------------------------------------------------------------------------
    describe('[BUG-861] cooldown stamp reset on transient failures', () => {
      it('resets bookSuggestionsLastGenerationAttemptedAt to null on network error', async () => {
        const subject = makeSubject();
        routeAndCallMock.mockRejectedValue(new Error('fetch failed'));

        const { tx } = makeTx({});
        const { db, dbUpdateMock, dbUpdateChain } = makeDb(
          subject,
          async (cb) => cb(tx),
        );

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        expect(outcome).toBe('network');
        // The reset must have been called: db.update(subjects).set({...null...}).where(...)
        expect(dbUpdateMock).toHaveBeenCalledTimes(1);
        expect(dbUpdateChain.set).toHaveBeenCalledWith(
          expect.objectContaining({
            bookSuggestionsLastGenerationAttemptedAt: null,
          }),
        );
        expect(dbUpdateChain.where).toHaveBeenCalledTimes(1);
      });

      it('resets cooldown on timeout error', async () => {
        const subject = makeSubject();
        routeAndCallMock.mockRejectedValue(new Error('request timed out'));

        const { tx } = makeTx({});
        const { db, dbUpdateMock } = makeDb(subject, async (cb) => cb(tx));

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        expect(outcome).toBe('timeout');
        expect(dbUpdateMock).toHaveBeenCalledTimes(1);
      });

      it('resets cooldown on quota error', async () => {
        const subject = makeSubject();
        routeAndCallMock.mockRejectedValue(new Error('quota exceeded'));

        const { tx } = makeTx({});
        const { db, dbUpdateMock } = makeDb(subject, async (cb) => cb(tx));

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        expect(outcome).toBe('quota');
        expect(dbUpdateMock).toHaveBeenCalledTimes(1);
      });

      it('resets cooldown on unknown error', async () => {
        const subject = makeSubject();
        routeAndCallMock.mockRejectedValue(new Error('something unexpected'));

        const { tx } = makeTx({});
        const { db, dbUpdateMock } = makeDb(subject, async (cb) => cb(tx));

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        expect(outcome).toBe('unknown');
        expect(dbUpdateMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT reset cooldown on parse error (deterministic — retry won\'t help)', async () => {
        const subject = makeSubject();
        // Valid JSON but wrong shape — missing `suggestions` key; triggers 'parse' outcome
        routeAndCallMock.mockResolvedValue({
          response: JSON.stringify({ wrong_key: [] }),
        });

        const { tx } = makeTx({});
        const { db, dbUpdateMock } = makeDb(subject, async (cb) => cb(tx));

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        expect(outcome).toBe('parse');
        // No cooldown reset — deterministic failure; stamp must stay
        expect(dbUpdateMock).not.toHaveBeenCalled();
      });

      it('does NOT reset cooldown on all_filtered (deterministic — LLM ran, no new content)', async () => {
        const subject = makeSubject();
        // All suggestions are duplicates — triggers 'all_filtered' outcome
        routeAndCallMock.mockResolvedValue(
          makeLlmResult([makeSuggestion('Existing Book One')]),
        );

        const { tx } = makeTx({
          existingBookTitles: ['Existing Book One'],
        });
        const { db, dbUpdateMock } = makeDb(subject, async (cb) => cb(tx));

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        expect(outcome).toBe('all_filtered');
        // No cooldown reset — deterministic failure; stamp must stay
        expect(dbUpdateMock).not.toHaveBeenCalled();
      });

      it('still returns the classified outcome even if the reset db.update() itself throws', async () => {
        const subject = makeSubject();
        routeAndCallMock.mockRejectedValue(new Error('fetch failed'));

        const { tx } = makeTx({});
        const { db, dbUpdateChain } = makeDb(subject, async (cb) => cb(tx));
        // Simulate the reset failing (e.g. DB connection dropped)
        dbUpdateChain.where.mockRejectedValue(new Error('DB connection lost'));

        const outcome = await generateCategorizedBookSuggestions(
          db,
          PROFILE_ID,
          SUBJECT_ID,
        );

        // Must still return the primary failure reason; the reset error is swallowed
        expect(outcome).toBe('network');
      });
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

      // Only the 2 non-duplicate suggestions should be inserted — [WI-77 M3]
      // per-row insertion means one insertValues call per row.
      const insertedTitles = mocks.insertValues.mock.calls.map(
        (call) => (call[0] as { title: string }).title,
      );
      expect(insertedTitles).toHaveLength(2);
      expect(insertedTitles).toEqual(
        expect.arrayContaining(['Greek Mythology', 'Medieval Knights']),
      );
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

      const insertedTitles = mocks.insertValues.mock.calls.map(
        (call) => (call[0] as { title: string }).title,
      );
      expect(insertedTitles).not.toContain('Ancient Rome History');
      expect(insertedTitles).toContain('Brand New Topic Here');
    });

    // [WI-77 M3] Per-row insert with onConflictDoNothing: when a colliding
    // row appears alongside non-colliding rows, the previous bulk-insert
    // would drop the entire batch. The per-row pattern inserts the
    // non-colliders and silently skips the collider.
    it('[WI-77 M3] continues inserting non-colliding rows when one row hits a unique constraint', async () => {
      const subject = makeSubject();
      routeAndCallMock.mockResolvedValue(
        makeLlmResult([
          makeSuggestion('Already In DB'),
          makeSuggestion('Brand New One'),
          makeSuggestion('Brand New Two'),
          makeSuggestion('Brand New Three'),
        ]),
      );

      const { tx, mocks } = makeTx({});
      // Simulate the first insert hitting onConflictDoNothing (returns []),
      // the rest succeed (returns [{id}]).
      const returningMockA = jest
        .fn<() => Promise<Array<{ id: string }>>>()
        .mockResolvedValueOnce([]) // collided -> no rows returned
        .mockResolvedValueOnce([{ id: 'b' }])
        .mockResolvedValueOnce([{ id: 'c' }])
        .mockResolvedValueOnce([{ id: 'd' }]);
      const onConflictMock = jest
        .fn()
        .mockReturnValue({ returning: returningMockA });
      // Re-wire the values mock to use the per-call returning mock.
      (mocks.insertValues as jest.Mock).mockReturnValue({
        onConflictDoNothing: onConflictMock,
        then: ((onFulfilled?: (v: void) => unknown) =>
          Promise.resolve(undefined).then(
            onFulfilled,
          )) as PromiseLike<void>['then'],
      });

      const { db } = makeDb(subject, async (cb) => cb(tx));

      const result = await generateCategorizedBookSuggestions(
        db,
        PROFILE_ID,
        SUBJECT_ID,
      );

      // Result is still 'success' — the LLM call legitimately ran, dedup
      // contract was met (the collider already exists), and 3 new rows
      // landed.
      expect(result).toBe('success');
      // All 4 values() calls fired (one per candidate row); each was followed
      // by onConflictDoNothing(). The legacy bulk-insert would have made
      // exactly one .values() call with an array.
      expect((mocks.insertValues as jest.Mock).mock.calls).toHaveLength(4);
      expect(onConflictMock).toHaveBeenCalledTimes(4);
    });
  });
});

describe('buildPrompt', () => {
  it('asks suggestion descriptions to stay source-neutral and non-tiny', () => {
    const messages = buildPrompt({
      subjectName: 'History',
      existingBookTitles: ['Causes of World War I'],
      existingSuggestionTitles: ['Tiny War Facts'],
      studiedTopics: ['Alliances', 'Militarism'],
    });
    const system = String(messages[0]?.content ?? '');

    expect(system).toContain('source-neutral learning objectives');
    expect(system).toContain('Do not include precise dates, years');
    expect(system).toContain('early 20th century');
    expect(system).toContain('Avoid tiny/novelty/remedial shelves');
  });

  it('asks Four Strands language suggestions to cover all strands visibly', () => {
    const messages = buildPrompt({
      subjectName: 'French Four Strands practice',
      languageName: 'French',
      existingBookTitles: ['Basic Greetings'],
      existingSuggestionTitles: ['Vocabulary Flashcards'],
      studiedTopics: [
        'Useful input',
        'Meaning-focused output',
        'Language-focused learning',
        'Fluency practice',
      ],
    });
    const system = String(messages[0]?.content ?? '');
    const user = String(messages[1]?.content ?? '');

    expect(system).toContain('make the set visibly cover all four strands');
    expect(system).toContain('meaning-focused input');
    expect(system).toContain('language-focused learning/form');
    expect(system).toContain('fluency suggestion should use words');
    expect(user).toContain('<target_language>French</target_language>');
  });
});

describe('sanitizeBookSuggestionOutput', () => {
  it('removes precise source-specific details from descriptions', () => {
    const sanitized = sanitizeBookSuggestionOutput({
      suggestions: [
        {
          title: 'Compare Evidence',
          description:
            'Look at 1914, early 20th century arguments, and 80% statistics.',
          emoji: '📚',
          category: 'explore',
        },
      ],
    });

    expect(sanitized.suggestions[0]?.description).not.toMatch(
      /1914|early 20th century|80%/,
    );
    expect(sanitized.suggestions[0]?.description).toContain(
      'the period being studied',
    );
  });
});

describe('extractBookSuggestionJson', () => {
  it('repairs provider-inserted prose after category fields', () => {
    const parsed = extractBookSuggestionJson(`{
      "suggestions": [
        {
          "title": "Everyday Conversations",
          "description": "Practice listening and speaking.",
          "emoji": "🎧",
          "category": "related"
          Cohort 'related' means this builds on studied topics.
        }
      ]
    }`);

    expect(parsed).toEqual({
      suggestions: [
        {
          title: 'Everyday Conversations',
          description: 'Practice listening and speaking.',
          emoji: '🎧',
          category: 'related',
        },
      ],
    });
  });

  // [BUG-461] BREAK TEST: extractor returns ONLY the first object when the LLM
  // returns two JSON blocks separated by prose. Greedy /\{[\s\S]*\}/ would
  // concatenate both blocks into an ill-formed string.
  it('[BUG-461] returns ONLY the first JSON object when two blocks are separated by prose', () => {
    const first = JSON.stringify({
      suggestions: [
        { title: 'First', description: 'A', emoji: '📚', category: 'related' },
      ],
    });
    const second = JSON.stringify({
      suggestions: [
        { title: 'Second', description: 'B', emoji: '📖', category: 'explore' },
      ],
    });
    const response = `Here are the suggestions: ${first} Additionally, an alternative set: ${second}`;

    const parsed = extractBookSuggestionJson(response) as {
      suggestions: Array<{ title: string }>;
    };

    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0]?.title).toBe('First');
  });

  // [BUG-482] BREAK TEST: a `}` inside a description field must NOT be treated as
  // the closing brace of the outer object. The old greedy /\{[\s\S]*\}/ regex
  // stops at that inner `}`, producing a truncated string that fails JSON.parse
  // and falls into the repair path — which then strips everything after `category`
  // including the closing `}` of each suggestion and the outer `}`. The result:
  // the `category` field is present but the entire JSON is malformed (no closing
  // braces), so parse still fails and the call throws. With extractFirstJsonObject
  // the brace-depth walker skips `}` inside string literals, so all fields survive.
  it('[BUG-482] extracts all fields including category when description contains a closing brace', () => {
    const response = [
      '```json',
      '{"book": "X", "description": "Sequel to Q&A}", "category": "fiction"}',
      '```',
    ].join('\n');

    const parsed = extractBookSuggestionJson(response) as {
      book: string;
      description: string;
      category: string;
    };

    expect(parsed.book).toBe('X');
    expect(parsed.description).toBe('Sequel to Q&A}');
    expect(parsed.category).toBe('fiction');
  });

  it('[BUG-461] handles JSON inside markdown code fences', () => {
    const response = [
      'Sure, here are the book suggestions:',
      '```json',
      '{"suggestions":[{"title":"Fenced Book","description":"Wrapped in fences.","emoji":"📚","category":"explore"}]}',
      '```',
    ].join('\n');

    const parsed = extractBookSuggestionJson(response) as {
      suggestions: Array<{ title: string }>;
    };

    expect(parsed.suggestions[0]?.title).toBe('Fenced Book');
  });
});
