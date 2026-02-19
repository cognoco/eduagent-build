// ---------------------------------------------------------------------------
// Retention Data Service — Sprint 8 Phase 1
// DB-aware functions for retention routes. Delegates computation to
// services/retention.ts (pure SM-2 logic).
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
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
  type RetentionState,
} from './retention';
import { canExitNeedsDeepening } from './adaptive-teaching';
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
    xpStatus: row.xpStatus as 'pending' | 'verified' | 'decayed',
    failureCount: row.failureCount,
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
      return answer.length > 50 ? 4 : 2;
    }

    return parsed;
  } catch {
    // LLM failure fallback
    return answer.length > 50 ? 4 : 2;
  }
}

// ---------------------------------------------------------------------------
// Core query functions
// ---------------------------------------------------------------------------

export async function getSubjectRetention(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<{ topics: RetentionCardResponse[]; reviewDueCount: number }> {
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

  // Get all retention cards for this profile, filter to subject's topics
  const allCards = await repo.retentionCards.findMany();
  const subjectCards = allCards.filter((c) => topicIds.includes(c.topicId));

  const now = new Date();
  const reviewDueCount = subjectCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime()
  ).length;

  return {
    topics: subjectCards.map(mapRetentionCardRow),
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
  failureAction?: 'feedback_only' | 'redirect_to_learning_book';
  remediation?: RecallTestRemediation;
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

  if (!card) {
    // No retention card yet — treat as first successful recall
    return {
      passed: true,
      masteryScore: 0.75,
      xpChange: 'verified',
      nextReviewAt: new Date().toISOString(),
      failureCount: 0,
    };
  }

  // Look up topic title for LLM evaluation context
  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, input.topicId),
  });
  const topicTitle = topic?.title ?? input.topicId;

  const quality = await evaluateRecallQuality(input.answer, topicTitle);
  const state = rowToRetentionState(card);
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
        eq(retentionCards.id, card.id),
        eq(retentionCards.profileId, profileId)
      )
    );

  const response: RecallTestResponse = {
    passed: result.passed,
    masteryScore: result.passed ? 0.75 : 0.4,
    xpChange: result.xpChange,
    nextReviewAt: result.newState.nextReviewAt ?? new Date().toISOString(),
    failureCount: result.newState.failureCount,
    failureAction: result.failureAction,
  };

  // Add remediation data when redirect is triggered (3+ failures)
  if (result.failureAction === 'redirect_to_learning_book') {
    const retentionStatus = getRetentionStatus(result.newState);
    const cooldownEndsAt = new Date(
      Date.now() + RETEST_COOLDOWN_MS
    ).toISOString();

    response.remediation = {
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
  let resetPerformed = false;
  await db
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
    );
  resetPerformed = true;

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
): Promise<{ subjectId: string; method: string } | null> {
  const rows = await db.query.teachingPreferences.findFirst({
    where: and(
      eq(teachingPreferences.profileId, profileId),
      eq(teachingPreferences.subjectId, subjectId)
    ),
  });
  return rows ? { subjectId: rows.subjectId, method: rows.method } : null;
}

type TeachingMethod = (typeof teachingPreferences.$inferInsert)['method'];

export async function setTeachingPreference(
  db: Database,
  profileId: string,
  subjectId: string,
  method: string
): Promise<{ subjectId: string; method: string }> {
  // Check if preference exists
  const existing = await db.query.teachingPreferences.findFirst({
    where: and(
      eq(teachingPreferences.profileId, profileId),
      eq(teachingPreferences.subjectId, subjectId)
    ),
  });

  if (existing) {
    await db
      .update(teachingPreferences)
      .set({ method: method as TeachingMethod, updatedAt: new Date() })
      .where(
        and(
          eq(teachingPreferences.id, existing.id),
          eq(teachingPreferences.profileId, profileId)
        )
      );
  } else {
    await db.insert(teachingPreferences).values({
      profileId,
      subjectId,
      method: method as TeachingMethod,
    });
  }

  return { subjectId, method };
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
  quality: number
): Promise<void> {
  const repo = createScopedRepository(db, profileId);
  const card = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId)
  );

  if (!card) return;

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
  const repo = createScopedRepository(db, profileId);
  const allCards = await repo.retentionCards.findMany();

  let filteredCards = allCards;

  if (subjectId) {
    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subjectId),
    });
    if (!curriculum) return [];

    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.curriculumId, curriculum.id),
    });
    const topicIds = new Set(topics.map((t) => t.id));
    filteredCards = allCards.filter((c) => topicIds.has(c.topicId));
  }

  return filteredCards.map((card) => ({
    topicId: card.topicId,
    isStable: isTopicStable(card.consecutiveSuccesses),
    consecutiveSuccesses: card.consecutiveSuccesses,
  }));
}
