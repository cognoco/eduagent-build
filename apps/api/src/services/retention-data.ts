// ---------------------------------------------------------------------------
// Retention Data Service — Sprint 8 Phase 1
// DB-aware functions for retention routes. Delegates computation to
// services/retention.ts (pure SM-2 logic).
// ---------------------------------------------------------------------------

import { eq, and, inArray } from 'drizzle-orm';
import {
  subjects,
  curricula,
  curriculumTopics,
  retentionCards,
  needsDeepeningTopics,
  teachingPreferences,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  RetentionCardResponse,
  RecallTestSubmitInput,
  RelearnTopicInput,
  NeedsDeepeningStatus,
  TopicStability,
} from '@eduagent/schemas';
import { sm2 } from '@eduagent/retention';
import {
  processRecallResult,
  getRetentionStatus,
  isTopicStable,
  canRetestTopic,
  type RetentionState,
} from './retention';
import { canExitNeedsDeepening } from './adaptive-teaching';
import { syncXpLedgerStatus } from './xp';
import { routeAndCall, type ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapRetentionCardRow(
  row: typeof retentionCards.$inferSelect
): RetentionCardResponse {
  return {
    topicId: row.topicId,
    easeFactor: Number(row.easeFactor),
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
    xpStatus: row.xpStatus as 'pending' | 'verified' | 'decayed',
    failureCount: row.failureCount,
    evaluateDifficultyRung: row.evaluateDifficultyRung as 1 | 2 | 3 | 4 | null,
  };
}

function rowToRetentionState(
  row: typeof retentionCards.$inferSelect
): RetentionState {
  return {
    topicId: row.topicId,
    easeFactor: Number(row.easeFactor),
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    failureCount: row.failureCount,
    consecutiveSuccesses: row.consecutiveSuccesses,
    xpStatus: row.xpStatus as 'pending' | 'verified' | 'decayed',
    nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recall quality evaluation (LLM-based, Epic 3 Story 3.2)
// ---------------------------------------------------------------------------

const RECALL_QUALITY_PROMPT = `You are an educational assessment evaluator. Given a topic title and a learner's recall answer, rate the quality of their recall on the SM-2 scale:

5 = Perfect response with no hesitation
4 = Correct response after some thought
3 = Correct but with significant difficulty
2 = Incorrect, but the answer shows some relevant knowledge
1 = Incorrect, barely related to the topic
0 = Complete blackout, no meaningful content

Consider:
- Does the answer demonstrate understanding of the topic?
- Is the answer factually accurate for the topic?
- How complete is the coverage of key concepts?

Respond with ONLY a single digit (0-5).`;

/**
 * Evaluates recall answer quality using LLM (rung 1 — Gemini Flash).
 * Falls back to the length-based heuristic if the LLM returns an unparseable result.
 */
export async function evaluateRecallQuality(
  answer: string,
  topicTitle: string
): Promise<number> {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: RECALL_QUALITY_PROMPT },
      {
        role: 'user',
        content: `Topic: ${topicTitle}\n\nLearner's answer: ${answer}`,
      },
    ];

    const result = await routeAndCall(messages, 1);
    const parsed = parseInt(result.response.trim(), 10);

    if (Number.isNaN(parsed) || parsed < 0 || parsed > 5) {
      // Fallback: length heuristic
      return answer.length > 100 ? 4 : answer.length > 20 ? 3 : 2;
    }

    return parsed;
  } catch {
    // LLM failure fallback
    return answer.length > 100 ? 4 : answer.length > 20 ? 3 : 2;
  }
}

// ---------------------------------------------------------------------------
// Auto-creation helper — ensures a retention card exists for a topic
// ---------------------------------------------------------------------------

/**
 * Ensures a retention card exists for the given (profileId, topicId) pair.
 * Uses INSERT ... ON CONFLICT DO NOTHING to handle races safely.
 * Returns the existing or newly created card.
 */
export async function ensureRetentionCard(
  db: Database,
  profileId: string,
  topicId: string
): Promise<typeof retentionCards.$inferSelect> {
  await db
    .insert(retentionCards)
    .values({
      profileId,
      topicId,
      easeFactor: '2.50',
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
    })
    .onConflictDoNothing({
      target: [retentionCards.profileId, retentionCards.topicId],
    });

  // Read back the card (either newly created or pre-existing)
  const card = await db.query.retentionCards.findFirst({
    where: and(
      eq(retentionCards.profileId, profileId),
      eq(retentionCards.topicId, topicId)
    ),
  });

  // Should never happen — the insert-or-noop guarantees the row exists
  if (!card) {
    throw new Error(
      `Failed to ensure retention card for profile=${profileId} topic=${topicId}`
    );
  }

  return card;
}

// ---------------------------------------------------------------------------
// Core query functions
// ---------------------------------------------------------------------------

export async function getSubjectRetention(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<{
  topics: (RetentionCardResponse & { topicTitle: string })[];
  reviewDueCount: number;
}> {
  const repo = createScopedRepository(db, profileId);

  // Verify subject belongs to profile
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return { topics: [], reviewDueCount: 0 };

  // Find curriculum topics for this subject
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
  });
  if (!curriculum) return { topics: [], reviewDueCount: 0 };

  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
  });
  const topicIds = topics.map((t) => t.id);
  const topicTitleMap = new Map(topics.map((t) => [t.id, t.title]));

  // Get retention cards for this subject's topics (DB-level filter — issue #22.2)
  const subjectCards =
    topicIds.length > 0
      ? await repo.retentionCards.findMany(
          inArray(retentionCards.topicId, topicIds)
        )
      : [];

  const now = new Date();
  const reviewDueCount = subjectCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime()
  ).length;

  return {
    topics: subjectCards.map((card) => ({
      ...mapRetentionCardRow(card),
      topicTitle: topicTitleMap.get(card.topicId) ?? card.topicId,
    })),
    reviewDueCount,
  };
}

export async function getTopicRetention(
  db: Database,
  profileId: string,
  topicId: string
): Promise<RetentionCardResponse | null> {
  const repo = createScopedRepository(db, profileId);
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );
  return card ? mapRetentionCardRow(card) : null;
}

/** Anti-cramming cooldown in milliseconds (24 hours — FR54) */
const RETEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface RecallTestRemediation {
  action: 'redirect_to_library';
  topicId: string;
  topicTitle: string;
  retentionStatus: string;
  failureCount: number;
  cooldownEndsAt: string;
  options: Array<'review_and_retest' | 'relearn_topic'>;
}

export interface RecallTestResponse {
  passed: boolean;
  masteryScore: number;
  xpChange: string;
  nextReviewAt: string;
  failureCount: number;
  hint?: string;
  failureAction?: 'feedback_only' | 'redirect_to_library';
  remediation?: RecallTestRemediation;
  cooldownActive?: boolean;
  cooldownEndsAt?: string;
}

function buildRecallHint(
  topicTitle: string,
  topicDescription?: string | null
): string {
  const hintSource = topicDescription?.trim()
    ? topicDescription.trim()
    : `${topicTitle} is the key idea to focus on.`;
  return `That's okay — let's see what you do remember. Here's a hint: ${hintSource} Does anything come back?`;
}

export async function processRecallTest(
  db: Database,
  profileId: string,
  input: RecallTestSubmitInput
): Promise<RecallTestResponse> {
  const repo = createScopedRepository(db, profileId);
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, input.topicId)
  );

  // Auto-create retention card on first encounter
  const effectiveCard =
    card ?? (await ensureRetentionCard(db, profileId, input.topicId));

  // FR54: Anti-cramming cooldown — 24-hour minimum between recall tests
  const state = rowToRetentionState(effectiveCard);
  const lastTestAt = effectiveCard.lastReviewedAt?.toISOString() ?? null;
  const attemptMode = input.attemptMode ?? 'standard';
  if (!canRetestTopic(state, lastTestAt)) {
    // non-null: canRetestTopic returns true when lastTestAt is null,
    // so we only reach this branch when lastTestAt is set.
    const cooldownEndsAt = new Date(
      new Date(lastTestAt!).getTime() + RETEST_COOLDOWN_MS
    ).toISOString();
    return {
      passed: false,
      masteryScore: 0,
      xpChange: 'none',
      nextReviewAt:
        effectiveCard.nextReviewAt?.toISOString() ?? new Date().toISOString(),
      failureCount: effectiveCard.failureCount,
      failureAction: 'feedback_only',
      cooldownActive: true,
      cooldownEndsAt,
    };
  }

  // Look up topic title for LLM evaluation context
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, input.topicId),
  });
  const topicTitle = topic?.title ?? input.topicId;
  const quality =
    attemptMode === 'dont_remember'
      ? 0
      : await evaluateRecallQuality(input.answer ?? '', topicTitle);
  // state was already computed above for cooldown check — reuse it
  const result = processRecallResult(state, quality);

  // Persist updated retention card
  await db
    .update(retentionCards)
    .set({
      easeFactor: String(result.newState.easeFactor),
      intervalDays: result.newState.intervalDays,
      repetitions: result.newState.repetitions,
      failureCount: result.newState.failureCount,
      consecutiveSuccesses: result.newState.consecutiveSuccesses,
      xpStatus: result.newState.xpStatus,
      nextReviewAt: result.newState.nextReviewAt
        ? new Date(result.newState.nextReviewAt)
        : null,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(retentionCards.id, effectiveCard.id),
        eq(retentionCards.profileId, profileId)
      )
    );

  // Sync xp_ledger to match the retention card's new xpStatus (best-effort —
  // XP bookkeeping should not abort the recall test response)
  if (result.xpChange === 'verified' || result.xpChange === 'decayed') {
    try {
      await syncXpLedgerStatus(db, profileId, input.topicId, result.xpChange);
    } catch (err) {
      console.error('[processRecallTest] XP sync failed (non-fatal):', err);
    }
  }

  const response: RecallTestResponse = {
    passed: result.passed,
    masteryScore: result.passed ? 0.75 : 0.4,
    xpChange: result.xpChange,
    nextReviewAt: result.newState.nextReviewAt ?? new Date().toISOString(),
    failureCount: result.newState.failureCount,
    failureAction: result.failureAction,
  };

  if (
    attemptMode === 'dont_remember' &&
    result.failureAction !== 'redirect_to_library'
  ) {
    response.hint = buildRecallHint(topicTitle, topic?.description);
  }

  // Add remediation data when redirect is triggered (3+ failures)
  if (result.failureAction === 'redirect_to_library') {
    const retentionStatus = getRetentionStatus(result.newState);
    const cooldownEndsAt = new Date(
      Date.now() + RETEST_COOLDOWN_MS
    ).toISOString();

    response.remediation = {
      action: 'redirect_to_library',
      topicId: input.topicId,
      topicTitle,
      retentionStatus,
      failureCount: result.newState.failureCount,
      cooldownEndsAt,
      options: ['review_and_retest', 'relearn_topic'],
    };
  }

  return response;
}

export interface RelearnResponse {
  message: string;
  topicId: string;
  method: string;
  preferredMethod?: string;
  sessionId: string | null;
  resetPerformed: boolean;
}

export async function startRelearn(
  db: Database,
  profileId: string,
  input: RelearnTopicInput
): Promise<RelearnResponse> {
  // Find subjectId through the topic's curriculum chain
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, input.topicId),
  });
  const curriculum = topic
    ? await db.query.curricula.findFirst({
        where: eq(curricula.id, topic.curriculumId),
      })
    : null;

  const subjectId = curriculum?.subjectId ?? null;

  // Mark topic as needs deepening if not already
  const repo = createScopedRepository(db, profileId);
  const existing = await repo.needsDeepeningTopics.findMany(
    eq(needsDeepeningTopics.topicId, input.topicId)
  );
  const active = existing.find((d) => d.status === 'active');

  if (!active && subjectId) {
    await db.insert(needsDeepeningTopics).values({
      profileId,
      subjectId,
      topicId: input.topicId,
      status: 'active',
    });
  }

  // Reset retention card to initial SM-2 state (mastery reset)
  const resetRows = await db
    .update(retentionCards)
    .set({
      easeFactor: '2.50',
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
      nextReviewAt: null,
      lastReviewedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(retentionCards.topicId, input.topicId),
        eq(retentionCards.profileId, profileId)
      )
    )
    .returning();
  const resetPerformed = resetRows.length > 0;

  // Create a new learning session linked to this topic
  let sessionId: string | null = null;
  if (subjectId) {
    const [session] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        topicId: input.topicId,
        sessionType: 'learning',
        status: 'active',
      })
      .returning();

    sessionId = session?.id ?? null;
  }

  const response: RelearnResponse = {
    message: 'Relearn started',
    topicId: input.topicId,
    method: input.method,
    sessionId,
    resetPerformed,
  };

  if (input.method === 'different' && input.preferredMethod) {
    response.preferredMethod = input.preferredMethod;
  }

  return response;
}

export async function getSubjectNeedsDeepening(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<{ topics: NeedsDeepeningStatus[]; count: number }> {
  const repo = createScopedRepository(db, profileId);

  // Verify subject belongs to profile
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return { topics: [], count: 0 };

  const allDeepening = await repo.needsDeepeningTopics.findMany();
  const subjectDeepening = allDeepening.filter(
    (d) => d.subjectId === subjectId && d.status === 'active'
  );

  const topics: NeedsDeepeningStatus[] = subjectDeepening.map((d) => ({
    topicId: d.topicId,
    status: d.status as 'active' | 'resolved',
    consecutiveSuccessCount: d.consecutiveSuccessCount,
  }));

  return { topics, count: topics.length };
}

export async function getTeachingPreference(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<{
  subjectId: string;
  method: string;
  analogyDomain: string | null;
  nativeLanguage: string | null;
} | null> {
  const rows = await db.query.teachingPreferences.findFirst({
    where: and(
      eq(teachingPreferences.profileId, profileId),
      eq(teachingPreferences.subjectId, subjectId)
    ),
  });
  return rows
    ? {
        subjectId: rows.subjectId,
        method: rows.method,
        analogyDomain: rows.analogyDomain ?? null,
        nativeLanguage: rows.nativeLanguage ?? null,
      }
    : null;
}

type TeachingMethod = (typeof teachingPreferences.$inferInsert)['method'];
type AnalogyDomainColumn =
  (typeof teachingPreferences.$inferInsert)['analogyDomain'];

export async function setTeachingPreference(
  db: Database,
  profileId: string,
  subjectId: string,
  method: string,
  analogyDomain?: string | null
): Promise<{
  subjectId: string;
  method: string;
  analogyDomain: string | null;
  nativeLanguage: string | null;
}> {
  const values: typeof teachingPreferences.$inferInsert = {
    profileId,
    subjectId,
    method: method as TeachingMethod,
    ...(analogyDomain !== undefined && {
      analogyDomain: (analogyDomain as AnalogyDomainColumn) ?? null,
    }),
  };

  const updateFields: Record<string, unknown> = {
    method: method as TeachingMethod,
    updatedAt: new Date(),
  };
  if (analogyDomain !== undefined) {
    updateFields.analogyDomain = (analogyDomain as AnalogyDomainColumn) ?? null;
  }

  const [row] = await db
    .insert(teachingPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: updateFields,
    })
    .returning({
      method: teachingPreferences.method,
      analogyDomain: teachingPreferences.analogyDomain,
      nativeLanguage: teachingPreferences.nativeLanguage,
    });

  return {
    subjectId,
    method: row?.method ?? method,
    analogyDomain: row?.analogyDomain ?? null,
    nativeLanguage: row?.nativeLanguage ?? null,
  };
}

export async function deleteTeachingPreference(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<void> {
  await db
    .delete(teachingPreferences)
    .where(
      and(
        eq(teachingPreferences.profileId, profileId),
        eq(teachingPreferences.subjectId, subjectId)
      )
    );
}

// ---------------------------------------------------------------------------
// Analogy domain preference (FR134-137)
// ---------------------------------------------------------------------------

/**
 * Returns the analogy domain preference for a given profile + subject.
 * Returns null when no preference or no analogy domain is set.
 */
export async function getAnalogyDomain(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<string | null> {
  const row = await db.query.teachingPreferences.findFirst({
    where: and(
      eq(teachingPreferences.profileId, profileId),
      eq(teachingPreferences.subjectId, subjectId)
    ),
  });
  return row?.analogyDomain ?? null;
}

/**
 * Sets the analogy domain preference for a given profile + subject.
 * Upserts the teachingPreferences row (default method: 'step_by_step').
 * Returns the effective analogy domain value after the update.
 */
export async function setAnalogyDomain(
  db: Database,
  profileId: string,
  subjectId: string,
  analogyDomain: string | null
): Promise<string | null> {
  const domainValue = (analogyDomain as AnalogyDomainColumn) ?? null;

  await db
    .insert(teachingPreferences)
    .values({
      profileId,
      subjectId,
      method: 'step_by_step' as TeachingMethod,
      analogyDomain: domainValue,
    })
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: {
        analogyDomain: domainValue,
        updatedAt: new Date(),
      },
    });

  return analogyDomain;
}

export async function getNativeLanguage(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<string | null> {
  const [row] = await db
    .select({ nativeLanguage: teachingPreferences.nativeLanguage })
    .from(teachingPreferences)
    .where(
      and(
        eq(teachingPreferences.profileId, profileId),
        eq(teachingPreferences.subjectId, subjectId)
      )
    )
    .limit(1);

  return row?.nativeLanguage ?? null;
}

export async function setNativeLanguage(
  db: Database,
  profileId: string,
  subjectId: string,
  nativeLanguage: string | null
): Promise<string | null> {
  await db
    .insert(teachingPreferences)
    .values({
      profileId,
      subjectId,
      method: 'step_by_step' as TeachingMethod,
      nativeLanguage: nativeLanguage ?? null,
    })
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: {
        nativeLanguage: nativeLanguage ?? null,
        updatedAt: new Date(),
      },
    });

  return nativeLanguage;
}

// ---------------------------------------------------------------------------
// Session-triggered retention update (used by inngest/functions/session-completed.ts)
// ---------------------------------------------------------------------------

/**
 * Updates needs-deepening progress after a session completes.
 *
 * - quality >= 3: increment consecutiveSuccessCount
 * - quality < 3: reset consecutiveSuccessCount to 0
 * - If count reaches 3: mark as 'resolved' (FR63)
 */
export async function updateNeedsDeepeningProgress(
  db: Database,
  profileId: string,
  topicId: string | null,
  quality: number
): Promise<void> {
  if (!topicId) return;

  const repo = createScopedRepository(db, profileId);
  const records = await repo.needsDeepeningTopics.findMany(
    eq(needsDeepeningTopics.topicId, topicId)
  );
  const active = records.find((d) => d.status === 'active');
  if (!active) return;

  const passed = quality >= 3;
  const newCount = passed ? active.consecutiveSuccessCount + 1 : 0;

  const state = {
    topicId: active.topicId,
    subjectId: active.subjectId,
    consecutiveSuccessCount: newCount,
    status: 'active' as const,
  };
  const shouldResolve = canExitNeedsDeepening(state);

  await db
    .update(needsDeepeningTopics)
    .set({
      consecutiveSuccessCount: newCount,
      status: shouldResolve ? 'resolved' : 'active',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(needsDeepeningTopics.id, active.id),
        eq(needsDeepeningTopics.profileId, profileId)
      )
    );
}

/**
 * Updates a retention card via SM-2 after a session completes.
 * Looks up the card by topicId, runs the SM-2 algorithm, and persists
 * the result with defence-in-depth profileId scoping.
 */
export async function updateRetentionFromSession(
  db: Database,
  profileId: string,
  topicId: string,
  quality: number,
  sessionTimestamp?: string
): Promise<void> {
  const repo = createScopedRepository(db, profileId);
  const existing = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );

  // Auto-create retention card on first encounter
  const card = existing ?? (await ensureRetentionCard(db, profileId, topicId));

  // Double-counting guard: if the card was already updated after the session
  // started (e.g. by processRecallTest), skip the async SM-2 recalculation.
  if (
    sessionTimestamp &&
    card.updatedAt &&
    card.updatedAt.getTime() >= new Date(sessionTimestamp).getTime()
  ) {
    return;
  }

  const result = sm2({
    quality,
    card: {
      easeFactor: Number(card.easeFactor),
      interval: card.intervalDays,
      repetitions: card.repetitions,
      lastReviewedAt:
        card.lastReviewedAt?.toISOString() ?? new Date().toISOString(),
      nextReviewAt:
        card.nextReviewAt?.toISOString() ?? new Date().toISOString(),
    },
  });

  await db
    .update(retentionCards)
    .set({
      easeFactor: String(result.card.easeFactor),
      intervalDays: result.card.interval,
      repetitions: result.card.repetitions,
      lastReviewedAt: new Date(result.card.lastReviewedAt),
      nextReviewAt: new Date(result.card.nextReviewAt),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(retentionCards.id, card.id),
        eq(retentionCards.profileId, profileId)
      )
    );
}

// ---------------------------------------------------------------------------
// Topic stability (FR93)
// ---------------------------------------------------------------------------

/**
 * Returns stability status for all retention cards owned by a profile.
 * Optionally filters to a single subject via its curriculum chain.
 */
export async function getStableTopics(
  db: Database,
  profileId: string,
  subjectId?: string
): Promise<TopicStability[]> {
  if (subjectId) {
    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subjectId),
    });
    if (!curriculum) return [];

    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum.id),
    });
    const topicIds = topics.map((t) => t.id);
    if (topicIds.length === 0) return [];

    // DB-level filter via scoped repo — issue #22.2
    const repo = createScopedRepository(db, profileId);
    const filteredCards = await repo.retentionCards.findMany(
      inArray(retentionCards.topicId, topicIds)
    );

    return filteredCards.map((card) => ({
      topicId: card.topicId,
      isStable: isTopicStable(card.consecutiveSuccesses),
      consecutiveSuccesses: card.consecutiveSuccesses,
    }));
  }

  // No subject filter — return all cards for this profile
  const repo = createScopedRepository(db, profileId);
  const allCards = await repo.retentionCards.findMany();

  return allCards.map((card) => ({
    topicId: card.topicId,
    isStable: isTopicStable(card.consecutiveSuccesses),
    consecutiveSuccesses: card.consecutiveSuccesses,
  }));
}
