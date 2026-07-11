/**
 * Integration: verified-learning loop (WI-1666, S8 of the loop map in
 * docs/specs/2026-07-06-verified-learning-loop.md, WI-1657 AC6).
 *
 * One journey, four variants, asserted against real services + real DB (no
 * internal mocks — GC1). Every variant calls `finalizeChallengeRoundIfReady`
 * directly rather than driving the full `processMessage`/LLM pipeline: the
 * AC's own file:line citations point at this and its sibling service
 * functions (`decideMasteryAndReview`, `validateNoteDraft`,
 * `applyRetentionUpdate`/`processRecallResult`, `getOverdueTopicsGrouped`,
 * `buildNowFeed`, `getTopicProgress`) — none of which call the LLM. No
 * `routeAndCall`/provider-registry stubbing is needed beyond the global
 * default `tests/integration/setup.ts` already registers.
 *
 * Scope decisions (see _plan-WI-1666.md for the full rationale):
 *  - `draftedNote` is asserted as a RESPONSE PAYLOAD value only. Nothing in
 *    `session-exchange.ts` persists it to a notes table today (WI-1788 tracks
 *    that gap separately).
 *  - `masteryVerificationState` is asserted via `getTopicProgress` (the real
 *    read-path builder), not via a direct `resolveMasteryVerificationState`
 *    call — WI-1469 owns the unit-grain 4-quadrant coverage at that helper's
 *    call sites in `progress.ts`. This suite proves the segment-2→read
 *    hand-off, not the helper's own branch coverage.
 *  - Variant (d)'s staleness signal is driven by a SECOND real Challenge
 *    Round (a `partial` evaluation on the same topic), not a raw
 *    `db.insert(needsDeepeningTopics)` — `resolveMasteryVerificationState`'s
 *    'stale' state and SM-2 decay are independent axes; only the former is
 *    driven by `needs_deepening_topics` rows, and today's decay/review path
 *    writes no such row (confirmed: zero `needsDeepeningTopics` references in
 *    `review-calibration-grade.ts`).
 */

import { resolve } from 'path';
import { and, eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '../../packages/test-utils/src';
import {
  assessments,
  createDatabase,
  createScopedRepository,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  membership,
  needsDeepeningTopics,
  organization,
  person,
  retentionCards,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureLegacyProfileAnchorForTest,
  legacyIdentityTableExistsForTest,
} from '../../apps/api/src/test-utils/legacy-identity-anchors';
import { finalizeChallengeRoundIfReady } from '../../apps/api/src/services/session/session-exchange';
import { mapSessionRow } from '../../apps/api/src/services/session/session-events';
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundSessionState,
} from '@eduagent/schemas';

/** `finalizeChallengeRoundIfReady`'s success-return shape is not exported by
 * name from session-exchange.ts (private interface) — derive it structurally. */
type ChallengeRoundRuntimeOutcome = NonNullable<
  Awaited<ReturnType<typeof finalizeChallengeRoundIfReady>>
>;
import {
  applyRetentionUpdate,
  insertRetentionCardIfAbsent,
} from '../../apps/api/src/services/apply-retention-update';
import { processRecallResult } from '../../apps/api/src/services/retention';
import { getOverdueTopicsGrouped } from '../../apps/api/src/services/overdue-topics';
import { buildNowFeed } from '../../apps/api/src/services/now-feed';
import { getTopicProgress } from '../../apps/api/src/services/progress';

loadDatabaseEnv(resolve(__dirname, '../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

// ---------------------------------------------------------------------------
// Seed helpers — modeled on
// apps/api/src/services/session/session-exchange.integration.test.ts:236-416
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
  const clerkUserId = `clerk_wi1666_${RUN_ID}_${idx}`;
  const email = `wi1666-${RUN_ID}-${idx}@test.invalid`;

  await ensureLegacyProfileAnchorForTest(db, {
    profileId,
    accountId,
    displayName: `Loop Tester ${idx}`,
    birthYear: 2006,
    isOwner: true,
    clerkUserId,
    email,
  });

  await db
    .insert(organization)
    .values({ id: accountId, name: `Loop Org ${idx}` });
  await db.insert(person).values({
    id: profileId,
    displayName: `Loop Tester ${idx}`,
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
    .values({ profileId, name: `Biology ${idx}` })
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
      title: `Loop Book ${generateUUIDv7()}`,
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

/** Learner text shared deliberately with the note draft so the lexical-overlap
 * guard (validateNoteDraft) passes on real DB-verified content. */
const LEARNER_ANSWER =
  'Plants use sunlight and water and carbon dioxide to make their own food through photosynthesis.';
const NOTE_DRAFT_CONTENT =
  'I learned that plants use sunlight, water, and carbon dioxide to make their own food.';

async function seedDraftingSession(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
  evaluations: ChallengeRoundEvaluationItem[],
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
          evaluations,
        },
      },
    })
    .returning();

  for (const evalItem of evaluations) {
    await db.insert(sessionEvents).values({
      id: evalItem.answerEventId,
      profileId,
      subjectId,
      sessionId: row!.id,
      topicId,
      eventType: 'user_message',
      content: LEARNER_ANSWER,
      metadata: { source: 'test' },
    });
  }

  return mapSessionRow(row!);
}

async function readSessionChallengeRound(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<ChallengeRoundSessionState> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  const meta = row?.metadata as Record<string, unknown> | undefined;
  return meta?.challengeRound as unknown as ChallengeRoundSessionState;
}

async function readAssessmentsForSession(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<{ masteryChallengeVerifiedAt: Date | null }[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.assessments.findMany(
    eq(assessments.sessionId, sessionId),
  );
  return rows.map((row) => ({
    masteryChallengeVerifiedAt: row.masteryChallengeVerifiedAt,
  }));
}

/** Mark a session `completed` so it never competes for a Now-feed
 * `unfinished_session` candidate slot alongside the `retention_due` card
 * under test — isolates the assertion to the signal under test. */
async function markSessionCompleted(
  db: Database,
  profileId: string,
  sessionId: string,
) {
  await db
    .update(learningSessions)
    .set({ status: 'completed' })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    );
}

function nextAnswerEventId(): string {
  return generateUUIDv7();
}

/** Drive one real Challenge Round to `verified` (all-solid). Returns the
 * session id and the finalize outcome. */
async function driveVerifiedChallengeRound(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string,
): Promise<{ sessionId: string; result: ChallengeRoundRuntimeOutcome }> {
  const answerEventId = nextAnswerEventId();
  const session = await seedDraftingSession(db, profileId, subjectId, topicId, [
    {
      concept: 'photosynthesis inputs',
      result: 'solid',
      evidence: 'Learner correctly named all three inputs.',
      answerEventId,
      learnerQuote: LEARNER_ANSWER,
    },
  ]);
  const meta = await readSessionChallengeRound(db, profileId, session.id);
  const result = await finalizeChallengeRoundIfReady(
    db,
    profileId,
    session,
    meta,
    {
      source_answer_event_ids: [answerEventId],
      content: NOTE_DRAFT_CONTENT,
    },
  );
  if (!result) {
    throw new Error('driveVerifiedChallengeRound: finalize returned null');
  }
  return { sessionId: session.id, result };
}

describeIfDb('Verified-learning loop (WI-1666, S8)', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    if (seededV2AccountIds.length > 0 || seededV2ProfileIds.length > 0) {
      await deleteV2IdentitiesForTest(db, {
        accountIds: seededV2AccountIds,
        profileIds: seededV2ProfileIds,
      });
    }
    if (await legacyIdentityTableExistsForTest(db, 'accounts')) {
      await db.execute(
        sql`DELETE FROM accounts WHERE clerk_user_id LIKE ${`clerk_wi1666_${RUN_ID}%`}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Variant (a) — verified
  // -------------------------------------------------------------------------

  it('(a) verified: all-solid Challenge Round → mastery stamped, note drafted, fresh verification state', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);

    const { sessionId, result } = await driveVerifiedChallengeRound(
      db,
      profileId,
      subjectId,
      topicId,
    );

    expect(result.challengeRoundVerdict).toEqual({
      solidCount: 1,
      partialCount: 0,
      missingCount: 0,
      misconceptionCount: 0,
    });

    // Note-draft guard passed on real DB-verified content — response payload
    // only (WI-1788 tracks server-side persistence separately).
    expect(result.draftedNote).toBeDefined();
    expect(result.draftedNote?.body).toBe(NOTE_DRAFT_CONTENT);

    const assessmentRows = await readAssessmentsForSession(
      db,
      profileId,
      sessionId,
    );
    expect(assessmentRows).toHaveLength(1);
    expect(assessmentRows[0]!.masteryChallengeVerifiedAt).not.toBeNull();

    const progress = await getTopicProgress(db, profileId, subjectId, topicId);
    expect(progress?.masteryVerificationState).toBe('fresh');
  });

  it('(a) verified Challenge Round seeds retention_cards.nextReviewAt (WI-1445)', async () => {
    // WI-1445: finalizeChallengeRoundIfReady now schedules retention_cards.nextReviewAt
    // as the first re-check promise on an all-solid Challenge Round (MMT-ADR-0031 —
    // verification seeds retention scheduling but never terminates it).
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    await insertRetentionCardIfAbsent({ db, profileId, topicId });

    await driveVerifiedChallengeRound(db, profileId, subjectId, topicId);

    const repo = createScopedRepository(db, profileId);
    const card = await repo.retentionCards.findFirst(
      eq(retentionCards.topicId, topicId),
    );
    expect(card?.nextReviewAt ?? null).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Variant (b) — partial
  // -------------------------------------------------------------------------

  it('(b) partial: no mastery, weak concept routed to needs_deepening_topics, no note drafted', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const answerEventId = nextAnswerEventId();

    const session = await seedDraftingSession(
      db,
      profileId,
      subjectId,
      topicId,
      [
        {
          concept: 'photosynthesis inputs',
          result: 'partial',
          evidence: 'Learner named water and sunlight but omitted CO2.',
          answerEventId,
          learnerQuote: LEARNER_ANSWER,
        },
      ],
    );
    const meta = await readSessionChallengeRound(db, profileId, session.id);
    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta,
      null,
    );
    expect(result).not.toBeNull();

    expect(result!.challengeRoundVerdict).toEqual({
      solidCount: 0,
      partialCount: 1,
      missingCount: 0,
      misconceptionCount: 0,
    });

    const assessmentRows = await readAssessmentsForSession(
      db,
      profileId,
      session.id,
    );
    expect(assessmentRows).toHaveLength(0);

    const repo = createScopedRepository(db, profileId);
    const deepeningRows = await repo.needsDeepeningTopics.findMany(
      and(
        eq(needsDeepeningTopics.topicId, topicId),
        eq(needsDeepeningTopics.source, 'challenge_round'),
      ),
    );
    expect(deepeningRows).toHaveLength(1);
    expect(deepeningRows[0]!.status).toBe('pending_review');
    expect(deepeningRows[0]!.concept).toBe('photosynthesis inputs');

    // Zero solid concepts → buildFallbackDraft returns undefined (no note
    // object at all), not a body:null fallback object. Asserting the tighter
    // `toBeUndefined()` (rather than `?.body ?? null`) also catches an
    // unexpected guard-failed fallback object slipping through as a false pass.
    expect(result!.draftedNote).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Variant (c) — misconception
  // -------------------------------------------------------------------------

  it('(c) misconception: no mastery, correction captured in needs_deepening_topics', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);
    const answerEventId = nextAnswerEventId();

    const session = await seedDraftingSession(
      db,
      profileId,
      subjectId,
      topicId,
      [
        {
          concept: 'photosynthesis inputs',
          result: 'misconception',
          evidence:
            'Learner claimed plants absorb oxygen, not CO2, as an input.',
          answerEventId,
          learnerQuote: LEARNER_ANSWER,
          correction:
            'Plants take in carbon dioxide, not oxygen, during photosynthesis.',
        },
      ],
    );
    const meta = await readSessionChallengeRound(db, profileId, session.id);
    const result = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      meta,
      null,
    );
    expect(result).not.toBeNull();

    expect(result!.challengeRoundVerdict).toEqual({
      solidCount: 0,
      partialCount: 0,
      missingCount: 0,
      misconceptionCount: 1,
    });

    const assessmentRows = await readAssessmentsForSession(
      db,
      profileId,
      session.id,
    );
    expect(assessmentRows).toHaveLength(0);

    const repo = createScopedRepository(db, profileId);
    const deepeningRows = await repo.needsDeepeningTopics.findMany(
      and(
        eq(needsDeepeningTopics.topicId, topicId),
        eq(needsDeepeningTopics.source, 'challenge_round'),
      ),
    );
    expect(deepeningRows).toHaveLength(1);
    expect(deepeningRows[0]!.misconception).toBe(
      'Learner claimed plants absorb oxygen, not CO2, as an input.',
    );
    expect(deepeningRows[0]!.correction).toBe(
      'Plants take in carbon dioxide, not oxygen, during photosynthesis.',
    );
  });

  // -------------------------------------------------------------------------
  // Variant (d) — decay/retest
  // -------------------------------------------------------------------------

  it('(d) decay/retest: verified topic decays and goes stale, surfaces as due, re-prove reachable', async () => {
    const { profileId, subjectId } = await seedProfileAndSubject(db);
    const topicId = await seedCurriculumTopic(db, subjectId);

    // Step 1: real Challenge Round to verified — masteryVerificationState starts 'fresh'.
    const { sessionId: firstSessionId } = await driveVerifiedChallengeRound(
      db,
      profileId,
      subjectId,
      topicId,
    );
    await markSessionCompleted(db, profileId, firstSessionId);

    const freshProgress = await getTopicProgress(
      db,
      profileId,
      subjectId,
      topicId,
    );
    expect(freshProgress?.masteryVerificationState).toBe('fresh');

    // Step 2: seed + advance the retention card to 'verified' (simulating a
    // prior delayed-recall success), matching the real xpStatus lifecycle.
    await insertRetentionCardIfAbsent({ db, profileId, topicId });
    const repo = createScopedRepository(db, profileId);
    const cardBefore = await repo.retentionCards.findFirst(
      eq(retentionCards.topicId, topicId),
    );
    if (!cardBefore) throw new Error('retention card not seeded');

    const futureReview = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await applyRetentionUpdate({
      db,
      profileId,
      cardId: cardBefore.id,
      set: { xpStatus: 'verified', nextReviewAt: futureReview },
      guard: { kind: 'none' },
      updatedAt: new Date(),
    });

    // Step 3 (Axis B, real write path): a failed recall decays the card via
    // the real SM-2 pathway (retention.ts:121-124, verified -> decayed).
    const stateForRecall = {
      topicId,
      easeFactor: Number(cardBefore.easeFactor),
      intervalDays: cardBefore.intervalDays,
      repetitions: cardBefore.repetitions,
      failureCount: cardBefore.failureCount,
      consecutiveSuccesses: cardBefore.consecutiveSuccesses,
      xpStatus: 'verified' as const,
      nextReviewAt: futureReview.toISOString(),
      lastReviewedAt: null,
    };
    const recall = processRecallResult(stateForRecall, 1 /* fail */);
    expect(recall.passed).toBe(false);
    expect(recall.newState.xpStatus).toBe('decayed');

    const pastReview = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await applyRetentionUpdate({
      db,
      profileId,
      cardId: cardBefore.id,
      set: {
        xpStatus: recall.newState.xpStatus,
        easeFactor: recall.newState.easeFactor,
        intervalDays: recall.newState.intervalDays,
        repetitions: recall.newState.repetitions,
        failureCount: recall.newState.failureCount,
        consecutiveSuccesses: recall.newState.consecutiveSuccesses,
        // Force the schedule into the past so the card surfaces as due —
        // isolates the "surfaces as due" assertion from real-time SM-2 interval math.
        nextReviewAt: pastReview,
      },
      guard: { kind: 'none' },
      updatedAt: new Date(),
    });

    const cardAfter = await repo.retentionCards.findFirst(
      eq(retentionCards.topicId, topicId),
    );
    expect(cardAfter?.xpStatus).toBe('decayed');

    // Step 4 (Axis A, real write path): a SECOND real Challenge Round with a
    // partial evaluation inserts a needs_deepening_topics row dated after the
    // first verification, via the real persistChallengeRoundReviewTargets path.
    const secondAnswerEventId = nextAnswerEventId();
    const secondSession = await seedDraftingSession(
      db,
      profileId,
      subjectId,
      topicId,
      [
        {
          concept: 'photosynthesis inputs',
          result: 'partial',
          evidence: 'Learner could not recall the full input list on re-check.',
          answerEventId: secondAnswerEventId,
          learnerQuote: LEARNER_ANSWER,
        },
      ],
    );
    const secondMeta = await readSessionChallengeRound(
      db,
      profileId,
      secondSession.id,
    );
    const secondResult = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      secondSession,
      secondMeta,
      null,
    );
    expect(secondResult).not.toBeNull();
    await markSessionCompleted(db, profileId, secondSession.id);

    const staleProgress = await getTopicProgress(
      db,
      profileId,
      subjectId,
      topicId,
    );
    expect(staleProgress?.masteryVerificationState).toBe('stale');

    // Step 5: surfaces as due.
    const overdue = await getOverdueTopicsGrouped(db, profileId);
    const overdueTopicIds = overdue.subjects.flatMap((s) =>
      s.topics.map((t) => t.topicId),
    );
    expect(overdueTopicIds).toContain(topicId);

    const nowFeed = await buildNowFeed(db, profileId, 'self');
    const retentionDueCard = nowFeed.cards.find(
      (c) => c.kind === 'retention_due' && c.params?.topicId === topicId,
    );
    expect(retentionDueCard).toBeDefined();

    // Step 6: re-prove path reachable — the weak-spot row from Step 4 is in an
    // actionable status a re-prove flow (S3b/S3c, future WIs) would consume.
    const deepeningRows = await repo.needsDeepeningTopics.findMany(
      and(
        eq(needsDeepeningTopics.topicId, topicId),
        eq(needsDeepeningTopics.source, 'challenge_round'),
      ),
    );
    expect(
      deepeningRows.some((r) =>
        ['active', 'pending_review'].includes(r.status),
      ),
    ).toBe(true);
  });
});
