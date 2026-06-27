/**
 * Integration: Challenge Round grader-judge path (T7, plan 2026-06-26).
 *
 * Tests the T7 guard relaxation in `applyChallengeRoundRuntimeSignals`:
 *   - Flag=ON path: `challengeRoundGraderEnabled: true` → grader produces the
 *     evaluation instead of the inline tutor envelope.  The active-branch entry
 *     condition is gated on `currentUserMessage` (grader PRODUCES the array),
 *     NOT on a non-empty tutor array (which arrives empty when grader is on).
 *   - Flag=OFF path: inline tutor-supplied evaluation proceeds unchanged.
 *   - Mastery-verified side-effect: `finalizeChallengeRoundIfReady` writes an
 *     `assessments` row when all evaluations are solid.
 *
 * External boundaries mocked (GC1-compliant):
 *   1. '../llm'               — routeAndCall (tutor + grader LLM calls).
 *                                gc1-allow: external LLM boundary.
 *   2. '../../inngest/client' — Inngest send. gc1-allow: external boundary.
 *
 * No internal modules are mocked. All DB operations use the real test database.
 */

// ---------------------------------------------------------------------------
// GC1-allow mocks — external boundaries only
// ---------------------------------------------------------------------------

jest.mock(
  '../llm' /* gc1-allow: external LLM boundary (routeAndCall, tutor + grader) */,
  () => {
    const actual = jest.requireActual('../llm') as typeof import('../llm');
    return {
      ...actual,
      routeAndCall: jest.fn(),
      routeAndStream: jest.fn(),
    };
  },
);

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../../inngest/client' /* gc1-allow: external boundary — Inngest client */,
  () => {
    const actual = jest.requireActual(
      '../../inngest/client',
    ) as typeof import('../../inngest/client');
    return {
      ...actual,
      inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
    };
  },
);

// ---------------------------------------------------------------------------
// Imports (after mocks — Jest hoist constraint)
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { and, eq, like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  assessments,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  profiles,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import type { RouteResult } from '../llm';
import { routeAndCall } from '../llm';
import { MAX_CHALLENGE_QUESTIONS } from '../challenge-round/caps';
import {
  processMessage,
  finalizeChallengeRoundIfReady,
  persistChallengeRoundState,
} from './session-exchange';
import { mapSessionRow } from './session-events';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();
const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

// ---------------------------------------------------------------------------
// LLM fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal valid tutor envelope — passes parseEnvelope without `envelopeParseFailed`.
 * Does NOT include `challengeRoundEvaluation` (the grader provides it on the
 * flag=ON path).
 */
const TUTOR_ENVELOPE_NO_EVAL = JSON.stringify({
  reply: 'Correct! Now explain the inputs to photosynthesis.',
  signals: {
    partial_progress: false,
    needs_deepening: false,
    understanding_check: false,
    ready_to_finish: false,
  },
  ui_hints: {
    note_prompt: { show: false, post_session: false },
  },
  private_sources: {
    relied_on: ['conversation_history'],
    insufficient: false,
    reason: 'test envelope',
  },
});

/**
 * Tutor envelope for the flag=OFF inline path — includes a solid
 * `challengeRoundEvaluation` so the inline path can advance the state machine.
 */
const TUTOR_ENVELOPE_WITH_EVAL = JSON.stringify({
  reply: 'Correct! Now explain the inputs to photosynthesis.',
  signals: {
    partial_progress: false,
    needs_deepening: false,
    understanding_check: false,
    ready_to_finish: false,
    challenge_round_evaluation: [
      {
        concept: 'photosynthesis',
        result: 'solid',
        evidence: 'Learner explained clearly.',
        learnerQuote: 'Plants use CO2, water, and sunlight.',
      },
    ],
  },
  ui_hints: {
    note_prompt: { show: false, post_session: false },
  },
  private_sources: {
    relied_on: ['conversation_history'],
    insufficient: false,
    reason: 'test envelope with eval',
  },
});

/** Solid grader verdict — matches the `challengeRoundGraderVerdictSchema`. */
const GRADER_VERDICT_SOLID = JSON.stringify({
  items: [
    {
      concept: 'photosynthesis inputs',
      result: 'solid',
      evidence: 'Learner correctly identified CO2, water, and sunlight.',
      learnerQuote: 'Plants use CO2, water, and sunlight.',
    },
  ],
});

function routeResult(response: string): RouteResult {
  return {
    response,
    provider: 'openai',
    model: 'test-model',
    latencyMs: 10,
    stopReason: 'stop',
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

let seedCounter = 0;

async function seedProfileAndSubject(
  db: Database,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_grader_integ_${RUN_ID}_${idx}`,
      email: `grader-integ-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Grader Tester ${idx}`,
      birthYear: 2006, // Under 18 → ageBracket='teen'
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: `Biology ${idx}`,
    })
    .returning({ id: subjects.id });

  return { profileId: profile!.id, subjectId: subject!.id };
}

async function seedCurriculumTopic(
  db: Database,
  subjectId: string,
): Promise<string> {
  const [{ id: curriculumId }] = await db
    .insert(curricula)
    .values({ subjectId })
    .returning({ id: curricula.id });

  const [{ id: bookId }] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      curriculumId,
      title: `Biology Book ${generateUUIDv7()}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });

  const [{ id: topicId }] = await db
    .insert(curriculumTopics)
    .values({
      bookId,
      curriculumId,
      title: 'Photosynthesis',
      description: 'Light reactions and Calvin cycle.',
      sortOrder: 1,
      estimatedMinutes: 20,
    })
    .returning({ id: curriculumTopics.id });

  return topicId;
}

/**
 * Seed a session with a challenge round already in `active` state.
 * `questionIndex=0, totalQuestions=1` so the NEXT answer_complete fires
 * immediately transitions to `drafting`.
 */
async function seedActiveSession(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<ReturnType<typeof mapSessionRow>> {
  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {
        challengeRound: {
          state: 'active',
          offerCount: 1,
          topicId,
          declinedDontAskAgain: false,
          questionIndex: 0,
          totalQuestions: 1,
          startedAt: new Date().toISOString(),
          evaluations: [],
          questionsAsked: 0,
        },
      },
    })
    .returning();
  return mapSessionRow(row!);
}

/**
 * Seed a session already in `drafting` state with one solid evaluation.
 * Used for the finalizeChallengeRoundIfReady mastery-verification test.
 */
async function seedDraftingSession(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
  answerEventId: string,
): Promise<ReturnType<typeof mapSessionRow>> {
  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {
        challengeRound: {
          state: 'drafting',
          offerCount: 1,
          topicId,
          declinedDontAskAgain: false,
          questionIndex: 1,
          totalQuestions: 1,
          startedAt: new Date().toISOString(),
          questionsAsked: 1,
          evaluations: [
            {
              concept: 'photosynthesis',
              result: 'solid',
              evidence: 'Clear explanation of the light reactions.',
              answerEventId,
              learnerQuote: 'Plants use sunlight to split water.',
            },
          ],
        },
      },
    })
    .returning();
  return mapSessionRow(row!);
}

/**
 * Seed a minimal `ai_response` session event so there is at least one prior
 * mentor question in `exchangeHistory` (used by T6 askedQuestion extraction).
 */
async function seedPriorAiResponse(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string,
  content: string,
): Promise<void> {
  await db.insert(sessionEvents).values({
    profileId,
    sessionId,
    topicId,
    eventType: 'ai_response',
    content,
    escalationRung: 1,
    metadata: { source: 'server' },
  });
}

async function readSessionChallengeRound(
  db: Database,
  sessionId: string,
): Promise<Record<string, unknown> | undefined> {
  const [row] = await db
    .select({ metadata: learningSessions.metadata })
    .from(learningSessions)
    .where(eq(learningSessions.id, sessionId));
  const meta = row?.metadata as Record<string, unknown> | undefined;
  return meta?.challengeRound as Record<string, unknown> | undefined;
}

async function readAssessmentsForSession(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<{ masteryChallengeVerifiedAt: Date | null }[]> {
  return db
    .select({
      masteryChallengeVerifiedAt: assessments.masteryChallengeVerifiedAt,
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.profileId, profileId),
        eq(assessments.sessionId, sessionId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIfDb('Challenge Round grader integration (T7)', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    // Cascade-delete test accounts; related rows follow FK ON DELETE CASCADE.
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_grader_integ_${RUN_ID}%`));
  });

  beforeEach(() => {
    mockRouteAndCall.mockReset();
    mockInngestSend.mockReset();
    mockInngestSend.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Mastery path (via finalizeChallengeRoundIfReady, no LLM call needed)
  // -------------------------------------------------------------------------

  it('finalizeChallengeRoundIfReady with solid evaluations → assessments row with masteryChallengeVerifiedAt', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const answerEventId = generateUUIDv7();
    const session = await seedDraftingSession(
      db,
      profileId,
      subjectId,
      topicId,
      answerEventId,
    );

    // Retrieve the drafting state from metadata
    const meta = await readSessionChallengeRound(db, session.id);
    expect(meta?.state).toBe('drafting');

    // Call the exported finalize function directly (no LLM, no processMessage)
    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta as Parameters<typeof finalizeChallengeRoundIfReady>[3],
      null,
    );

    // The claim succeeded and mastery was evaluated
    expect(result).not.toBeNull();

    // Verify assessments row created (markMasteryVerified: true)
    const rows = await readAssessmentsForSession(db, profileId, session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.masteryChallengeVerifiedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Flag=ON: grader-ON path
  //
  // CRITICAL T7 regression guard: if the guard-relaxation is missing, the
  // grader-ON active branch is gated on `payload.challengeRoundEvaluation?.length`
  // (the tutor array). With flag=ON the tutor emits NOTHING so the array
  // arrives as [] — the branch is silently skipped and the grader never runs.
  // This test verifies the branch now fires on `currentUserMessage` instead.
  // -------------------------------------------------------------------------

  it('[T7 RED→GREEN] flag=ON: grader provides solid evaluation → challenge round persists as drafting', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const session = await seedActiveSession(db, profileId, subjectId, topicId);

    // Seed a prior ai_response so exchangeHistory has at least one assistant turn
    // (T6: askedQuestion sourced from last assistant message).
    await seedPriorAiResponse(
      db,
      profileId,
      session.id,
      topicId,
      'What are the two main stages of photosynthesis?',
    );

    // Mock tutor → valid envelope (no challengeRoundEvaluation — grader provides it)
    // Mock grader → solid verdict (detectable by options.flow === 'challenge.grader')
    mockRouteAndCall.mockImplementation(
      (_messages, _rung, options): Promise<RouteResult> => {
        if ((options as { flow?: string })?.flow === 'challenge.grader') {
          return Promise.resolve(routeResult(GRADER_VERDICT_SOLID));
        }
        return Promise.resolve(routeResult(TUTOR_ENVELOPE_NO_EVAL));
      },
    );

    const result = await processMessage(
      db,
      profileId,
      session.id,
      { message: 'The light reactions and the Calvin cycle.' },
      {
        challengeRoundRuntimeEnabled: true,
        challengeRoundGraderEnabled: true,
      },
    );

    // The challenge round must have advanced (not still active)
    expect(result.challengeRound).toBeDefined();
    expect(result.challengeRound?.state).toBe('drafting');
    expect(result.challengeRound?.evaluations).toHaveLength(1);
    expect(result.challengeRound?.evaluations[0]?.result).toBe('solid');
    // T9: questionsAsked must be incremented
    expect(result.challengeRound?.questionsAsked).toBe(1);

    // Verify DB state matches the returned state
    const persisted = await readSessionChallengeRound(db, session.id);
    expect(persisted?.state).toBe('drafting');
    expect((persisted?.evaluations as unknown[])?.length).toBe(1);

    // Verify the grader was called (not the inline tutor path)
    const graderCalls = mockRouteAndCall.mock.calls.filter(
      ([, , opts]) => (opts as { flow?: string })?.flow === 'challenge.grader',
    );
    expect(graderCalls.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Flag=OFF: inline (legacy) path unchanged
  // -------------------------------------------------------------------------

  it('flag=OFF: tutor-supplied evaluation advances challenge round via inline path', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const session = await seedActiveSession(db, profileId, subjectId, topicId);

    await seedPriorAiResponse(
      db,
      profileId,
      session.id,
      topicId,
      'What are the two main stages of photosynthesis?',
    );

    // Tutor envelope carries inline evaluation (flag=OFF path relies on this)
    mockRouteAndCall.mockResolvedValue(routeResult(TUTOR_ENVELOPE_WITH_EVAL));

    const result = await processMessage(
      db,
      profileId,
      session.id,
      { message: 'The light reactions and the Calvin cycle.' },
      {
        challengeRoundRuntimeEnabled: true,
        challengeRoundGraderEnabled: false,
      },
    );

    // The inline path should also transition to drafting
    expect(result.challengeRound?.state).toBe('drafting');
    expect(result.challengeRound?.evaluations).toHaveLength(1);

    // Grader must NOT have been called on the flag=OFF path
    const graderCalls = mockRouteAndCall.mock.calls.filter(
      ([, , opts]) => (opts as { flow?: string })?.flow === 'challenge.grader',
    );
    expect(graderCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // T9 grader-stall guard integration: grader fail-open → questionsAsked
  // counter incremented → stall guard fires at cap → complete state persisted
  // -------------------------------------------------------------------------

  it('[T9] grader fail-opens (returns []) → questionsAsked increments, stall fires at cap', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);

    // Seed with MAX questions already asked and 0 evaluations → stall fires immediately.
    const [row] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId,
        sessionType: 'learning',
        inputMode: 'text',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        metadata: {
          challengeRound: {
            state: 'active',
            offerCount: 1,
            topicId,
            declinedDontAskAgain: false,
            questionIndex: 0,
            totalQuestions: MAX_CHALLENGE_QUESTIONS,
            startedAt: new Date().toISOString(),
            // Pre-primed: already at cap so the next increment hits the guard.
            questionsAsked: MAX_CHALLENGE_QUESTIONS - 1,
            evaluations: [],
          },
        },
      })
      .returning();
    const session = mapSessionRow(row!);

    await seedPriorAiResponse(
      db,
      profileId,
      session.id,
      topicId,
      'What is the Calvin cycle?',
    );

    // Grader always fail-opens → routeAndCall returns unparseable JSON
    mockRouteAndCall.mockImplementation(
      (_messages, _rung, options): Promise<RouteResult> => {
        if ((options as { flow?: string })?.flow === 'challenge.grader') {
          // Simulate a degraded grader response (schema_invalid)
          return Promise.resolve(routeResult('{"items":[]}'));
        }
        return Promise.resolve(routeResult(TUTOR_ENVELOPE_NO_EVAL));
      },
    );

    const result = await processMessage(
      db,
      profileId,
      session.id,
      { message: 'I do not know.' },
      {
        challengeRoundRuntimeEnabled: true,
        challengeRoundGraderEnabled: true,
      },
    );

    // T9 stall guard fired: state must be terminal (complete), not active
    expect(result.challengeRound?.state).toBe('complete');

    // Verify no assessments row was written (no mastery on stall)
    const rows = await readAssessmentsForSession(db, profileId, session.id);
    expect(rows).toHaveLength(0);

    // Verify DB state
    const persisted = await readSessionChallengeRound(db, session.id);
    expect(persisted?.state).toBe('complete');
  });

  // -------------------------------------------------------------------------
  // T9 + questionsAsked persistence: counter increments across turns when
  // grader succeeds (not just on stall)
  // -------------------------------------------------------------------------

  it('T9: questionsAsked is persisted and matches evaluation count after grader success', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const session = await seedActiveSession(db, profileId, subjectId, topicId);

    await seedPriorAiResponse(
      db,
      profileId,
      session.id,
      topicId,
      'What powers photosynthesis?',
    );

    mockRouteAndCall.mockImplementation(
      (_messages, _rung, options): Promise<RouteResult> => {
        if ((options as { flow?: string })?.flow === 'challenge.grader') {
          return Promise.resolve(routeResult(GRADER_VERDICT_SOLID));
        }
        return Promise.resolve(routeResult(TUTOR_ENVELOPE_NO_EVAL));
      },
    );

    const result = await processMessage(
      db,
      profileId,
      session.id,
      { message: 'Sunlight provides the energy.' },
      {
        challengeRoundRuntimeEnabled: true,
        challengeRoundGraderEnabled: true,
      },
    );

    // questionsAsked === evaluations.length → no stall (all graded)
    expect(result.challengeRound?.questionsAsked).toBe(1);
    expect(result.challengeRound?.evaluations).toHaveLength(1);
  });
});
