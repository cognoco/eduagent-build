import type { Database } from '@eduagent/database';
import { LearningSessionNotFoundError } from '@eduagent/schemas';
import { recordSpeakingPracticeAttempt } from './attempt';

// ---------------------------------------------------------------------------
// WI-1777 Phase-4 rework (SHOULD_FIX): cross-subject session mismatch.
// No jest.mock of internal modules (GC1/GC6) — only a duck-typed db stub,
// following profile.test.ts / session-exchange.test.ts's conventions.
// ---------------------------------------------------------------------------

const PROFILE_ID = 'profile-wi1777';
const SUBJECT_ID = 'subject-a-wi1777';
const SESSION_ID = 'session-b-wi1777';

/**
 * Walks a drizzle SQL condition node and returns all text fragments joined.
 * Handles drizzle's internal structure:
 *   - { name: string }          — column reference (e.g. "subject_id")
 *   - { value: string[] }       — SQL literal array
 *   - { queryChunks: unknown[] }— recursive condition node
 *   - string                    — raw string chunk
 * Uses a visited set to avoid circular reference stack overflows.
 * (Copied from profile.test.ts — no shared test-util for this exists yet.)
 */
function drizzleConditionToText(
  node: unknown,
  visited = new Set<object>(),
  depth = 0,
): string {
  if (depth > 20) return '';
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node.toLowerCase();
  if (typeof node !== 'object') return '';
  if (visited.has(node as object)) return '';
  visited.add(node as object);

  const obj = node as Record<string, unknown>;

  if (typeof obj['name'] === 'string') {
    return obj['name'].toLowerCase();
  }

  if (Array.isArray(obj['value'])) {
    return (obj['value'] as unknown[])
      .map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
      .join('');
  }

  if (Array.isArray(obj['queryChunks'])) {
    return (obj['queryChunks'] as unknown[])
      .map((chunk) => drizzleConditionToText(chunk, visited, depth + 1))
      .join(' ');
  }

  return '';
}

describe('recordSpeakingPracticeAttempt — cross-subject session mismatch (WI-1777 SHOULD_FIX)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws LearningSessionNotFoundError when sessionId belongs to a different subject than the input subjectId, even though the profile owns both independently', async () => {
    const subjectsFindFirst = jest
      .fn()
      .mockResolvedValue({ id: SUBJECT_ID, profileId: PROFILE_ID });
    // The profile independently owns SESSION_ID (it exists, scoped to
    // PROFILE_ID) — but it belongs to OTHER_SUBJECT_ID, not SUBJECT_ID. A
    // real DB would find no row matching id + subject_id + profile_id
    // together, so the stub returns undefined to model that outcome.
    const learningSessionsFindFirst = jest.fn().mockResolvedValue(undefined);

    const db = {
      query: {
        subjects: { findFirst: subjectsFindFirst },
        learningSessions: { findFirst: learningSessionsFindFirst },
      },
    } as unknown as Database;

    await expect(
      recordSpeakingPracticeAttempt(db, PROFILE_ID, {
        sessionId: SESSION_ID,
        subjectId: SUBJECT_ID,
        mode: 'repeat_after_me',
        targetText: 'I would like a cup of tea.',
        transcript: 'I like cup tea',
        locale: 'en-US',
      }),
    ).rejects.toThrow(LearningSessionNotFoundError);

    // Confirm the rejection is actually enforced by the query — not an
    // accident of the stub — by asserting the session lookup's WHERE clause
    // references subject_id, not just id/profile_id.
    expect(learningSessionsFindFirst).toHaveBeenCalledTimes(1);
    const [{ where }] = learningSessionsFindFirst.mock.calls[0] as [
      { where: unknown },
    ];
    const whereText = drizzleConditionToText(where);
    expect(whereText).toContain('subject_id');
  });
});

// ---------------------------------------------------------------------------
// WI-1777 review rework (SHOULD_FIX): countByTarget-then-insert race on
// attemptNumber. Two concurrent submits for the same (profile, session,
// targetText) can both read the same prior count and both try to insert the
// same attemptNumber; the unique constraint added to the migration makes the
// losing insert a no-op (onConflictDoNothing) instead of a thrown error, and
// attempt.ts retries with a re-derived count. These tests duck-type the raw
// `db.select`/`db.insert`/`db.transaction` calls that createScopedRepository
// makes (no jest.mock of internal modules — GC1/GC6) so the retry can be
// driven deterministically instead of relying on real concurrent timing.
// ---------------------------------------------------------------------------
describe('recordSpeakingPracticeAttempt — attemptNumber conflict retry (WI-1777 SHOULD_FIX)', () => {
  function makeFakeDb(
    insertResults: Array<{ attemptNumber: number } | undefined>,
  ) {
    const insertedAttemptNumbers: number[] = [];
    let insertCallIndex = 0;
    // Rows "visible" to countByTarget — bumped after every insert attempt,
    // whether it's our own row landing or a conflict (which, per
    // onConflictDoNothing semantics, means a concurrent submit's row landed
    // instead). Either way there's one more row at the (session, target) pair
    // by the time the next countByTarget call runs.
    let visibleCount = 0;

    const fakeDb = {
      query: {
        subjects: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: SUBJECT_ID, profileId: PROFILE_ID }),
        },
        learningSessions: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: SESSION_ID, subjectId: SUBJECT_ID }),
        },
      },
      transaction: async (cb: (tx: unknown) => unknown) => cb(fakeDb),
      select: () => ({
        from: () => ({
          where: async () => [{ count: String(visibleCount) }],
        }),
      }),
      insert: () => ({
        values: (v: { attemptNumber: number }) => {
          insertedAttemptNumbers.push(v.attemptNumber);
          return {
            onConflictDoNothing: () => ({
              returning: async () => {
                const result = insertResults[insertCallIndex];
                insertCallIndex += 1;
                visibleCount += 1;
                return result ? [result] : [];
              },
            }),
          };
        },
      }),
    };
    return { fakeDb, insertedAttemptNumbers };
  }

  it('retries with a re-derived attemptNumber when the first insert loses the race', async () => {
    const { fakeDb, insertedAttemptNumbers } = makeFakeDb([
      undefined, // lost the race for attemptNumber 1
      { attemptNumber: 2 },
    ]);

    const response = await recordSpeakingPracticeAttempt(
      fakeDb as unknown as Database,
      PROFILE_ID,
      {
        sessionId: SESSION_ID,
        subjectId: SUBJECT_ID,
        mode: 'repeat_after_me',
        targetText: 'I would like a cup of tea.',
        transcript: 'I like cup tea',
        locale: 'en-US',
      },
    );

    expect(response.attemptNumber).toBe(2);
    // Proves the retry re-derived attemptNumber (1, then 2) rather than
    // silently reusing the slot that just lost the race.
    expect(insertedAttemptNumbers).toEqual([1, 2]);
  });

  it('throws once every retry loses the race, instead of silently returning a corrupted result', async () => {
    const { fakeDb, insertedAttemptNumbers } = makeFakeDb([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    await expect(
      recordSpeakingPracticeAttempt(fakeDb as unknown as Database, PROFILE_ID, {
        sessionId: SESSION_ID,
        subjectId: SUBJECT_ID,
        mode: 'repeat_after_me',
        targetText: 'I would like a cup of tea.',
        transcript: 'I like cup tea',
        locale: 'en-US',
      }),
    ).rejects.toThrow(/exhausted/i);

    expect(insertedAttemptNumbers).toHaveLength(5);
  });
});
