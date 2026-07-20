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
 * Integration-mock-guard compliant (apps/api `*.integration.test.ts`):
 *   - The LLM is stubbed at the PROVIDER-REGISTRY boundary — `routeAndCall`
 *     runs REAL and delegates to a branching fixture provider. The provider is
 *     registered under every id the router fallback may select so BOTH the
 *     tutor turn and the (vendor-independent) judge grader call land on it; the
 *     grader call is recognised by its distinctive rubric system prompt. This
 *     replaces the old internal-module mock of the `../llm` barrel, which the
 *     integration internal-mock guard correctly rejects
 *     (see test-utils/integration-mock-guard.test.ts).
 *   - The Inngest client is the one allowlisted internal boundary stub.
 *
 * No internal modules are mocked. All DB operations use the real test database.
 */

// ---------------------------------------------------------------------------
// Inngest is the sole allowlisted internal boundary stub for integration tests
// (test-utils/integration-mock-guard.test.ts → ALLOWED_INTERNAL_BOUNDARY_MOCKS).
// ---------------------------------------------------------------------------

const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../../inngest/client', () => {
  const actual = jest.requireActual(
    '../../inngest/client',
  ) as typeof import('../../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks — Jest hoist constraint)
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { and, eq, like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  assessments,
  challengeRoundCooldowns,
  createDatabase,
  createScopedRepository,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  membership,
  organization,
  person,
  retentionCards,
  sessionEvents,
  subjects,
  topicNotes,
  type Database,
} from '@eduagent/database';
import type { ChallengeRoundNoteDraftHint } from '@eduagent/schemas';
import {
  applyRetentionUpdate,
  insertRetentionCardIfAbsent,
} from '../apply-retention-update';
import { deleteV2IdentitiesForTest } from '../../test-utils/legacy-identity-anchors';
import {
  _resetCircuits,
  registerProvider,
  unregisterProvider,
  type LLMProvider,
} from '../llm';
import {
  makeChatStreamResult,
  type ChatMessage,
  type ChatResult,
  type ModelConfig,
} from '../llm/types';
import type { StopReason } from '../llm/stop-reason';
import { MAX_CHALLENGE_QUESTIONS } from '../challenge-round/caps';
import {
  processMessage,
  streamMessage,
  finalizeChallengeRoundIfReady,
} from './session-exchange';
import { mapSessionRow } from './session-events';
import {
  streamSessionResponse,
  type CreateSseResponse,
} from './session-stream-response';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

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

const TUTOR_ENVELOPE_WITH_ANSWER_EVALUATION = JSON.stringify({
  reply: 'The product is 42. What factor pair gives the same result?',
  signals: {
    partial_progress: false,
    needs_deepening: false,
    understanding_check: true,
    ready_to_finish: false,
    answer_evaluation: {
      correctness: 'correct',
      concept: 'multiplication',
    },
  },
  ui_hints: {
    note_prompt: { show: false, post_session: false },
  },
  private_sources: {
    relied_on: ['current_topic'],
    insufficient: false,
    reason: 'The seeded current topic supports this deterministic question.',
  },
  confidence: 'high',
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

/** Degraded grader verdict — an empty `items` array → fail-open ([]) in the service. */
const GRADER_VERDICT_EMPTY = JSON.stringify({ items: [] });

// ---------------------------------------------------------------------------
// Branching provider fixture — keeps `routeAndCall` real (provider-registry
// boundary, not a jest.mock of the internal llm module).
//
// The grader prompt opens with a unique rubric system message; we detect it to
// return the grader verdict, otherwise the tutor envelope. The provider is
// registered under every id the router's fallback chain may select, so the
// tutor turn AND the vendor-independent judge grader call both land here
// regardless of routing.
// ---------------------------------------------------------------------------

const GRADER_SYSTEM_MARKER = 'You are a precise grading assistant';
const FALLBACK_PROVIDER_IDS = ['gemini', 'anthropic', 'cerebras', 'openai'];
type TutorStreamFailurePhase = 'setup' | 'pre-first-byte' | 'mid-stream';

function isGraderMessages(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      typeof m.content === 'string' && m.content.includes(GRADER_SYSTEM_MARKER),
  );
}

function createBranchingLlm() {
  let tutorResponse = TUTOR_ENVELOPE_NO_EVAL;
  let graderResponse = GRADER_VERDICT_SOLID;
  let streamFailurePhase: TutorStreamFailurePhase | undefined;
  let tutorChatCalls = 0;
  let tutorChatStreamCalls = 0;
  const calls: ChatMessage[][] = [];

  function respond(messages: ChatMessage[]): string {
    calls.push(messages);
    return isGraderMessages(messages) ? graderResponse : tutorResponse;
  }

  const providers: LLMProvider[] = FALLBACK_PROVIDER_IDS.map((id) => ({
    id,
    async chat(
      messages: ChatMessage[],
      _config: ModelConfig,
    ): Promise<ChatResult> {
      if (!isGraderMessages(messages)) tutorChatCalls++;
      return { content: respond(messages), stopReason: 'stop' };
    },
    chatStream(messages: ChatMessage[], _config: ModelConfig) {
      const graderCall = isGraderMessages(messages);
      if (!graderCall) tutorChatStreamCalls++;
      const content = respond(messages);
      const tutorStreamFailure = graderCall ? undefined : streamFailurePhase;
      if (tutorStreamFailure === 'setup') {
        throw new Error('injected provider setup failure');
      }
      let resolveStopReason!: (reason: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((res) => {
        resolveStopReason = res;
      });
      async function* streamChunks(): AsyncIterable<string> {
        try {
          if (tutorStreamFailure === 'pre-first-byte') {
            throw new Error('injected pre-first-byte provider failure');
          }
          if (tutorStreamFailure === 'mid-stream') {
            yield '{"reply":"partial visible reply';
            throw new Error('injected mid-stream provider failure');
          }
          yield content;
        } finally {
          resolveStopReason('stop');
        }
      }
      return makeChatStreamResult(streamChunks(), stopReasonPromise);
    },
  }));

  return {
    // Register inside beforeAll (NOT at module load): the router's provider
    // registry is a shared singleton and the integration suite runs serially
    // in ONE worker (jest.integration.config.cjs: maxWorkers:1, no
    // resetModules). Module-level registration would pollute every other
    // suite's LLM calls. Mirrors the session-summary.integration.test pattern.
    register(): void {
      providers.forEach(registerProvider);
    },
    setTutorResponse(content: string): void {
      tutorResponse = content;
    },
    setGraderResponse(content: string): void {
      graderResponse = content;
    },
    setStreamFailurePhase(phase: TutorStreamFailurePhase | undefined): void {
      streamFailurePhase = phase;
    },
    tutorChatCallCount(): number {
      return tutorChatCalls;
    },
    tutorChatStreamCallCount(): number {
      return tutorChatStreamCalls;
    },
    graderCallCount(): number {
      return calls.filter(isGraderMessages).length;
    },
    reset(): void {
      tutorResponse = TUTOR_ENVELOPE_NO_EVAL;
      graderResponse = GRADER_VERDICT_SOLID;
      streamFailurePhase = undefined;
      tutorChatCalls = 0;
      tutorChatStreamCalls = 0;
      calls.length = 0;
    },
    // Unregister ONLY our own provider ids — never _clearProviders(), which
    // would wipe providers other suites in the same worker depend on.
    dispose(): void {
      providers.forEach((p) => unregisterProvider(p.id));
    },
  };
}

const llm = createBranchingLlm();

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

let seedCounter = 0;
const seededV2AccountIds: string[] = [];
const seededV2ProfileIds: string[] = [];

async function seedProfileAndSubject(
  db: Database,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  // [WI-867] v2 identity graph — loadProfileRowByIdV2 reads person unconditionally.
  await db
    .insert(organization)
    .values({ id: accountId, name: `Grader Org ${idx}` });
  await db.insert(person).values({
    id: profileId,
    displayName: `Grader Tester ${idx}`,
    birthDate: '2006-01-01',
    residenceJurisdiction: 'US',
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: ['learner'],
  });
  seededV2AccountIds.push(accountId);
  seededV2ProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Biology ${idx}`,
    })
    .returning({ id: subjects.id });

  return { profileId, subjectId: subject!.id };
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

async function seedOrdinarySession(
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
      exchangeCount: 1,
      metadata: {},
    })
    .returning();

  const session = mapSessionRow(row!);
  await seedPriorAiResponse(
    db,
    profileId,
    subjectId,
    session.id,
    topicId,
    'What is 6 multiplied by 7?',
  );
  return session;
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

  await db.insert(sessionEvents).values({
    id: answerEventId,
    profileId,
    subjectId,
    sessionId: row!.id,
    topicId,
    eventType: 'user_message',
    content: 'Plants use sunlight to split water.',
    metadata: { source: 'test' },
  });

  return mapSessionRow(row!);
}

/**
 * Seed a minimal `ai_response` session event so there is at least one prior
 * mentor question in `exchangeHistory` (used by T6 askedQuestion extraction).
 */
async function seedPriorAiResponse(
  db: Database,
  profileId: string,
  subjectId: string,
  sessionId: string,
  topicId: string,
  content: string,
): Promise<void> {
  await db.insert(sessionEvents).values({
    profileId,
    subjectId,
    sessionId,
    topicId,
    eventType: 'ai_response',
    content,
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

async function readAiEventById(
  db: Database,
  profileId: string,
  aiEventId: string,
): Promise<{ content: string; metadata: Record<string, unknown> } | undefined> {
  const [row] = await db
    .select({
      content: sessionEvents.content,
      metadata: sessionEvents.metadata,
    })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.id, aiEventId),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'ai_response'),
      ),
    );
  return row
    ? {
        content: row.content,
        metadata: row.metadata as Record<string, unknown>,
      }
    : undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIfDb('session exchange production-path integration', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
    llm.register();
  });

  afterAll(async () => {
    // [WI-867] Clean up v2 graph before accounts (no FK from accounts to org/person).
    if (seededV2AccountIds.length > 0 || seededV2ProfileIds.length > 0) {
      await deleteV2IdentitiesForTest(db, {
        accountIds: seededV2AccountIds,
        profileIds: seededV2ProfileIds,
      });
    }
    // Unregister only our providers — leave the shared registry intact for
    // other suites in this worker.
    llm.dispose();
  });

  beforeEach(() => {
    mockInngestSend.mockReset();
    mockInngestSend.mockResolvedValue(undefined);
    llm.reset();
    _resetCircuits();
  });

  async function seedAnswerEvaluationTurn() {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const session = await seedOrdinarySession(
      db,
      profileId,
      subjectId,
      topicId,
    );
    llm.setTutorResponse(TUTOR_ENVELOPE_WITH_ANSWER_EVALUATION);
    return { profileId, session };
  }

  async function expectPersistedAnswerEvaluation(
    profileId: string,
    aiEventId: string | undefined,
  ) {
    expect(aiEventId).toEqual(expect.any(String));
    const row = await readAiEventById(db, profileId, aiEventId!);
    expect(row).toBeDefined();
    expect(row?.content).toBe(
      'The product is 42. What factor pair gives the same result?',
    );
    expect(row?.metadata.answerEvaluation).toEqual({
      correctness: 'correct',
      concept: 'multiplication',
    });
    expect(row?.metadata.correctAnswer).toBe(true);
  }

  function captureSseFrames(): {
    frames: Array<Record<string, unknown>>;
    createSseResponse: CreateSseResponse;
  } {
    const frames: Array<Record<string, unknown>> = [];
    const createSseResponse: CreateSseResponse = async (handler) => {
      await handler({
        async writeSSE({ data }) {
          frames.push(JSON.parse(data) as Record<string, unknown>);
        },
      });
      return new Response(null, { status: 200 });
    };
    return { frames, createSseResponse };
  }

  it('[WI-1443] processMessage persists canonical answer evaluation by its returned aiEventId', async () => {
    const { profileId, session } = await seedAnswerEvaluationTurn();

    const result = await processMessage(
      db,
      profileId,
      session.id,
      { message: '42' },
      {
        semanticMemoryRetrievalEnabled: false,
        answerEvaluationEnabled: true,
      },
    );

    expect(result.answerEvaluation).toEqual({
      correctness: 'correct',
      concept: 'multiplication',
    });
    await expectPersistedAnswerEvaluation(profileId, result.aiEventId);
  });

  it('[WI-1443] drained streamMessage.onComplete persists canonical answer evaluation by its returned aiEventId', async () => {
    const { profileId, session } = await seedAnswerEvaluationTurn();

    const result = await streamMessage(
      db,
      profileId,
      session.id,
      { message: '42' },
      {
        semanticMemoryRetrievalEnabled: false,
        answerEvaluationEnabled: true,
      },
    );
    let visible = '';
    for await (const chunk of result.stream) visible += chunk;
    const completed = await result.onComplete();

    expect(visible).toContain('The product is 42.');
    expect(completed.answerEvaluation).toEqual({
      correctness: 'correct',
      concept: 'multiplication',
    });
    await expectPersistedAnswerEvaluation(profileId, completed.aiEventId);
  });

  it.each([
    {
      phase: 'setup',
      expectedFrameType: 'chunk',
      expectedStreamCalls: 1,
    },
    {
      phase: 'pre-first-byte',
      expectedFrameType: 'chunk',
      expectedStreamCalls: 2,
    },
    {
      phase: 'mid-stream',
      expectedFrameType: 'replace',
      expectedStreamCalls: 1,
    },
  ] as const)(
    '[WI-1443] $phase provider failure uses real processMessage fallback and persists its done aiEventId',
    async ({ phase, expectedFrameType, expectedStreamCalls }) => {
      const { profileId, session } = await seedAnswerEvaluationTurn();
      const { frames, createSseResponse } = captureSseFrames();
      llm.setStreamFailurePhase(phase);

      await streamSessionResponse({
        db,
        profileId,
        sessionId: session.id,
        input: { message: '42' },
        session: { exchangeCount: session.exchangeCount },
        subscriptionId: undefined,
        quota: {
          source: undefined,
          quotaModel: undefined,
          topUpCreditId: undefined,
        },
        streamOptions: {
          semanticMemoryRetrievalEnabled: false,
          answerEvaluationEnabled: true,
        },
        createSseResponse,
      });

      const done = frames.find((frame) => frame.type === 'done');
      expect(done).toBeDefined();
      expect(frames.some((frame) => frame.type === expectedFrameType)).toBe(
        true,
      );
      expect(llm.tutorChatStreamCallCount()).toBe(expectedStreamCalls);
      expect(llm.tutorChatCallCount()).toBe(1);
      await expectPersistedAnswerEvaluation(
        profileId,
        done?.aiEventId as string | undefined,
      );
    },
  );

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

  // [WI-1804] Real-DB proof that the completion cooldown upsert resolves a
  // genuine unique-constraint conflict via onConflictDoUpdate rather than
  // throwing — the unit-level fake-DB tests
  // (session-exchange-challenge-finalize.test.ts) never seed a pre-existing
  // row keyed by (profileId, topicId), so they cannot exercise the real
  // Postgres conflict path the way this test does.
  it('[WI-1804] finalizeChallengeRoundIfReady overwrites a prior decline cooldown row on a completion outcome', async () => {
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

    // Seed a PRIOR decline cooldown row for the same (profileId, topicId) —
    // mirrors declineChallengeRound's insert shape (route-actions.ts:113-128).
    await db.insert(challengeRoundCooldowns).values({
      profileId,
      topicId,
      lastOutcome: 0,
      lastOfferedAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const meta = await readSessionChallengeRound(db, session.id);
    expect(meta?.state).toBe('drafting');

    // seedDraftingSession's evaluation is a single solid item → outcome
    // 'verified' (lastOutcome 2). Finalize must overwrite the stale decline
    // row via onConflictDoUpdate, not throw a unique-constraint violation.
    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta as Parameters<typeof finalizeChallengeRoundIfReady>[3],
      null,
    );

    expect(result).not.toBeNull();

    const cooldownRows = await db
      .select({ lastOutcome: challengeRoundCooldowns.lastOutcome })
      .from(challengeRoundCooldowns)
      .where(
        and(
          eq(challengeRoundCooldowns.profileId, profileId),
          eq(challengeRoundCooldowns.topicId, topicId),
        ),
      );

    // Still exactly one row (upsert, not a duplicate insert), now reflecting
    // the completion outcome (verified → 2) instead of the stale decline (0).
    expect(cooldownRows).toHaveLength(1);
    expect(cooldownRows[0]!.lastOutcome).toBe(2);
  });

  // [WI-1658] Real-DB persistence assertion for the verified-proof note. The
  // unit-level gating tests (session-exchange-challenge-finalize.test.ts) use
  // a fake Database with no topic_notes surface and assert only the gating
  // decision via a boundary spy; this is the one place that exercises the
  // real createNoteForSession / insertNoteWithCap write end-to-end.
  it('[WI-1658] finalizeChallengeRoundIfReady with solid evaluations also persists a topic_notes row marked artifact_source challenge_drafted_note', async () => {
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
    const meta = await readSessionChallengeRound(db, session.id);

    const noteDraft: ChallengeRoundNoteDraftHint = {
      content: 'Plants use sunlight to split water.',
      source_concepts: ['photosynthesis'],
      source_answer_event_ids: [answerEventId],
    };

    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta as Parameters<typeof finalizeChallengeRoundIfReady>[3],
      noteDraft,
    );

    expect(result).not.toBeNull();
    expect(result?.draftedNote?.body).toBe(
      'Plants use sunlight to split water.',
    );

    const noteRows = await db
      .select({
        content: topicNotes.content,
        artifactSource: topicNotes.artifactSource,
      })
      .from(topicNotes)
      .where(
        and(
          eq(topicNotes.profileId, profileId),
          eq(topicNotes.topicId, topicId),
          eq(topicNotes.sessionId, session.id),
        ),
      );

    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]!.artifactSource).toBe('challenge_drafted_note');
    expect(noteRows[0]!.content).toBe('Plants use sunlight to split water.');
  });

  // -------------------------------------------------------------------------
  // [WI-1445] retention_cards.nextReviewAt seed — persistence-site guard.
  // MMT-ADR-0031: Challenge verification may seed the retention card's first
  // re-check promise but must never mark it permanently retained.
  // -------------------------------------------------------------------------

  it('[WI-1445] finalizeChallengeRoundIfReady seeds retention_cards.nextReviewAt for a NEW card', async () => {
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
    const meta = await readSessionChallengeRound(db, session.id);

    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta as Parameters<typeof finalizeChallengeRoundIfReady>[3],
      null,
    );
    expect(result).not.toBeNull();

    const repo = createScopedRepository(db, profileId);
    const card = await repo.retentionCards.findFirst(
      eq(retentionCards.topicId, topicId),
    );
    expect(card).toBeDefined();
    expect(card?.nextReviewAt ?? null).not.toBeNull();
    expect(card?.repetitions).toBe(1);
    // Never marks the card permanently retained (MMT-ADR-0031).
    expect(card?.xpStatus).toBe('pending');
    expect(card?.masteredAt ?? null).toBeNull();
  });

  it('[WI-1445] finalizeChallengeRoundIfReady advances nextReviewAt on an EXISTING card without touching xpStatus/masteredAt', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);

    // Pre-seed a retention card already SM-2-verified through ordinary review
    // (xpStatus: 'verified', a historical masteredAt, no nextReviewAt yet) —
    // simulates a topic that was reviewed to mastery before this Challenge
    // Round, exercising the ADR-0031 "verification never terminates SM-2"
    // guarantee against a card that already carries retained-state fields.
    // repetitions stays 0 throughout this seed (insertRetentionCardIfAbsent's
    // default), so this exercises the `repetitionsZero` guard branch against
    // a REAL Postgres connection — the integer-equality WHERE clause that
    // sidesteps the B73 optimistic-lock timestamp-precision issue (see
    // retention-data.ts's updateRetentionFromSession guard selection).
    await insertRetentionCardIfAbsent({ db, profileId, topicId });
    const repoBefore = createScopedRepository(db, profileId);
    const seeded = await repoBefore.retentionCards.findFirst(
      eq(retentionCards.topicId, topicId),
    );
    if (!seeded) throw new Error('retention card not seeded');
    const priorMasteredAt = new Date('2026-06-01T00:00:00.000Z');
    await applyRetentionUpdate({
      db,
      profileId,
      cardId: seeded.id,
      set: { xpStatus: 'verified', masteredAt: priorMasteredAt },
      guard: { kind: 'none' },
      updatedAt: new Date(),
    });

    const answerEventId = generateUUIDv7();
    const session = await seedDraftingSession(
      db,
      profileId,
      subjectId,
      topicId,
      answerEventId,
    );
    const meta = await readSessionChallengeRound(db, session.id);

    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta as Parameters<typeof finalizeChallengeRoundIfReady>[3],
      null,
    );
    expect(result).not.toBeNull();

    const repoAfter = createScopedRepository(db, profileId);
    const cardAfter = await repoAfter.retentionCards.findFirst(
      eq(retentionCards.topicId, topicId),
    );
    expect(cardAfter?.nextReviewAt ?? null).not.toBeNull();
    // ADR-0031: verification seeds scheduling but never marks retained —
    // the pre-existing xpStatus/masteredAt must survive unchanged.
    expect(cardAfter?.xpStatus).toBe('verified');
    expect(cardAfter?.masteredAt?.toISOString()).toBe(
      priorMasteredAt.toISOString(),
    );
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

  it('[T7 RED→GREEN] flag=ON: grader provides solid evaluation → challenge round completes', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const session = await seedActiveSession(db, profileId, subjectId, topicId);

    // Seed a prior ai_response so exchangeHistory has at least one assistant turn
    // (T6: askedQuestion sourced from last assistant message).
    await seedPriorAiResponse(
      db,
      profileId,
      subjectId,
      session.id,
      topicId,
      'What are the two main stages of photosynthesis?',
    );

    // Defaults: tutor → envelope WITHOUT eval; grader → solid verdict.
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

    // The challenge round must have advanced through drafting into terminal
    // completion once the solid grader evaluation satisfies finalization.
    expect(result.challengeRound).toBeDefined();
    expect(result.challengeRound?.state).toBe('complete');
    expect(result.challengeRound?.evaluations).toHaveLength(1);
    expect(result.challengeRound?.evaluations[0]?.result).toBe('solid');
    // T9: questionsAsked must be incremented
    expect(result.challengeRound?.questionsAsked).toBe(1);

    // Verify DB state matches the returned state
    const persisted = await readSessionChallengeRound(db, session.id);
    expect(persisted?.state).toBe('complete');
    expect((persisted?.evaluations as unknown[])?.length).toBe(1);

    const rows = await readAssessmentsForSession(db, profileId, session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.masteryChallengeVerifiedAt).not.toBeNull();

    // Verify the grader was actually called (not the inline tutor path)
    expect(llm.graderCallCount()).toBe(1);
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
      subjectId,
      session.id,
      topicId,
      'What is the Calvin cycle?',
    );

    // Grader fail-opens → returns an empty `items` array (schema-valid but no
    // evaluations), which the service treats as a degraded/empty result.
    llm.setGraderResponse(GRADER_VERDICT_EMPTY);

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
      subjectId,
      session.id,
      topicId,
      'What powers photosynthesis?',
    );

    // Defaults: tutor → envelope WITHOUT eval; grader → solid verdict.
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
