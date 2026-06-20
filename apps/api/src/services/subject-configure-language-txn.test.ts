// ---------------------------------------------------------------------------
// configureLanguageSubject — transactional atomicity regression
// ---------------------------------------------------------------------------
//
// [Notion P2 — subjects: configureLanguageSubject performs setNativeLanguage +
//  regenerateLanguageCurriculum without transaction]
//
// configureLanguageSubject performs two writes:
//   1. setNativeLanguage           (upsert teaching_preferences.native_language)
//   2. regenerateLanguageCurriculum (delete + reinsert the curriculum)
//
// If the SECOND write fails after the first commits, the subject is left
// half-configured: native language persisted but curriculum not regenerated.
// The fix wraps BOTH writes in a single db.transaction so a failure of the
// second rolls back the first — either both apply or neither does.
//
// This test exercises the REAL configureLanguageSubject (and the real scoped
// repository, setNativeLanguage and regenerateLanguageCurriculum) against a
// hand-built fake Database that faithfully models neon-serverless transaction
// semantics: writes issued inside a transaction are invisible until the
// transaction callback resolves, and are discarded if it throws. No internal
// module is jest.mock'd — the only thing injected is a boundary failure on the
// second write (the topic insert inside regenerateLanguageCurriculum), exactly
// the "request dies between the two writes" scenario the bug describes.

import { configureLanguageSubject } from './subject';
import type { Database } from '@eduagent/database';

const PROFILE_ID = 'profile-cfg-lang';
const SUBJECT_ID = 'subject-cfg-lang';
const NOW = new Date('2026-06-20T10:00:00.000Z');

const SUBJECT_ROW = {
  id: SUBJECT_ID,
  profileId: PROFILE_ID,
  name: 'Spanish',
  rawInput: null,
  status: 'active' as const,
  pedagogyMode: 'four_strands' as const,
  languageCode: 'es',
  createdAt: NOW,
  updatedAt: NOW,
  urgencyBoostUntil: null,
  urgencyBoostReason: null,
};

/**
 * A fake Database that models neon-serverless commit/rollback boundaries.
 *
 * - `committed` is durable, post-commit state.
 * - Writes issued while a transaction is open are buffered in `staged` and
 *   only flushed into `committed` when the transaction callback resolves.
 *   If the callback throws, `staged` is discarded (rollback).
 * - Writes issued with no open transaction flush straight to `committed`
 *   (autocommit), which is exactly why the un-transactioned bug leaks the
 *   first write.
 *
 * Only the writes configureLanguageSubject cares about are tracked. The
 * `failTopicInsert` flag makes the SECOND write (the curriculumTopics insert
 * inside regenerateLanguageCurriculum) throw at the true driver boundary.
 */
function createFakeDb(opts: { failTopicInsert: boolean }) {
  const committed = {
    nativeLanguage: undefined as string | null | undefined,
    nativeLanguageWritten: false,
    curriculumRegenerated: false,
  };
  // Per-transaction staging buffer. null when no transaction is open.
  let staged: null | {
    nativeLanguage?: string | null;
    nativeLanguageWritten?: boolean;
    curriculumRegenerated?: boolean;
  } = null;

  const flushTarget = () => (staged !== null ? staged : committed);

  function recordNativeLanguage(value: string | null) {
    const target = flushTarget();
    target.nativeLanguage = value;
    target.nativeLanguageWritten = true;
  }
  function recordCurriculumRegenerated() {
    flushTarget().curriculumRegenerated = true;
  }

  // teaching_preferences upsert chain (setNativeLanguage).
  function insert(table: { _: { name?: string } } & Record<string, unknown>) {
    const tableName: string =
      // drizzle pg tables expose the SQL name on a Symbol; fall back to a
      // structural probe so the fake does not depend on drizzle internals.
      (table as unknown as { [k: symbol]: unknown })[
        Symbol.for('drizzle:Name')
      ] as string;

    return {
      values(vals: Record<string, unknown>) {
        if (tableName === 'teaching_preferences') {
          // setNativeLanguage path: insert(...).onConflictDoUpdate(...)
          return {
            onConflictDoUpdate: async () => {
              recordNativeLanguage(
                (vals.nativeLanguage as string | null) ?? null,
              );
              return undefined;
            },
          };
        }
        if (tableName === 'curricula') {
          // regenerateLanguageCurriculum: insert(curricula).values(...).returning()
          return {
            returning: async () => [
              { id: 'curriculum-1', subjectId: SUBJECT_ID, version: 1 },
            ],
          };
        }
        if (tableName === 'curriculum_books') {
          // ensureDefaultBook: insert(curriculum_books).values(...).returning()
          return {
            returning: async () => [{ id: 'book-1', subjectId: SUBJECT_ID }],
          };
        }
        if (tableName === 'curriculum_topics') {
          // SECOND WRITE boundary — the topic insert. This is the realistic
          // failure point ("request dies between the two writes").
          if (opts.failTopicInsert) {
            return Promise.reject(
              new Error('simulated DB failure: curriculum_topics insert'),
            );
          }
          recordCurriculumRegenerated();
          return Promise.resolve(undefined);
        }
        // Any other table: accept and no-op.
        return {
          returning: async () => [],
          onConflictDoUpdate: async () => undefined,
        };
      },
    };
  }

  const db = {
    query: {
      subjects: {
        // getSubject (scoped repo) and the ownership checks inside
        // setNativeLanguage / regenerateLanguageCurriculum.
        findFirst: async () => SUBJECT_ROW,
        findMany: async () => [SUBJECT_ROW],
      },
      curriculumBooks: {
        // ensureDefaultBook: no existing sort-order-0 book.
        findFirst: async () => undefined,
      },
    },
    insert,
    delete: () => ({
      // regenerateLanguageCurriculum deletes old curricula before reinsert.
      where: async () => undefined,
    }),
    async transaction<T>(cb: (tx: Database) => Promise<T>): Promise<T> {
      // Open a fresh staging buffer for this transaction.
      const previous = staged;
      const buffer: NonNullable<typeof staged> = {};
      staged = buffer;
      try {
        // If `cb` throws, the flush block below is skipped — the staging
        // buffer is discarded (rollback). Only a clean resolve commits.
        const result = await cb(db as unknown as Database);
        // Commit: flush staged writes into committed state.
        if (buffer.nativeLanguageWritten) {
          committed.nativeLanguage = buffer.nativeLanguage;
          committed.nativeLanguageWritten = true;
        }
        if (buffer.curriculumRegenerated) {
          committed.curriculumRegenerated = true;
        }
        return result;
      } finally {
        staged = previous;
      }
    },
  };

  return { db: db as unknown as Database, committed };
}

describe('configureLanguageSubject atomicity', () => {
  it('rolls back the native-language write when curriculum regeneration fails', async () => {
    const { db, committed } = createFakeDb({ failTopicInsert: true });

    await expect(
      configureLanguageSubject(db, PROFILE_ID, SUBJECT_ID, {
        nativeLanguage: 'en',
        startingLevel: 'A1',
      }),
    ).rejects.toThrow(/curriculum_topics insert/);

    // Atomicity: because the second write failed, the first write
    // (setNativeLanguage) must NOT be durably committed. Pre-fix, the two
    // writes ran un-transactioned, so the native language autocommitted and
    // this assertion failed (RED).
    expect(committed.nativeLanguageWritten).toBe(false);
    expect(committed.nativeLanguage).toBeUndefined();
    expect(committed.curriculumRegenerated).toBe(false);
  });

  it('commits both writes when curriculum regeneration succeeds', async () => {
    const { db, committed } = createFakeDb({ failTopicInsert: false });

    const result = await configureLanguageSubject(db, PROFILE_ID, SUBJECT_ID, {
      nativeLanguage: 'en',
      startingLevel: 'A1',
    });

    expect(result.id).toBe(SUBJECT_ID);
    // Both writes are durably committed together.
    expect(committed.nativeLanguageWritten).toBe(true);
    expect(committed.nativeLanguage).toBe('en');
    expect(committed.curriculumRegenerated).toBe(true);
  });
});
