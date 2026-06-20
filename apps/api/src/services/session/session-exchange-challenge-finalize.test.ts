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

interface FakeDbState {
  // Persisted session metadata. The claim/lock operates on this.
  sessionMetadata: Record<string, unknown>;
  masteryInserts: Array<Record<string, unknown>>;
  deepeningRows: DeepeningRow[];
  deepeningInsertCount: number;
  // When set, the NEXT matching terminal insert throws — models a transient DB
  // error / constraint violation on the post-claim mastery or deepening write.
  failNextMasteryInsert?: boolean;
  failNextDeepeningInsert?: boolean;
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
    limit: async () => [
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

  // The session-metadata claim/persist transaction:
  //   tx.select({metadata}).from(learningSessions).where().for('update').limit(1)
  //   then tx.update(learningSessions).set().where().returning()
  // We serialize on the in-memory metadata: reads see the latest persisted
  // state, writes replace it. This models the FOR UPDATE row lock.
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
      update: () => ({
        set: (vals: { metadata?: Record<string, unknown> }) => ({
          where: () => ({
            returning: async () => {
              if (vals.metadata) {
                state.sessionMetadata = vals.metadata;
              }
              return [fullSessionRow(state.sessionMetadata)];
            },
          }),
        }),
      }),
    };
  }

  const db = {
    transaction: async (fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx()),

    // findOwnedCurriculumTopic entry point.
    select: () => ownedTopicSelect,

    insert: (_table: unknown) => ({
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
    }),

    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),

    query: {
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
    },
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
