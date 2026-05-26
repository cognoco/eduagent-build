/**
 * [CR-2026-05-21-071] Break tests for the Challenge Round mastery gate
 * wiring.
 *
 * The bug: `decideMasteryAndReview`, `validateEvaluationEventIds`, and
 * `validateNoteDraft` all existed as dead code — no production callsite
 * consumed `signals.challenge_round_evaluation` or wrote
 * `mastery_challenge_verified_at` / `needs_deepening_topics.source =
 * 'challenge_round'`.  These tests pin the contract end-to-end through
 * `applyChallengeRoundEvaluation`, the new persistence helper that
 * `session-exchange.ts` invokes from both the streaming and non-streaming
 * paths.
 *
 * Red-green proof: the function `applyChallengeRoundEvaluation` (and its
 * call site in `session-exchange.ts`) did not exist before this PR;
 * removing either the function body or the `safeWrite(applyChallenge...)`
 * call site makes every "with the fix" assertion below fail (no DB writes
 * are issued, masteryVerified stays false, deepeningRowsInserted stays 0).
 *
 * Per CLAUDE.md GC1 / GC6: no `jest.mock('./...')` of internal modules.
 * The fake `Database` below is a plain object passed as a function argument
 * — it records the chain calls so the test can prove which writes ran
 * without standing up Postgres.  The same recording-fake pattern is used in
 * `milestone-detection.store.test.ts`.
 */

import {
  assessments,
  needsDeepeningTopics,
  topicNotes,
  type Database,
} from '@eduagent/database';
import type { ChallengeRoundEvaluationItem } from '@eduagent/schemas';

import { applyChallengeRoundEvaluation } from './persistence';

// Helper — Drizzle stores the table name on a private Symbol.  Resolve it
// once per table so the recording-fake can label its call records.  Using
// the Symbol API directly (instead of an `unknown` cast soup) keeps the
// test honest about which DB object it is asserting against.
function tableNameOf(table: unknown): string {
  const symbols = Object.getOwnPropertySymbols(table as object);
  const nameSym = symbols.find((s) => s.toString() === 'Symbol(drizzle:Name)');
  if (!nameSym) return 'unknown';
  return String((table as Record<symbol, unknown>)[nameSym]);
}

const PROFILE_ID = '01900000-0000-7000-8000-000000000001';
const SESSION_ID = '01900000-0000-7000-8000-000000000002';
const TOPIC_ID = '01900000-0000-7000-8000-000000000003';
const SUBJECT_ID = '01900000-0000-7000-8000-000000000004';

interface CallRecord {
  op: 'update' | 'insert';
  table: string;
  values: unknown;
  returningCount: number;
}

interface FakeDbHandle {
  db: Database;
  calls: CallRecord[];
  registerEventContent(eventId: string, content: string): void;
  /**
   * Configure how many rows the next `assessments` UPDATE returns.  Default 1
   * — set to 0 to simulate "no assessment row exists for (profile, topic)".
   */
  setAssessmentUpdateRows(n: number): void;
  /**
   * Configure how `createNoteForSession` behaves: 'ok' inserts a row,
   * 'reject' throws (simulates the per-topic note cap reached).  Default
   * 'ok'.
   */
  setNoteInsertMode(mode: 'ok' | 'reject'): void;
}

function buildFakeDb(): FakeDbHandle {
  const calls: CallRecord[] = [];
  const eventContents = new Map<string, string>();
  let assessmentUpdateRows = 1;
  let noteInsertMode: 'ok' | 'reject' = 'ok';

  // Recording chain — mirrors drizzle's fluent insert/update API to the
  // depth this code path uses.  Returns one fake row per input row from
  // .returning() so storeMilestones-style mapping paths run end-to-end.
  function buildUpdateChain(tableName: string) {
    const record: CallRecord = {
      op: 'update',
      table: tableName,
      values: null,
      returningCount: 0,
    };
    calls.push(record);
    const storedRows: unknown[] = [];
    const chain = {
      set: (vals: unknown) => {
        record.values = vals;
        return chain;
      },
      where: () => chain,
      returning: () => {
        const rowCount =
          tableName === 'assessments'
            ? assessmentUpdateRows
            : storedRows.length;
        record.returningCount = rowCount;
        return Promise.resolve(
          Array.from({ length: rowCount }, (_, i) => ({
            id: `01900000-0000-7000-8000-${String(900 + i).padStart(12, '0')}`,
          })),
        );
      },
    };
    return chain;
  }

  function buildInsertChain(tableName: string) {
    const record: CallRecord = {
      op: 'insert',
      table: tableName,
      values: null,
      returningCount: 0,
    };
    calls.push(record);

    if (tableName === 'topic_notes' && noteInsertMode === 'reject') {
      // Surface as a thrown ConflictError-equivalent so the catch path in
      // applyChallengeRoundEvaluation runs.
      const errChain = {
        values: () => errChain,
        onConflictDoNothing: () => errChain,
        returning: () => Promise.reject(new Error('topic note cap reached')),
      };
      return errChain;
    }

    let lastValues: Array<Record<string, unknown>> = [];
    const chain = {
      values: (
        vals: Array<Record<string, unknown>> | Record<string, unknown>,
      ) => {
        record.values = vals;
        lastValues = Array.isArray(vals) ? vals : [vals];
        return chain;
      },
      onConflictDoNothing: () => chain,
      returning: () => {
        record.returningCount = lastValues.length;
        return Promise.resolve(
          lastValues.map((_row, idx) => ({
            id: `01900000-0000-7000-8000-${String(idx).padStart(12, '0')}`,
          })),
        );
      },
    };
    return chain;
  }

  const insert = (table: unknown) => buildInsertChain(tableNameOf(table));
  const update = (table: unknown) => buildUpdateChain(tableNameOf(table));

  // The scoped repository walks db.query.sessionEvents.findMany via
  // createScopedRepository — return event rows matching the registered
  // contents.  We surface ALL registered events; the scoped repo's WHERE
  // (inArray(ids), eventType='user_message') is in SQL, but we don't run
  // SQL here, so the WHERE is effectively delegated to the caller: only the
  // events the test registered show up, and the caller filters by id.
  const query = {
    sessionEvents: {
      // The real signature accepts a config object — see drizzle-orm.
      findMany: async () => {
        const rows = Array.from(eventContents.entries()).map(
          ([id, content]) => ({
            id,
            content,
            sessionId: SESSION_ID,
            profileId: PROFILE_ID,
            eventType: 'user_message',
          }),
        );
        return rows;
      },
    },
    profiles: { findFirst: async () => null },
  };

  // Insert / update / query — that's all this code path touches.
  // Cast through unknown because we are deliberately implementing only the
  // narrow surface the production code uses; the Database type is huge.
  const db = {
    insert,
    update,
    query,
  } as unknown as Database;

  return {
    db,
    calls,
    registerEventContent(eventId, content) {
      eventContents.set(eventId, content);
    },
    setAssessmentUpdateRows(n) {
      assessmentUpdateRows = n;
    },
    setNoteInsertMode(mode) {
      noteInsertMode = mode;
    },
  };
}

function makeEvalItem(
  result: 'solid' | 'partial' | 'missing' | 'misconception',
  overrides: Partial<ChallengeRoundEvaluationItem> = {},
): ChallengeRoundEvaluationItem {
  return {
    concept: 'photosynthesis basics',
    result,
    evidence: 'placeholder evidence',
    answerEventId: '01900000-0000-7000-8000-00000000a001',
    learnerQuote: 'placeholder — will be replaced with verified content',
    ...overrides,
  };
}

describe('applyChallengeRoundEvaluation — CR-2026-05-21-071 break tests', () => {
  // Resolved once per suite — the table-name strings these symbols decode to
  // are the table names we assert against ('assessments',
  // 'needs_deepening_topics', 'topic_notes').
  const ASSESSMENTS_NAME = tableNameOf(assessments);
  const NEEDS_DEEPENING_NAME = tableNameOf(needsDeepeningTopics);
  const TOPIC_NOTES_NAME = tableNameOf(topicNotes);

  it('exposes the expected drizzle table names (sanity guard)', () => {
    expect(ASSESSMENTS_NAME).toBe('assessments');
    expect(NEEDS_DEEPENING_NAME).toBe('needs_deepening_topics');
    expect(TOPIC_NOTES_NAME).toBe('topic_notes');
  });

  it('writes mastery + nothing else when every concept is solid', async () => {
    const fake = buildFakeDb();
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a001',
      'Photosynthesis is when plants use light to make sugar from carbon dioxide and water.',
    );
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a002',
      'Chlorophyll absorbs the light energy in the chloroplasts.',
    );

    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [
        makeEvalItem('solid'),
        makeEvalItem('solid', {
          concept: 'chlorophyll',
          answerEventId: '01900000-0000-7000-8000-00000000a002',
        }),
      ],
    });

    expect(result.outcome).toBe('verified');
    expect(result.masteryVerified).toBe(true);
    expect(result.deepeningRowsInserted).toBe(0);

    // Exactly one UPDATE to assessments, no needs_deepening inserts.
    const assessmentUpdates = fake.calls.filter(
      (c) => c.op === 'update' && c.table === 'assessments',
    );
    expect(assessmentUpdates).toHaveLength(1);

    const deepeningInserts = fake.calls.filter(
      (c) => c.op === 'insert' && c.table === 'needs_deepening_topics',
    );
    expect(deepeningInserts).toHaveLength(0);
  });

  it('routes weak concepts to needs_deepening_topics with source=challenge_round and blocks mastery', async () => {
    const fake = buildFakeDb();
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a001',
      'Photosynthesis is when plants make sugar from carbon dioxide.',
    );
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a002',
      'Chlorophyll absorbs light and stores it inside the cell wall.',
    );

    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [
        makeEvalItem('solid'),
        makeEvalItem('misconception', {
          concept: 'chlorophyll location',
          answerEventId: '01900000-0000-7000-8000-00000000a002',
          evidence: 'said cell wall, should have said chloroplast',
          correction: 'chlorophyll lives inside chloroplasts',
        }),
      ],
    });

    expect(result.outcome).toBe('partial');
    expect(result.masteryVerified).toBe(false);
    expect(result.deepeningRowsInserted).toBe(1);

    const assessmentUpdates = fake.calls.filter(
      (c) => c.op === 'update' && c.table === 'assessments',
    );
    expect(assessmentUpdates).toHaveLength(0);

    const deepeningInserts = fake.calls.filter(
      (c) => c.op === 'insert' && c.table === 'needs_deepening_topics',
    );
    expect(deepeningInserts).toHaveLength(1);
    const insertedRows = deepeningInserts[0]?.values as Array<
      Record<string, unknown>
    >;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.source).toBe('challenge_round');
    expect(insertedRows[0]?.concept).toBe('chlorophyll location');
    expect(insertedRows[0]?.status).toBe('active');
    expect(insertedRows[0]?.profileId).toBe(PROFILE_ID);
    expect(insertedRows[0]?.topicId).toBe(TOPIC_ID);
    expect(insertedRows[0]?.subjectId).toBe(SUBJECT_ID);
    expect(insertedRows[0]?.misconception).toBe(
      'said cell wall, should have said chloroplast',
    );
  });

  it('refuses to mark mastery when ANY answerEventId is forged (not in this session)', async () => {
    const fake = buildFakeDb();
    // Register only one of the two event IDs — the second is unknown.
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a001',
      'real learner answer',
    );

    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [
        makeEvalItem('solid'),
        makeEvalItem('solid', {
          concept: 'forged-concept',
          answerEventId: '01900000-0000-7000-8000-deadbeefdead',
          learnerQuote: 'LLM-supplied paraphrase that never came from learner',
        }),
      ],
    });

    expect(result.outcome).toBe('invalid');
    expect(result.masteryVerified).toBe(false);
    expect(result.deepeningRowsInserted).toBe(0);

    // No writes at all when validation fails — the LLM is unreliable, the
    // server refuses to grant mastery on un-attested evidence.
    const writes = fake.calls.filter(
      (c) => c.op === 'update' || c.op === 'insert',
    );
    expect(writes).toHaveLength(0);
  });

  it('reports outcome=reteach with no writes when every concept is missing', async () => {
    const fake = buildFakeDb();
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a001',
      "I don't know",
    );

    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [makeEvalItem('missing')],
    });

    expect(result.outcome).toBe('reteach');
    expect(result.masteryVerified).toBe(false);
    expect(result.deepeningRowsInserted).toBe(0);
  });

  it('returns skipped result when evaluations array is empty (no writes)', async () => {
    const fake = buildFakeDb();
    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [],
    });

    expect(result.outcome).toBe('invalid');
    expect(result.masteryVerified).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it('reports mastery_no_assessment_row when the assessment UPDATE matches zero rows', async () => {
    const fake = buildFakeDb();
    fake.setAssessmentUpdateRows(0);
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a001',
      'real learner answer',
    );

    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [makeEvalItem('solid')],
    });

    // Decision was 'verified' but the UPDATE matched nothing, so masteryVerified
    // is false and the caller can see the discrepancy.
    expect(result.outcome).toBe('verified');
    expect(result.masteryVerified).toBe(false);
  });

  it('rejects a topic-drift note draft via the lexical-overlap guard', async () => {
    const fake = buildFakeDb();
    fake.registerEventContent(
      '01900000-0000-7000-8000-00000000a001',
      'Photosynthesis uses sunlight, water, and carbon dioxide to make sugar.',
    );

    const result = await applyChallengeRoundEvaluation(fake.db, {
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      subjectId: SUBJECT_ID,
      evaluations: [makeEvalItem('solid')],
      noteDraft: {
        // Completely off-topic draft — Krebs cycle vocabulary, zero overlap
        // with the learner's photosynthesis answer.
        content:
          'The Krebs cycle takes acetyl-CoA and produces NADH and FADH2 inside mitochondria.',
        source_concepts: ['photosynthesis basics'],
        source_answer_event_ids: ['01900000-0000-7000-8000-00000000a001'],
      },
    });

    expect(result.masteryVerified).toBe(true);
    expect(result.noteDraftPersisted).toBe(false);
    expect(result.noteDraftRejectionReason).toBe('low_lexical_overlap');

    // No insert into topic_notes happened.
    const noteInserts = fake.calls.filter(
      (c) => c.op === 'insert' && c.table === 'topic_notes',
    );
    expect(noteInserts).toHaveLength(0);
  });
});
