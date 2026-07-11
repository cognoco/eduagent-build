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

// [WI-1658] The fake Database above models only the surface finalize
// historically touched (session metadata, assessments, needs_deepening_topics,
// session_events) — it has no topic_notes surface. Real persistence of the
// verified-proof note is covered by session-exchange.integration.test.ts
// against a real DB; this spy exists only to assert the GATING decision (was
// createNoteForSession called, and with what args) without expanding the fake
// DB to model insertNoteWithCap's advisory-lock/cap/dedup transaction. The
// real module loads fine in this environment, so only the one write function
// is stubbed — everything else is the real ../notes implementation.
jest.mock('../notes', () => ({
  ...jest.requireActual('../notes'),
  createNoteForSession: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundNoteDraftHint,
  ChallengeRoundSessionState,
  LearningSession,
} from '@eduagent/schemas';

import {
  claimChallengeRoundQuestionAsked,
  finalizeChallengeRoundIfReady,
  persistActiveChallengeRoundTransition,
} from './session-exchange';
import { MAX_CHALLENGE_QUESTIONS } from '../challenge-round/caps';
import { captureException } from '../sentry';
import { inngest } from '../../inngest/client';
import { createNoteForSession } from '../notes';
import {
  TEST_PROFILE_ID,
  TEST_SESSION_ID,
  TEST_TOPIC_ID,
  TEST_SUBJECT_ID,
} from '@eduagent/test-utils';

const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;
const mockInngestSend = inngest.send as jest.MockedFunction<
  typeof inngest.send
>;
const mockCreateNoteForSession = createNoteForSession as jest.MockedFunction<
  typeof createNoteForSession
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
  // [WI-1445] retention_cards row touched by persistChallengeRoundMasteryEvidence's
  // updateRetentionFromSession seed write. undefined until auto-created.
  retentionCard?: Record<string, unknown>;
  // session_events rows readable by validateEvaluationEventIds when finalize
  // re-fetches DB-verified answer content before terminal writes. Omitted uses
  // the default durable ANSWER_EVENT_ID row; explicit [] models the same-turn /
  // conflicted case where the current-turn answer is not yet persisted.
  sessionEventRows?: SessionEventRow[];
  // When set, the NEXT matching terminal insert throws — models a transient DB
  // error / constraint violation on the post-claim mastery or deepening write.
  failNextMasteryInsert?: boolean;
  failNextDeepeningInsert?: boolean;
  failNextCooldownInsert?: boolean;
  // challengeRoundCooldowns upserts observed (WI-1804): one entry per
  // insert().values().onConflictDoUpdate() call that reaches the fake DB.
  cooldownUpserts?: Array<Record<string, unknown>>;
  // When true, findOwnedCurriculumTopic returns no row — models a topic that is
  // NOT owned by this profile (cross-profile / wrong-subject finalize attempt).
  // The active mastery/deepening writes must reject before touching either table.
  topicNotOwned?: boolean;
}

const SUBJECT_ID = TEST_SUBJECT_ID;
const TOPIC_ID = TEST_TOPIC_ID;
const SESSION_ID = TEST_SESSION_ID;
const PROFILE_ID = TEST_PROFILE_ID;
const ANSWER_EVENT_ID = '00000000-0000-4000-8000-000000000005';
const CHALLENGE_ROUND_EVALUATION_LIMIT = 10;

function defaultSessionEventRows(): SessionEventRow[] {
  return [
    {
      id: ANSWER_EVENT_ID,
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      eventType: 'user_message',
      content: 'Plants convert light into chemical energy.',
    },
  ];
}

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
  // Shared write/read handlers — used by BOTH the top-level db and the tx
  // handed to db.transaction(). [WI-1060] persistChallengeRoundReviewTargets now
  // routes its needsDeepeningTopics read + update/insert loop through `tx`, so
  // the tx must expose the same insert/update/query surface as the top-level db.
  const insertHandler = (_table: unknown) => ({
    values: (vals: Record<string, unknown>) => {
      const runInsert = async () => {
        // Distinguish assessments / needs_deepening_topics / retention_cards
        // by their distinctive columns.
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
        } else if ('lastOutcome' in vals) {
          // [WI-1804] challengeRoundCooldowns upsert — completion cooldown write.
          if (state.failNextCooldownInsert) {
            state.failNextCooldownInsert = false;
            throw new Error('transient cooldown insert failure');
          }
          (state.cooldownUpserts ??= []).push(vals);
        } else if ('easeFactor' in vals) {
          // [WI-1445] insertRetentionCardIfAbsent — onConflictDoNothing
          // semantics: only seed state.retentionCard if absent.
          if (!state.retentionCard) {
            state.retentionCard = {
              id: 'retention-card-1',
              profileId: vals.profileId as string,
              topicId: vals.topicId as string,
              easeFactor: (vals.easeFactor as number) ?? 2.5,
              intervalDays: (vals.intervalDays as number) ?? 1,
              repetitions: (vals.repetitions as number) ?? 0,
              failureCount: (vals.failureCount as number) ?? 0,
              consecutiveSuccesses: (vals.consecutiveSuccesses as number) ?? 0,
              xpStatus: (vals.xpStatus as string) ?? 'pending',
              lastReviewedAt: null,
              nextReviewAt: null,
              masteredAt: null,
              evaluateDifficultyRung: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
        }
        return undefined;
      };
      // Invariant this lazy thenable relies on: every real call site awaits
      // EITHER `.values(vals)` directly (assessments, needs_deepening_topics)
      // OR chains `.onConflictDoNothing(...)` (retention_cards' insertRetentionCardIfAbsent)
      // — never both on the same call. Only whichever is actually awaited
      // runs `runInsert()`, so the effect fires exactly once either way.
      return {
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          runInsert().then(resolve, reject),
        onConflictDoNothing: (_opts?: unknown) => runInsert(),
        // [WI-1804] challengeRoundCooldowns upsert uses onConflictDoUpdate,
        // mirroring route-actions.ts's decline writer.
        onConflictDoUpdate: (_opts?: unknown) => runInsert(),
      };
    },
  });

  // update() serves three call shapes:
  //   - session-metadata persist: .set({metadata}).where().returning() → [row]
  //   - retention_cards SM-2 write: .set({easeFactor/nextReviewAt/...}).where().returning() → [{id}]
  //   - needsDeepeningTopics update: .set({...}).where() awaited directly
  const updateHandler = () => ({
    set: (vals: Record<string, unknown>) => {
      if (vals.metadata !== undefined) {
        const whereResult = {
          returning: async () => {
            state.sessionMetadata = vals.metadata as Record<string, unknown>;
            return [fullSessionRow(state.sessionMetadata)];
          },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(undefined).then(resolve, reject),
        };
        return { where: () => whereResult };
      }
      if ('easeFactor' in vals || 'nextReviewAt' in vals) {
        // [WI-1445] applyRetentionUpdate — ignores the guard predicate (these
        // tests never exercise the optimistic-lock conflict path) and always
        // succeeds against the seeded retentionCard.
        const whereResult = {
          returning: async () => {
            if (!state.retentionCard) return [];
            state.retentionCard = { ...state.retentionCard, ...vals };
            return [{ id: state.retentionCard.id }];
          },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(undefined).then(resolve, reject),
        };
        return { where: () => whereResult };
      }
      // needsDeepeningTopics update — awaited directly, no .returning().
      const whereResult = {
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
      findMany: async () => state.sessionEventRows ?? defaultSessionEventRows(),
    },
    // [WI-1445] ensureRetentionCard / updateRetentionFromSession's scoped-repo
    // read route here. Ignores the opaque WHERE (single fixture profile/topic
    // per test) and returns the current seeded card, if any.
    retentionCards: {
      findFirst: async () => state.retentionCard ?? undefined,
    },
  };

  // Unified select chain: `.select().from()` supports BOTH continuations real
  // call sites use — `.where()` (the session-metadata claim read) and
  // `.innerJoin()` (findOwnedCurriculumTopic's ownership join, used directly
  // by persistChallengeRoundMasteryEvidence AND again inside
  // ensureRetentionCard/updateRetentionFromSession's own ownership check).
  function makeSelectChain() {
    const ownershipNode: {
      innerJoin: () => typeof ownershipNode;
      where: () => typeof ownershipNode;
      limit: () => Promise<Record<string, unknown>[]>;
    } = {
      innerJoin: () => ownershipNode,
      where: () => ownershipNode,
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
    const metadataNode = {
      for: () => ({
        limit: async () => [{ metadata: state.sessionMetadata }],
      }),
      // persistSessionMetadata uses .for('update') too; some callers omit
      // .for — support a bare .limit as well for safety.
      limit: async () => [{ metadata: state.sessionMetadata }],
    };
    return {
      from: () => ({
        innerJoin: () => ownershipNode,
        where: () => metadataNode,
      }),
    };
  }

  // The session-metadata claim/persist transaction:
  //   tx.select({metadata}).from(learningSessions).where().for('update').limit(1)
  //   then tx.update(learningSessions).set().where().returning()
  // [WI-1060] also serves persistChallengeRoundReviewTargets's read+write loop,
  // [WI-1445] and persistChallengeRoundMasteryEvidence's retention-card seed —
  // so the tx exposes the same select/insert/update/query surface as the
  // top-level db.
  function makeTx() {
    return {
      select: makeSelectChain,
      update: updateHandler,
      insert: insertHandler,
      query: queryHandler,
    };
  }

  const db = {
    transaction: async (fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx()),

    // findOwnedCurriculumTopic entry point.
    select: makeSelectChain,

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

// [WI-1804] All evaluated concepts `missing` → outcome 'reteach'.
const RETEACH_EVALS: ChallengeRoundEvaluationItem[] = [
  {
    concept: 'photosynthesis',
    result: 'missing',
    evidence: 'No answer given.',
    answerEventId: ANSWER_EVENT_ID,
    learnerQuote: '(no answer)',
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

function activeState(questionsAsked: number): ChallengeRoundSessionState {
  return {
    state: 'active',
    topicId: TOPIC_ID,
    offerCount: 1,
    declinedDontAskAgain: false,
    questionIndex: questionsAsked,
    totalQuestions: MAX_CHALLENGE_QUESTIONS,
    questionsAsked,
    evaluations: [],
  } as ChallengeRoundSessionState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('claimChallengeRoundQuestionAsked — serializes stale concurrent question counters', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
  });

  it('advances two stale-snapshot exchanges by 2 and caps at MAX_CHALLENGE_QUESTIONS', async () => {
    const challengeRound = activeState(MAX_CHALLENGE_QUESTIONS - 2);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);

    const first = await claimChallengeRoundQuestionAsked(
      db,
      PROFILE_ID,
      SESSION_ID,
    );
    const second = await claimChallengeRoundQuestionAsked(
      db,
      PROFILE_ID,
      SESSION_ID,
    );
    const third = await claimChallengeRoundQuestionAsked(
      db,
      PROFILE_ID,
      SESSION_ID,
    );

    expect(first?.questionsAsked).toBe(MAX_CHALLENGE_QUESTIONS - 1);
    expect(second?.questionsAsked).toBe(MAX_CHALLENGE_QUESTIONS);
    expect(third?.questionsAsked).toBe(MAX_CHALLENGE_QUESTIONS);
    expect(persistedChallengeState(state)?.questionsAsked).toBe(
      MAX_CHALLENGE_QUESTIONS,
    );
  });

  it('does not let an older turn overwrite a newer persisted counter/evaluation', async () => {
    const firstEvaluation: ChallengeRoundEvaluationItem = {
      concept: 'first turn',
      result: 'solid',
      evidence: 'first',
      answerEventId: '00000000-0000-4000-8000-000000000101',
      learnerQuote: 'first answer',
    };
    const secondEvaluation: ChallengeRoundEvaluationItem = {
      concept: 'second turn',
      result: 'solid',
      evidence: 'second',
      answerEventId: '00000000-0000-4000-8000-000000000102',
      learnerQuote: 'second answer',
    };
    const state: FakeDbState = {
      sessionMetadata: {
        challengeRound: {
          ...activeState(2),
          questionIndex: 2,
          evaluations: [secondEvaluation],
        },
      },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);

    const staleFirstTurnResult: ChallengeRoundSessionState = {
      ...activeState(1),
      questionIndex: 1,
      evaluations: [firstEvaluation],
    };

    const persisted = await persistActiveChallengeRoundTransition(
      db,
      PROFILE_ID,
      SESSION_ID,
      staleFirstTurnResult,
    );

    expect(persisted?.state).toBe('active');
    expect(persisted?.questionsAsked).toBe(2);
    expect(persisted?.questionIndex).toBe(2);
    expect(persisted?.evaluations).toEqual([secondEvaluation, firstEvaluation]);
    expect(persistedChallengeState(state)?.questionsAsked).toBe(2);
  });

  it('caps merged evaluations before persisting the transition', async () => {
    const evaluations = Array.from(
      { length: CHALLENGE_ROUND_EVALUATION_LIMIT + 1 },
      (_, index): ChallengeRoundEvaluationItem => ({
        concept: `concept ${index + 1}`,
        result: 'solid',
        evidence: `evidence ${index + 1}`,
        answerEventId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        learnerQuote: `answer ${index + 1}`,
      }),
    );
    const state: FakeDbState = {
      sessionMetadata: {
        challengeRound: {
          ...activeState(MAX_CHALLENGE_QUESTIONS - 1),
          evaluations: evaluations.slice(
            0,
            CHALLENGE_ROUND_EVALUATION_LIMIT - 1,
          ),
        },
      },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);

    const persisted = await persistActiveChallengeRoundTransition(
      db,
      PROFILE_ID,
      SESSION_ID,
      {
        ...activeState(MAX_CHALLENGE_QUESTIONS),
        evaluations: evaluations.slice(CHALLENGE_ROUND_EVALUATION_LIMIT - 1),
      },
    );

    expect(persisted?.evaluations).toHaveLength(
      CHALLENGE_ROUND_EVALUATION_LIMIT,
    );
    expect(persistedChallengeState(state)?.evaluations).toHaveLength(
      CHALLENGE_ROUND_EVALUATION_LIMIT,
    );
    expect(persisted?.evaluations.at(-1)?.concept).toBe(
      `concept ${CHALLENGE_ROUND_EVALUATION_LIMIT}`,
    );
  });

  it('escalates malformed persisted challenge round metadata before returning null', async () => {
    const state: FakeDbState = {
      sessionMetadata: {
        challengeRound: {
          ...activeState(MAX_CHALLENGE_QUESTIONS),
          evaluations: Array.from(
            { length: CHALLENGE_ROUND_EVALUATION_LIMIT + 1 },
            (_, index): ChallengeRoundEvaluationItem => ({
              concept: `concept ${index + 1}`,
              result: 'solid',
              evidence: `evidence ${index + 1}`,
              answerEventId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
              learnerQuote: `answer ${index + 1}`,
            }),
          ),
        },
      },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);

    const persisted = await persistActiveChallengeRoundTransition(
      db,
      PROFILE_ID,
      SESSION_ID,
      activeState(MAX_CHALLENGE_QUESTIONS),
    );

    expect(persisted).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'challengeRoundSessionStateSchema parse failed',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'challenge-round.persist-transition.parse-failed',
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
        }),
      }),
    );
  });

  it('does not let a stale active turn overwrite a terminal persisted state', async () => {
    const terminal = {
      ...activeState(MAX_CHALLENGE_QUESTIONS),
      state: 'complete',
    } as ChallengeRoundSessionState;
    const state: FakeDbState = {
      sessionMetadata: { challengeRound: terminal },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);

    const staleActive = activeState(MAX_CHALLENGE_QUESTIONS - 1);
    const persisted = await persistActiveChallengeRoundTransition(
      db,
      PROFILE_ID,
      SESSION_ID,
      staleActive,
    );

    expect(persisted?.state).toBe('complete');
    expect(persistedChallengeState(state)?.state).toBe('complete');
  });
});

describe('finalizeChallengeRoundIfReady — idempotent under concurrent/retry finalize', () => {
  it('[WI-1427] refuses terminal writes when an evaluation answerEventId is not durable', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      sessionEventRows: [],
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    const result = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );

    expect(result).toBeNull();
    expect(state.masteryInserts).toHaveLength(0);
    expect(persistedChallengeState(state)?.state).toBe('drafting');
  });

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

  it('[WI-1195] scrubs a clinical inference before persisting a misconception', async () => {
    const challengeRound = draftingState([
      {
        concept: 'equivalent fractions',
        result: 'misconception',
        evidence: 'The learner shows signs of dyscalculia.',
        answerEventId: ANSWER_EVENT_ID,
        learnerQuote: 'One half is smaller than two fourths.',
        correction: 'One half and two fourths represent the same amount.',
      },
    ]);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);

    await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      makeSession(state.sessionMetadata),
      challengeRound,
      null,
    );

    expect(state.deepeningRows).toHaveLength(1);
    expect(state.deepeningRows[0]?.misconception).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [WI-1804] Completion cooldown — finalize now upserts challengeRoundCooldowns
// for all three completion outcomes (verified→2, accepted_partial→1,
// reteach→3), gated by the same 24h window decline already uses. `invalid`
// (empty evaluations) writes nothing. The write sits inside the existing
// mastery/deepening try/catch, so a cooldown-write failure takes the same
// release-and-retry path.
// ---------------------------------------------------------------------------

describe('finalizeChallengeRoundIfReady — completion cooldown (WI-1804)', () => {
  it.each([
    { label: 'verified', evals: SOLID_EVALS, expectedOutcome: 2 },
    { label: 'accepted_partial', evals: PARTIAL_EVALS, expectedOutcome: 1 },
    { label: 'reteach', evals: RETEACH_EVALS, expectedOutcome: 3 },
  ])(
    'writes challengeRoundCooldowns exactly once for $label (lastOutcome $expectedOutcome) under double-finalize',
    async ({ evals, expectedOutcome }) => {
      const challengeRound = draftingState(evals);
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

      expect(state.cooldownUpserts).toHaveLength(1);
      expect(state.cooldownUpserts?.[0]).toEqual(
        expect.objectContaining({
          profileId: PROFILE_ID,
          topicId: TOPIC_ID,
          lastOutcome: expectedOutcome,
        }),
      );
    },
  );

  it('writes no cooldown row for the invalid outcome (empty evaluations)', async () => {
    const challengeRound = draftingState([]);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    const result = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );

    expect(result).not.toBeNull();
    expect(state.cooldownUpserts ?? []).toHaveLength(0);
    expect(state.masteryInserts).toHaveLength(0);
    expect(state.deepeningRows).toHaveLength(0);
  });

  it('restores drafting, escalates, and re-throws when the cooldown write fails; a retry then completes exactly once', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      failNextCooldownInsert: true,
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
    ).rejects.toThrow('transient cooldown insert failure');

    // Released back to drafting; the mastery write from the same attempt is
    // NOT rolled back by this fake (each write is its own real statement, as
    // in production), but the round must be re-finalizeable and the cooldown
    // row must not have landed.
    expect(persistedChallengeState(state)?.state).toBe('drafting');
    expect(state.cooldownUpserts ?? []).toHaveLength(0);

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'transient cooldown insert failure' }),
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

    const retry = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );
    expect(retry).not.toBeNull();
    expect(persistedChallengeState(state)?.state).toBe('complete');
    expect(state.cooldownUpserts).toHaveLength(1);
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

  // [WI-1804] reteach's reviewTargets is always empty (allMissing filters no
  // partial/misconception items), so persistChallengeRoundReviewTargets
  // early-returns on `decision.reviewTargets.length === 0` BEFORE calling
  // findOwnedCurriculumTopic (session-exchange.ts ~:895) — the ownership gate
  // verified/partial get for free (see the two tests above) never runs for
  // reteach. The cooldown upsert sits unconditionally after that call inside
  // the same try block, so it becomes the first (and only) write on this
  // path.
  //
  // Ruled (shepherd, 2026-07-11): asserted here as deliberate, documented
  // behavior rather than fixed in this WI — a real gap, but low severity and
  // out of scope for "write the cooldown":
  //   - Not a cross-tenant leak: `profileId` in the write is always the
  //     authenticated caller's own id (the row's unique key is
  //     profileId+topicId, and profileId is never attacker-controlled here).
  //   - Inert: a cooldown row for a topic outside the profile's curriculum
  //     suppresses offers that could never fire for that profile anyway, so
  //     the write has no observable product effect.
  // Tracked as WI-1811 (P3) for a separate ruling on whether to add the
  // ownership guard uniformly. Do NOT add findOwnedCurriculumTopic here
  // without that separate WI (option B — guard this write — was explicitly
  // rejected as out of scope here).
  it('reteach + topic not owned — still succeeds and writes a cooldown row (documented asymmetry)', async () => {
    const challengeRound = draftingState(RETEACH_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      topicNotOwned: true,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    const result = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );

    expect(result).not.toBeNull();
    expect(state.masteryInserts).toHaveLength(0);
    expect(state.deepeningRows).toHaveLength(0);
    expect(state.cooldownUpserts).toEqual([
      expect.objectContaining({
        profileId: PROFILE_ID,
        topicId: TOPIC_ID,
        lastOutcome: 3,
      }),
    ]);
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

  it('skips finalization when the answer event is not yet readable from the DB (same-turn finalize)', async () => {
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

    expect(outcome).toBeNull();
    expect(state.masteryInserts).toHaveLength(0);
    expect(persistedChallengeState(state)?.state).toBe('drafting');
  });
});

// ---------------------------------------------------------------------------
// [WI-1658] Verified-proof note persistence — gating only (boundary spy).
//
// The fake Database above has no topic_notes surface, so real persistence is
// asserted in session-exchange.integration.test.ts against a real DB. These
// tests assert the GATING decision: createNoteForSession is called only when
// the round is fully verified (decision.outcome === 'verified') AND the
// drafted note has body content — never merely because a draft body exists,
// which a MIXED round (one solid + one partial concept) can still produce
// for its solid-sourced concept. That mixed-round case is exactly the
// event-grain gap the Artifact Provenance Contract flags for partial rounds;
// Ruling 2 sidesteps it by gating strictly on the fully-verified outcome.
// ---------------------------------------------------------------------------

describe('finalizeChallengeRoundIfReady — verified-proof note persistence (gating) [WI-1658]', () => {
  // A solid concept whose real DB event content (defaultSessionEventRows)
  // matches the draft exactly, plus a SEPARATE partial concept on a
  // different answerEventId — the round is 'partial' overall (not every
  // item solid) even though the drafted note, sourced only from the solid
  // concept, still validates and produces body content.
  const MIXED_EVALS: ChallengeRoundEvaluationItem[] = [
    {
      concept: 'photosynthesis',
      result: 'solid',
      evidence: 'Correctly described light-to-chemical energy conversion.',
      answerEventId: ANSWER_EVENT_ID,
      learnerQuote: 'Plants convert light into chemical energy.',
    },
    {
      concept: 'chlorophyll',
      result: 'partial',
      evidence: 'Vague on where chlorophyll is located.',
      answerEventId: '00000000-0000-4000-8000-000000000006',
      learnerQuote: 'chlorophyll is green I think',
      correction: 'Chlorophyll is located in chloroplasts.',
    },
  ];

  const solidSourcedNoteDraft: ChallengeRoundNoteDraftHint = {
    content: 'Plants convert light into chemical energy.',
    source_concepts: ['photosynthesis'],
    source_answer_event_ids: [ANSWER_EVENT_ID],
  };

  beforeEach(() => {
    mockCaptureException.mockClear();
    mockCreateNoteForSession.mockReset();
    mockCreateNoteForSession.mockResolvedValue({} as never);
  });

  it('calls createNoteForSession with artifactSource challenge_drafted_note when the round is fully verified and the draft has body content', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);
    const noteDraft: ChallengeRoundNoteDraftHint = {
      content: 'Plants convert light into chemical energy.',
      source_concepts: ['photosynthesis'],
      source_answer_event_ids: [ANSWER_EVENT_ID],
    };

    const outcome = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      noteDraft,
    );

    expect(outcome?.draftedNote?.body).toBe(
      'Plants convert light into chemical energy.',
    );
    expect(mockCreateNoteForSession).toHaveBeenCalledTimes(1);
    expect(mockCreateNoteForSession).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        profileId: PROFILE_ID,
        topicId: TOPIC_ID,
        sessionId: SESSION_ID,
        content: 'Plants convert light into chemical energy.',
        artifactSource: 'challenge_drafted_note',
      }),
    );
  });

  it('does NOT call createNoteForSession when the outcome is partial, even though the mixed round still produces a body-bearing draft from its solid concept', async () => {
    const challengeRound = draftingState(MIXED_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
      // Both evaluation items' answerEventIds must be durable/readable for
      // the pre-terminal-write validation to proceed — the default fixture
      // only seeds the solid concept's event, so the partial concept's event
      // must be seeded explicitly here too (see [WI-1427] test above).
      sessionEventRows: [
        {
          id: ANSWER_EVENT_ID,
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
          eventType: 'user_message',
          content: 'Plants convert light into chemical energy.',
        },
        {
          id: '00000000-0000-4000-8000-000000000006',
          profileId: PROFILE_ID,
          sessionId: SESSION_ID,
          eventType: 'user_message',
          content: 'chlorophyll is green I think',
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
      solidSourcedNoteDraft,
    );

    // Sanity: the draft DOES have body content — proves this is a real
    // regression guard, not a vacuous pass because nothing was drafted.
    expect(outcome?.draftedNote?.body).toBe(
      'Plants convert light into chemical energy.',
    );
    expect(mockCreateNoteForSession).not.toHaveBeenCalled();
  });

  it('does NOT call createNoteForSession when draftedNote.body is null (fallback draft)', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);

    // No noteDraft at all → buildValidatedDraft falls back to a null-body,
    // fallbackPrompt draft.
    const outcome = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      null,
    );

    expect(outcome?.draftedNote?.body).toBeNull();
    expect(mockCreateNoteForSession).not.toHaveBeenCalled();
  });

  it('a createNoteForSession rejection does not throw out of finalizeChallengeRoundIfReady', async () => {
    mockCreateNoteForSession.mockRejectedValueOnce(
      new Error('note cap reached'),
    );
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeFakeDb(state);
    const session = makeSession(state.sessionMetadata);
    const noteDraft: ChallengeRoundNoteDraftHint = {
      content: 'Plants convert light into chemical energy.',
      source_concepts: ['photosynthesis'],
      source_answer_event_ids: [ANSWER_EVENT_ID],
    };

    const outcome = await finalizeChallengeRoundIfReady(
      db,
      PROFILE_ID,
      session,
      challengeRound,
      noteDraft,
    );

    // The terminal payload still comes back — a note-persistence failure must
    // not fail the exchange (the verified fact is already durably recorded
    // via the assessments write above this in the function).
    expect(outcome?.challengeRoundVerdict).toBeDefined();
    expect(outcome?.challengeRound?.state).toBe('complete');
    expect(mockCaptureException).toHaveBeenCalled();
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
      findMany: async () => state.sessionEventRows ?? defaultSessionEventRows(),
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

// ---------------------------------------------------------------------------
// [WI-1445] Mastery-evidence write transaction atomicity.
//
// `persistChallengeRoundMasteryEvidence` wraps its assessments insert AND the
// retention-card seed write (updateRetentionFromSession) in a single
// db.transaction(). Without it, a throw from the retention write AFTER the
// assessments insert already ran (but had not yet committed on its own)
// would leave the caller's release-on-throw retry path (see the
// mastery-write-failure describe block above) free to re-run
// persistChallengeRoundMasteryEvidence on the next attempt — inserting a
// SECOND assessments row for the same verification, because the first
// row's insert was never rolled back.
//
// RED (remove db.transaction() from persistChallengeRoundMasteryEvidence):
//   the assessments insert commits directly; when the retention write then
//   throws, state.masteryInserts.length === 1 — partial commit survives.
// GREEN (with db.transaction()): the assessments insert goes into a pending
//   buffer; the rollback (never flushing) discards it;
//   state.masteryInserts.length === 0 after the throw.
// ---------------------------------------------------------------------------

/**
 * Rollback-aware fake db for the mastery-write atomicity red-green test.
 * Mirrors makeRollbackAwareFakeDb's structure (WI-1060), applied to the
 * assessments + retention_cards writes instead of needs_deepening_topics.
 *
 * - Transaction #1 (claim): simple pass-through.
 * - Transaction #2 (mastery evidence, MY new wrap): rollback-aware — the
 *   assessments insert AND retention-card find/insert/update all touch a
 *   pending scratch buffer, flushed to committed state only on success.
 * - Transaction #3 (release, fires because #2 threw): simple pass-through
 *   (persistSessionMetadata opens its own FOR UPDATE transaction).
 *
 * `opts.failRetentionUpdate`: when true, the retention-card SM-2 update
 * (applyRetentionUpdate's UPDATE, the LAST write in the sequence) throws —
 * models a transient DB error after the assessments insert already ran.
 */
function makeMasteryRollbackAwareFakeDb(
  state: FakeDbState,
  opts: { failRetentionUpdate: boolean },
): Database {
  const committedMasteryInserts: Array<Record<string, unknown>> = [];
  let committedRetentionCard: Record<string, unknown> | undefined;
  let txCount = 0;

  const ownershipNode: {
    innerJoin: () => typeof ownershipNode;
    where: () => typeof ownershipNode;
    limit: () => Promise<Record<string, unknown>[]>;
  } = {
    innerJoin: () => ownershipNode,
    where: () => ownershipNode,
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
  const metadataNode = {
    for: () => ({ limit: async () => [{ metadata: state.sessionMetadata }] }),
    limit: async () => [{ metadata: state.sessionMetadata }],
  };
  const makeSelectHandler = () => () => ({
    from: () => ({
      innerJoin: () => ownershipNode,
      where: () => metadataNode,
    }),
  });

  const makeUpdateHandler = () => () => ({
    set: (vals: Record<string, unknown>) => {
      if (vals.metadata !== undefined) {
        const whereResult = {
          returning: async () => {
            state.sessionMetadata = vals.metadata as Record<string, unknown>;
            return [fullSessionRow(state.sessionMetadata)];
          },
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(undefined).then(resolve, reject),
        };
        return { where: () => whereResult };
      }
      // retention_cards SM-2 write — the fault-injection point.
      const whereResult = {
        returning: async () => {
          if (opts.failRetentionUpdate) {
            throw new Error('transient retention update failure');
          }
          if (!committedRetentionCard) return [];
          committedRetentionCard = { ...committedRetentionCard, ...vals };
          return [{ id: committedRetentionCard.id }];
        },
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
      return { where: () => whereResult };
    },
  });

  // `pendingMastery`/`pendingCard` are the tx-scoped scratch buffer for the
  // rollback-aware transaction (#2); null selects the simple pass-through
  // buffer (writes land directly in the committed state).
  const makeInsertHandler =
    (pendingMastery: Array<Record<string, unknown>> | null) =>
    (_table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        const runInsert = async () => {
          if ('masteryChallengeVerifiedAt' in vals) {
            if (pendingMastery !== null) {
              pendingMastery.push(vals);
            } else {
              committedMasteryInserts.push(vals);
              state.masteryInserts = [...committedMasteryInserts];
            }
          } else if ('easeFactor' in vals && !committedRetentionCard) {
            committedRetentionCard = {
              id: 'retention-card-1',
              profileId: vals.profileId as string,
              topicId: vals.topicId as string,
              easeFactor: (vals.easeFactor as number) ?? 2.5,
              intervalDays: (vals.intervalDays as number) ?? 1,
              repetitions: (vals.repetitions as number) ?? 0,
              failureCount: (vals.failureCount as number) ?? 0,
              consecutiveSuccesses: (vals.consecutiveSuccesses as number) ?? 0,
              xpStatus: (vals.xpStatus as string) ?? 'pending',
              lastReviewedAt: null,
              nextReviewAt: null,
              masteredAt: null,
              evaluateDifficultyRung: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return undefined;
        };
        // Invariant (see makeFakeDb's insertHandler for the full rationale):
        // real call sites await EITHER `.values(vals)` directly OR chain
        // `.onConflictDoNothing(...)`, never both — exactly one of `then` /
        // `onConflictDoNothing` runs `runInsert()` per call.
        return {
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            runInsert().then(resolve, reject),
          onConflictDoNothing: (_o?: unknown) => runInsert(),
        };
      },
    });

  const makeQueryHandler = () => ({
    needsDeepeningTopics: { findMany: async () => [] },
    sessionEvents: {
      findMany: async () => state.sessionEventRows ?? defaultSessionEventRows(),
    },
    retentionCards: {
      findFirst: async () => committedRetentionCard ?? undefined,
    },
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

      // Mastery-evidence (#2): rollback-aware. The assessments insert lands
      // in a pending buffer; if fn throws (the retention write fails), the
      // buffer is never flushed — that IS the rollback. No catch needed:
      // the exception propagates naturally to the caller.
      const pendingMastery: Array<Record<string, unknown>> = [];
      const tx = {
        select: makeSelectHandler(),
        update: makeUpdateHandler(),
        insert: makeInsertHandler(pendingMastery),
        query: makeQueryHandler(),
      };
      const result = await fn(tx);
      committedMasteryInserts.push(...pendingMastery);
      state.masteryInserts = [...committedMasteryInserts];
      return result;
    },

    select: makeSelectHandler(),
    insert: makeInsertHandler(null),
    update: makeUpdateHandler(),
    query: makeQueryHandler(),
  };

  return db as unknown as Database;
}

describe('finalizeChallengeRoundIfReady — mastery-evidence write transaction atomicity [WI-1445]', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockInngestSend.mockClear();
  });

  it('[WI-1445] rolls back the assessments insert when the retention write throws (atomicity)', async () => {
    const challengeRound = draftingState(SOLID_EVALS);
    const state: FakeDbState = {
      sessionMetadata: { challengeRound },
      masteryInserts: [],
      deepeningRows: [],
      deepeningInsertCount: 0,
    };
    const db = makeMasteryRollbackAwareFakeDb(state, {
      failRetentionUpdate: true,
    });
    const session = makeSession(state.sessionMetadata);

    await expect(
      finalizeChallengeRoundIfReady(
        db,
        PROFILE_ID,
        session,
        challengeRound,
        null,
      ),
    ).rejects.toThrow('transient retention update failure');

    // GREEN: transaction rolled back — no assessments row committed despite
    // the insert having run before the retention write threw.
    expect(state.masteryInserts).toHaveLength(0);

    // Claim released: session is back to 'drafting' so a retry can re-run
    // WITHOUT duplicating the assessments row.
    expect(persistedChallengeState(state)?.state).toBe('drafting');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'transient retention update failure',
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
