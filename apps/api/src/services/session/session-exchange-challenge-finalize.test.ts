// ---------------------------------------------------------------------------
// finalizeChallengeRoundIfReady — concurrency / idempotency regression
// ---------------------------------------------------------------------------
//
// Bug: finalizeChallengeRoundIfReady can run twice for the SAME ready
// Challenge Round (two in-flight requests, or a request + a retry that both
// captured the pre-finalize `drafting` ExchangeContext). The terminal-write
// guard read the *in-memory* `challengeRound.state === 'drafting'` — the same
// stale snapshot both invocations carry — so BOTH passed the gate and BOTH:
//
//   - inserted an `assessments` row with `masteryChallengeVerifiedAt`
//     (double mastery write), and
//   - inserted `needs_deepening_topics` rows (duplicate deepening topics).
//
// The fix claims finalization atomically against the *persisted* session
// metadata under a row lock (FOR UPDATE): the first invocation flips the
// persisted challengeRound state `drafting → complete` and proceeds; any
// concurrent/retry invocation re-reads `complete` and becomes a no-op.
//
// These tests drive the REAL finalizeChallengeRoundIfReady against an
// in-memory fake `Database` modelled at the boundary that the production
// code touches (the FOR UPDATE session-metadata transaction, the assessments
// insert, the needs_deepening_topics find/insert, and the owned-topic read).
// No internal modules are mocked — the decision policy, state machine, and
// persistence helpers all run for real.
//
// RED (pre-fix): the second sequential finalize re-writes mastery /
// re-inserts deepening rows → counts are 2.
// GREEN (post-fix): the claim makes the second call a no-op → counts are 1.

// Stub true external boundaries only so the partial-write escalation can be
// asserted: Sentry (external SaaS) and the Inngest framework client
// (../../inngest/client — the send() transport, not our own code). The decision
// policy, state machine, claim/release, and persistence helpers all run for
// real. (gc1-allow: external-boundary stubs, pattern-a conversion.)
jest.mock('../sentry' /* gc1-allow: external boundary */, () => {
  const actual = jest.requireActual('../sentry') as typeof import('../sentry');
  return {
    ...actual,
    captureException: jest.fn(),
  };
});

jest.mock(
  '../../inngest/client' /* gc1-allow: Inngest framework boundary */,
  () => ({
    inngest: { send: jest.fn().mockResolvedValue(undefined) },
  }),
);

import type { Database } from '@eduagent/database';
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundNoteDraftHint,
  ChallengeRoundSessionState,
  LearningSession,
} from '@eduagent/schemas';

import { finalizeChallengeRoundIfReady } from './session-exchange';
import { captureException } from '../sentry';
import { inngest } from '../../inngest/client';

const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;
const mockInngestSend = inngest.send as jest.MockedFunction<
  typeof inngest.send
>;

// ---------------------------------------------------------------------------
// In-memory fake Database. Models only the surface finalize touches.
// ---------------------------------------------------------------------------

interface DeepeningRow {
  id: string;
  profileId: string;
  subjectId: string;
  topicId: string;
  status: string;
  source: string;
  concept: string | null;
  misconception?: string | null;
  correction?: string | null;
  updatedAt: Date;
  createdAt: Date;
}

interface SessionEventRow {
  id: string;
  profileId: string;
  sessionId: string;
  eventType: string;
  content: string;
}

interface FakeDbState {
  // Persisted session metadata. The claim/lock operates on this.
  sessionMetadata: Record<string, unknown>;
  masteryInserts: Array<Record<string, unknown>>;
  deepeningRows: DeepeningRow[];
  deepeningInsertCount: number;
  // [BUG-483] session_events rows readable by validateEvaluationEventIds when
  // finalize re-fetches DB-verified answer content for the note-draft guard.
  // Omitted → no rows (models the same-turn case where the current-turn answer
  // is not yet persisted).
  sessionEventRows?: SessionEventRow[];
  // When set, the NEXT matching terminal insert throws — models a transient DB
  // error / constraint violation on the post-claim mastery or deepening write.
  failNextMasteryInsert?: boolean;
  failNextDeepeningInsert?: boolean;
  // When true, findOwnedCurriculumTopic returns no row — models a topic that is
  // NOT owned by this profile (cross-profile / wrong-subject finalize attempt).
  // The active mastery/deepening writes must reject before touching either table.
  topicNotOwned?: boolean;
}

const SUBJECT_ID = '00000000-0000-4000-8000-000000000001';
const TOPIC_ID = '00000000-0000-4000-8000-000000000002';
const SESSION_ID = '00000000-0000-4000-8000-000000000003';
const PROFILE_ID = '00000000-0000-4000-8000-000000000004';
const ANSWER_EVENT_ID = '00000000-0000-4000-8000-000000000005';

function makeSession(metadata: Record<string, unknown>): LearningSession {
  return {
    id: SESSION_ID,
    profileId: PROFILE_ID,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    metadata,
  } as unknown as LearningSession;
}

// A `learning_sessions` row complete enough for `mapSessionRow` to read.
function fullSessionRow(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const now = new Date();
  return {
    id: SESSION_ID,
    profileId: PROFILE_ID,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    sessionType: 'topic',
    inputMode: 'text',
    verificationType: null,
    status: 'active',
    escalationRung: 0,
    exchangeCount: 1,
    startedAt: now,
    lastActivityAt: now,
    endedAt: null,
    durationSeconds: null,
    wallClockSeconds: null,
    rawInput: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
    metadata,
  };
}

function makeFakeDb(state: FakeDbState): Database {
  // findOwnedCurriculumTopic does db.select({...}).from().innerJoin()*3
  // .where().limit(1) → returns an owned topic row.
  const ownedTopicSelect = {
    from: () => ownedTopicSelect,
    innerJoin: () => ownedTopicSelect,
    where: () => ownedTopicSelect,
    // A non-owned topic surfaces as zero rows from the ownership-scoped join —
    // exactly how findOwnedCurriculumTopic signals "not owned by this profile".
    limit: async () =>
      state.topicNotOwned
        ? []
        : [
            {
              topicId: TOPIC_ID,
              topicTitle: 'T',
              topicDescription: null,
              topicChapter: null,
              topicEstimatedMinutes: null,
              bookId: 'book-1',
              bookTitle: 'B',
              curriculumId: 'cur-1',
              subjectId: SUBJECT_ID,
              topicSource: 'manual',
              subjectName: 'S',
              subjectPedagogyMode: null,
              subjectLanguageCode: null,
            },
          ],
  };

  // Shared write/read handlers — used by BOTH the top-level db and the tx
  // handed to db.transaction(). [WI-1060] persistChallengeRoundReviewTargets now
  // routes its needsDeepeningTopics read + update/insert loop through `tx`, so
  // the tx must expose the same insert/update/query surface as the top-level db.
  const insertHandler = (_table: unknown) => ({
    values: async (vals: Record<string, unknown>) => {
      // Distinguish assessments vs needs_deepening_topics by the columns.
      if ('masteryChallengeVerifiedAt' in vals) {
        if (state.failNextMasteryInsert) {
          state.failNextMasteryInsert = false;
          throw new Error('transient mastery insert failure');
        }
        state.masteryInserts.push(vals);
      } else if ('source' in vals && vals.source === 'challenge_round') {
        if (state.failNextDeepeningInsert) {
          state.failNextDeepeningInsert = false;
          throw new Error('transient deepening insert failure');
        }
        state.deepeningInsertCount += 1;
        state.deepeningRows.push({
          id: `ndt-${state.deepeningRows.length + 1}`,
          profileId: vals.profileId as string,
          subjectId: vals.subjectId as string,
          topicId: vals.topicId as string,
          status: (vals.status as string) ?? 'pending_review',
          source: 'challenge_round',
          concept: (vals.concept as string) ?? null,
          misconception: (vals.misconception as string) ?? null,
          correction: (vals.correction as string) ?? null,
          updatedAt: new Date(),
          createdAt: new Date(),
        });
      }
      return undefined;
    },
  });

  // update() serves two call shapes:
  //   - session-metadata persist: .set({metadata}).where().returning() → [row]
  //   - needsDeepeningTopics update: .set({...}).where() awaited directly
  const updateHandler = () => ({
    set: (vals: { metadata?: Record<string, unknown> }) => {
      const whereResult = {
        returning: async () => {
          if (vals.metadata) {
            state.sessionMetadata = vals.metadata;
          }
          return [fullSessionRow(state.sessionMetadata)];
        },
        // Awaited-directly form (needsDeepeningTopics update has no .returning()).
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
      return { where: () => whereResult };
    },
  });

  const queryHandler = {
    needsDeepeningTopics: {
      findMany: async () =>
        state.deepeningRows.filter(
          (r) =>
            r.subjectId === SUBJECT_ID &&
            r.topicId === TOPIC_ID &&
            r.source === 'challenge_round' &&
            (r.status === 'active' || r.status === 'pending_review'),
        ),
    },
    // [BUG-483] createScopedRepository(...).sessionEvents.findMany routes here.
    // The opaque WHERE is built by the real scoped repo; we return the seeded
    // rows and let the REAL validateEvaluationEventIds do its id→content
    // mapping + strict-missing rejection in JS.
    sessionEvents: {
      findMany: async () => state.sessionEventRows ?? [],
    },
  };

  // The session-metadata claim/persist transaction:
  //   tx.select({metadata}).from(learningSessions).where().for('update').limit(1)
  //   then tx.update(learningSessions).set().where().returning()
  // [WI-1060] also serves persistChallengeRoundReviewTargets's read+write loop,
  // so the tx exposes insert + query + the scoped-repo read surface too.
  function makeTx() {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => ({
              limit: async () => [{ metadata: state.sessionMetadata }],
            }),
            // persistSessionMetadata uses .for('update') too; some callers
            // omit .for — support a bare .limit as well for safety.
            limit: async () => [{ metadata: state.sessionMetadata }],
          }),
        }),
      }),
      update: updateHandler,
      insert: insertHandler,
      query: queryHandler,
    };
  }

  const db = {
    transaction: async (fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx()),

    // findOwnedCurriculumTopic entry point.
    select: () => ownedTopicSelect,

    insert: insertHandler,

    update: updateHandler,

    query: queryHandler,
  };

  return db as unknown as Database;
}

// ---------------------------------------------------------------------------
// Evaluation fixtures
// ---------------------------------------------------------------------------

const SOLID_EVALS: ChallengeRoundEvaluationItem[] = [
  {
    concept: 'photosynthesis',
    result: 'solid',
    evidence: 'Correctly described light-to-chemical energy conversion.',
    answerEventId: ANSWER_EVENT_ID,
    learnerQuote: 'Plants convert light into chemical energy.',
  },
];

const PARTIAL_EVALS: ChallengeRoundEvaluationItem[] = [
  {
    concept: 'photosynthesis',
    result: 'partial',
    evidence: 'Vague on the light-energy conversion step.',
    answerEventId: ANSWER_EVENT_ID,
    learnerQuote: 'Plants make food somehow.',
    correction: 'Light energy is converted to chemical energy in chloroplasts.',
  },
];

function draftingState(
  evaluations: ChallengeRoundEvaluationItem[],
): ChallengeRoundSessionState {
  return {
    state: 'drafting',
    topicId: TOPIC_ID,
    offerCount: 1,
    declinedDontAskAgain: false,
    questionIndex: 1,
    totalQuestions: 1,
    evaluations,
  } as ChallengeRoundSessionState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('finalizeChallengeRoundIfReady — idempotent under concurrent/retry finalize', () => {
  it('writes mastery exactly once when finalize runs twice on the same ready round', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    // Two invocations both carrying the same pre-finalize `drafting` context —
    // the exact shape of two concurrent requests / a request + retry.
    const first = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );
    const second = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );

    // Exactly one mastery write — the winning claim only.
    expect(state.masteryInserts).toHaveLength(1);
    // The first call produced the outcome; the second was a claimed no-op.
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('inserts needs_deepening_topics exactly once when finalize runs twice on the same partial round', async () => {
    const challengeRound = draftingState(PARTIAL_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );
    await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );

    // No duplicate deepening rows: exactly one insert, one row for the concept.
    expect(state.deepeningInsertCount).toBe(1);
    expect(state.deepeningRows).toHaveLength(1);
    // And no mastery write on the partial path.
    expect(state.masteryInserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ownership scoping: the ACTIVE mastery/deepening write path is the only
// challenge-round persistence implementation reachable from production (the
// parallel `challenge-round/persistence.ts` helpers were dead code, imported
// only by their own test, and were removed). Its ownership check goes through
// `findOwnedCurriculumTopic` (curriculum_topics → curriculum_books/curricula →
// subjects, gated on subjects.profileId). When the topic is NOT owned by the
// finalizing profile the join yields no row, and finalize MUST refuse to write
// — no `assessments` mastery row and no `needs_deepening_topics` row may be
// inserted for a topic the profile does not own. This locks that contract onto
// the surviving path so a future refactor can't silently drop the scope check.
// ---------------------------------------------------------------------------

describe('finalizeChallengeRoundIfReady — rejects writes for a topic not owned by the profile', () => {
  it('does NOT write a mastery row when the topic is not owned (solid round)', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      topicNotOwned: true,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    await expect(
      finalizeChallengeRoundIfReady(
        db,
        PROFILE_ID,
        session,
        challengeRound,
        null,
      ),
    ).rejects.toThrow(/not owned/i);

    // The ownership gate fired before any write — no mastery row leaked.
    expect(state.masteryInserts).toHaveLength(0);
  });

  it('does NOT write a needs_deepening_topics row when the topic is not owned (partial round)', async () => {
    const challengeRound = draftingState(PARTIAL_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      topicNotOwned: true,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    await expect(
      finalizeChallengeRoundIfReady(
        db,
        PROFILE_ID,
        session,
        challengeRound,
        null,
      ),
    ).rejects.toThrow(/not owned/i);

    // The ownership gate fired before any write — no deepening row leaked.
    expect(state.deepeningInsertCount).toBe(0);
    expect(state.deepeningRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Release leg: a downstream terminal write throwing AFTER a successful claim
// must NOT leave the session permanently `complete` with no mastery / deepening
// rows. The claim is released back to `drafting` (round re-finalizeable), the
// partial failure is escalated (Sentry + non-core Inngest event), the error is
// propagated (no false mastery-success), and a subsequent finalize re-runs and
// completes exactly once.
// ---------------------------------------------------------------------------

function persistedChallengeState(
  state: FakeDbState,
): ChallengeRoundSessionState | undefined {
  return state.sessionMetadata['challengeRound'] as
    | ChallengeRoundSessionState
    | undefined;
}

describe('finalizeChallengeRoundIfReady — releases the claim + escalates on a post-claim terminal-write failure', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockInngestSend.mockClear();
  });

  it('restores drafting, escalates, and re-throws when the mastery write fails; a retry then completes exactly once', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      failNextMasteryInsert: true,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    // (1) The post-claim mastery insert throws — finalize must propagate it.
    await expect(
      finalizeChallengeRoundIfReady(
        db,
        PROFILE_ID,
        session,
        challengeRound,
        null,
      ),
    ).rejects.toThrow('transient mastery insert failure');

    // (a) The claim was released: persisted state is back to `drafting`.
    expect(persistedChallengeState(state)?.state).toBe('drafting');
    // No mastery row was written on the failed attempt.
    expect(state.masteryInserts).toHaveLength(0);

    // (b) The escalation fired: Sentry capture for the terminal-write failure
    // AND a non-core Inngest event so the partial failure is observable.
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'transient mastery insert failure' }),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'challenge-round.finalize.terminal-write-failed',
        }),
      }),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/challenge-round.finalize.failed',
      }),
    );

    // (c) A subsequent finalize re-runs (state is drafting again) and completes
    // exactly once — the retry succeeds because the toggle was consumed.
    const retry = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );
    expect(retry).not.toBeNull();
    expect(persistedChallengeState(state)?.state).toBe('complete');
    expect(state.masteryInserts).toHaveLength(1);
  });

  it('restores drafting and re-throws when the deepening write fails on a partial round', async () => {
    const challengeRound = draftingState(PARTIAL_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      failNextDeepeningInsert: true,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    await expect(
      finalizeChallengeRoundIfReady(
        db,
        PROFILE_ID,
        session,
        challengeRound,
        null,
      ),
    ).rejects.toThrow('transient deepening insert failure');

    // Released back to drafting; no deepening row persisted on the failed write.
    expect(persistedChallengeState(state)?.state).toBe('drafting');
    expect(state.deepeningInsertCount).toBe(0);
    expect(state.deepeningRows).toHaveLength(0);

    // Escalated.
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'transient deepening insert failure',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'challenge-round.finalize.terminal-write-failed',
        }),
      }),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/challenge-round.finalize.failed',
      }),
    );

    // Retry completes exactly once.
    const retry = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );
    expect(retry).not.toBeNull();
    expect(persistedChallengeState(state)?.state).toBe('complete');
    expect(state.deepeningInsertCount).toBe(1);
    expect(state.deepeningRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// [BUG-483] The note-draft hallucination guard must validate against
// DB-verified event text — never against the route-supplied current-turn
// answer text the request vouched for itself.
//
// `decision.solidAnswerQuotes` is NOT uniformly DB-verified: for the answer the
// learner gives on the FINAL challenge turn,
// `validateChallengeRoundEvaluationItems` substitutes the route-supplied
// `currentUserMessage.content` (= `input.message`). The pre-fix call site passed
// those quotes as `verifiedEventContents`, so for the current-turn concept the
// lexical-overlap guard compared the LLM draft against text the request supplied
// for itself — a no-op.
//
// RED (pre-fix): the guard tokenizes the rich route-trusted `learnerQuote`, the
// draft overlaps it strongly, validation passes, and `draftedNote.body` is the
// LLM draft.
// GREEN (post-fix): the guard tokenizes the sparse DB-verified `content`
// ("yeah ok"), the draft does NOT overlap, validation fails, and
// `draftedNote.body` is null with a learner-writes fallbackPrompt.
// ---------------------------------------------------------------------------

describe('finalizeChallengeRoundIfReady — note-draft guard uses DB-verified content [BUG-483]', () => {
  // The LLM-supplied learnerQuote (route-trusted) is rich and overlaps the
  // draft strongly. The REAL DB event content is sparse — the learner barely
  // said anything. The fabricated draft asserts far more than the learner did.
  const ROUTE_TRUSTED_QUOTE =
    'Photosynthesis happens in chloroplasts where plants convert light energy carbon dioxide and water into glucose and oxygen.';
  const SPARSE_DB_CONTENT = 'yeah ok sounds right';
  const FABRICATED_DRAFT =
    'Photosynthesis happens in chloroplasts where plants convert light energy carbon dioxide and water into glucose and oxygen.';

  const evalsWithRouteQuote: ChallengeRoundEvaluationItem[] = [
    {
      concept: 'photosynthesis',
      result: 'solid',
      evidence: 'Described the light-to-chemical energy conversion.',
      answerEventId: ANSWER_EVENT_ID,
      // Route-supplied (current-turn) text — NOT the real DB content.
      learnerQuote: ROUTE_TRUSTED_QUOTE,
    },
  ];

  const noteDraft: ChallengeRoundNoteDraftHint = {
    content: FABRICATED_DRAFT,
    source_concepts: ['photosynthesis'],
    source_answer_event_ids: [ANSWER_EVENT_ID],
  };

  it('REJECTS a draft that only overlaps route-trusted text, validating against the sparse DB event content instead', async () => {
    const challengeRound = draftingState(evalsWithRouteQuote);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      // The answer's REAL persisted content is sparse — finalize re-reads this.
      sessionEventRows: [
        {
          id: ANSWER_EVENT_ID,
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
          eventType: 'user_message',
          content: SPARSE_DB_CONTENT,
        },
      ],
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    const outcome = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      noteDraft,
    );

    // The guard, now sourced from DB-verified sparse text, rejects the draft:
    // body is null (fallback), not the fabricated LLM draft.
    expect(outcome?.draftedNote).toBeDefined();
    expect(outcome?.draftedNote?.body).toBeNull();
    expect(outcome?.draftedNote?.fallbackPrompt).toBeTruthy();
  });

  it('ACCEPTS a draft that overlaps the real DB event content', async () => {
    const challengeRound = draftingState(evalsWithRouteQuote);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      // Real DB content matches the draft well → guard passes against DB text.
      sessionEventRows: [
        {
          id: ANSWER_EVENT_ID,
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
          eventType: 'user_message',
          content: ROUTE_TRUSTED_QUOTE,
        },
      ],
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    const outcome = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      noteDraft,
    );

    expect(outcome?.draftedNote?.body).toBe(FABRICATED_DRAFT);
  });

  it('fails closed to the fallback when the answer event is not yet readable from the DB (same-turn finalize)', async () => {
    const challengeRound = draftingState(evalsWithRouteQuote);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      // No session_events rows seeded — models the current-turn answer not yet
      // persisted. validateEvaluationEventIds throws → fail closed.
      sessionEventRows: [],
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    const outcome = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      noteDraft,
    );

    expect(outcome?.draftedNote?.body).toBeNull();
    expect(outcome?.draftedNote?.fallbackPrompt).toBeTruthy();
  });
});

// [WI-1060] Review-targets transaction atomicity.
//
// `persistChallengeRoundReviewTargets` wraps its "read existing rows + insert /
// update per concept" loop in a single db.transaction(). Without the transaction,
// a throw mid-loop would commit the first concept's deepening row and drop the
// remaining ones — leaving the learner with an inconsistent, incomplete review
// set that cannot be recovered because the Challenge Round is already `complete`.
//
// RED (remove db.transaction() from persistChallengeRoundReviewTargets): the
// first concept is inserted directly into `state.deepeningRows`; when the second
// concept's insert throws, `state.deepeningRows.length === 1` — partial commit.
// GREEN (with db.transaction()): the first concept goes into a pending buffer;
// the rollback discards it; `state.deepeningRows.length === 0` after the throw.
// ---------------------------------------------------------------------------

/**
 * Rollback-aware fake db for the atomicity red-green test.
 *
 * - Transaction #1 (claim): simple pass-through — select + update session meta.
 * - Transaction #2 (review targets): rollback-aware — deepening inserts go to a
 *   pending buffer, flushed to committed only on success.
 * - Transaction #3 (release): simple pass-through — select + update session meta.
 *
 * `opts.failOnNthDeepeningInsert`: throw on the Nth call to insert a
 * `challenge_round` deepening row. Use `2` for the "first succeeds, second
 * throws" scenario.
 */
function makeRollbackAwareFakeDb(
  state: FakeDbState,
  opts: { failOnNthDeepeningInsert: number },
): Database {
  const committed: DeepeningRow[] = [];
  let txCount = 0;
  let totalDeepeningInserts = 0;

  const ownedTopicSelect = {
    from: () => ownedTopicSelect,
    innerJoin: () => ownedTopicSelect,
    where: () => ownedTopicSelect,
    limit: async () =>
      state.topicNotOwned
        ? []
        : [
            {
              topicId: TOPIC_ID,
              topicTitle: 'T',
              topicDescription: null,
              topicChapter: null,
              topicEstimatedMinutes: null,
              bookId: 'book-1',
              bookTitle: 'B',
              curriculumId: 'cur-1',
              subjectId: SUBJECT_ID,
              topicSource: 'manual',
              subjectName: 'S',
              subjectPedagogyMode: null,
              subjectLanguageCode: null,
            },
          ],
  };

  // Returns an insert handler that writes to `buf` (pending buffer inside tx)
  // or directly to `committed` when `buf` is null (outside tx / simple tx path).
  const makeInsertHandler =
    (buf: DeepeningRow[] | null) => (_table: unknown) => ({
      values: async (vals: Record<string, unknown>) => {
        if ('source' in vals && vals.source === 'challenge_round') {
          totalDeepeningInserts++;
          if (totalDeepeningInserts === opts.failOnNthDeepeningInsert) {
            throw new Error('transient deepening insert failure');
          }
          const row: DeepeningRow = {
            id: `ndt-${committed.length + (buf?.length ?? 0) + 1}`,
            profileId: vals.profileId as string,
            subjectId: vals.subjectId as string,
            topicId: vals.topicId as string,
            status: (vals.status as string) ?? 'pending_review',
            source: 'challenge_round',
            concept: (vals.concept as string) ?? null,
            misconception: (vals.misconception as string) ?? null,
            correction: (vals.correction as string) ?? null,
            updatedAt: new Date(),
            createdAt: new Date(),
          };
          if (buf !== null) {
            buf.push(row);
          } else {
            committed.push(row);
            state.deepeningRows = [...committed];
            state.deepeningInsertCount = committed.length;
          }
        } else if ('masteryChallengeVerifiedAt' in vals) {
          state.masteryInserts.push(vals);
        }
        return undefined;
      },
    });

  const makeUpdateHandler = () => () => ({
    set: (vals: { metadata?: Record<string, unknown> }) => {
      const whereResult = {
        returning: async () => {
          if (vals.metadata) state.sessionMetadata = vals.metadata;
          return [fullSessionRow(state.sessionMetadata)];
        },
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
      return { where: () => whereResult };
    },
  });

  const makeQueryHandler = () => ({
    needsDeepeningTopics: {
      findMany: async () =>
        committed.filter(
          (r) =>
            r.subjectId === SUBJECT_ID &&
            r.topicId === TOPIC_ID &&
            r.source === 'challenge_round' &&
            (r.status === 'active' || r.status === 'pending_review'),
        ),
    },
    sessionEvents: {
      findMany: async () => state.sessionEventRows ?? [],
    },
  });

  const makeSelectHandler = () => () => ({
    from: () => ({
      where: () => ({
        for: () => ({
          limit: async () => [{ metadata: state.sessionMetadata }],
        }),
        limit: async () => [{ metadata: state.sessionMetadata }],
      }),
    }),
  });

  const db = {
    transaction: async (fn: (tx: unknown) => unknown) => {
      txCount++;

      if (txCount !== 2) {
        // Claim (#1) and release (#3): simple pass-through.
        const tx = {
          select: makeSelectHandler(),
          update: makeUpdateHandler(),
          insert: makeInsertHandler(null),
          query: makeQueryHandler(),
        };
        return fn(tx);
      }

      // Review-targets (#2): rollback-aware deepening inserts.
      const pending: DeepeningRow[] = [];
      const tx = {
        select: makeSelectHandler(),
        update: makeUpdateHandler(),
        insert: makeInsertHandler(pending),
        query: {
          // Reads from committed (no pre-existing rows in this test).
          needsDeepeningTopics: {
            findMany: async () => [] as DeepeningRow[],
          },
          sessionEvents: {
            findMany: async () => [] as typeof state.sessionEventRows,
          },
        },
      };
      // If fn throws, pending is never flushed to committed — that IS the
      // rollback. The exception propagates naturally (no catch needed).
      const result = await fn(tx);
      // Transaction committed: flush pending to committed.
      committed.push(...pending);
      state.deepeningRows = [...committed];
      state.deepeningInsertCount = committed.length;
      return result;
    },

    select: () => ownedTopicSelect,
    insert: makeInsertHandler(null),
    update: makeUpdateHandler(),
    query: makeQueryHandler(),
  };

  return db as unknown as Database;
}

describe('finalizeChallengeRoundIfReady — review-targets transaction atomicity [WI-1060]', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockInngestSend.mockClear();
  });

  it('[WI-1060] rolls back all deepening inserts when the second concept throws (atomicity)', async () => {
    // Two partial concepts. First insert succeeds (pending); second throws.
    // Without the db.transaction() wrapping in persistChallengeRoundReviewTargets
    // the first concept row commits to state.deepeningRows before the second
    // throws — an incomplete review set the learner can never see corrected
    // because the round is already `complete`.
    // With the transaction both inserts roll back; the claim is released to
    // `drafting` and the full round can be retried.
    //
    // RED (remove db.transaction() from persistChallengeRoundReviewTargets):
    //   state.deepeningRows.length === 1 after the second throw.
    // GREEN (with db.transaction()):
    //   state.deepeningRows.length === 0 (rollback discarded the first insert).
    const TWO_PARTIAL_EVALS: ChallengeRoundEvaluationItem[] = [
      {
        concept: 'photosynthesis',
        result: 'partial',
        evidence: 'Vague on light-energy conversion step.',
        answerEventId: ANSWER_EVENT_ID,
        learnerQuote: 'Plants make food somehow.',
        correction:
          'Light energy is converted to chemical energy in chloroplasts.',
      },
      {
        concept: 'chlorophyll',
        result: 'partial',
        evidence: 'Missed the pigment role.',
        answerEventId: ANSWER_EVENT_ID,
        learnerQuote: 'The green stuff.',
        correction: 'Chlorophyll absorbs light energy for photosynthesis.',
      },
    ];

    const challengeRound = draftingState(TWO_PARTIAL_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    // failOnNthDeepeningInsert: 2 → first insert goes to pending, second throws.
    const db = makeRollbackAwareFakeDb(state, { failOnNthDeepeningInsert: 2 });
    const session = makeSession(state.sessionMetadata);

    await expect(
      finalizeChallengeRoundIfReady(
        db,
        PROFILE_ID,
        session,
        challengeRound,
        null,
      ),
    ).rejects.toThrow('transient deepening insert failure');

    // GREEN: transaction rolled back — no deepening rows committed.
    expect(state.deepeningRows).toHaveLength(0);

    // Claim released: session is back to 'drafting' so a retry can re-run.
    expect(persistedChallengeState(state)?.state).toBe('drafting');

    // Escalation fired (AGENTS.md: "Silent recovery without escalation is banned
    // in … state-machine flows").
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'transient deepening insert failure',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'challenge-round.finalize.terminal-write-failed',
        }),
      }),
    );
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app/challenge-round.finalize.failed' }),
    );
  });
});
