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
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  RetentionCardResponse,
  RecallTestSubmitInput,
  RelearnTopicInput,
  NeedsDeepeningStatus,
} from '@eduagent/schemas';
import { sm2 } from '@eduagent/retention';
import { processRecallResult, type RetentionState } from './retention';

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

export async function processRecallTest(
  db: Database,
  profileId: string,
  input: RecallTestSubmitInput
): Promise<{
  passed: boolean;
  masteryScore: number;
  xpChange: string;
  nextReviewAt: string;
}> {
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
    };
  }

  // TODO(quality-eval): Replace length-based proxy with LLM evaluation.
  // Track: Epic 3 Story 3.2 — mastery verification requires semantic assessment.
  // Current heuristic: answer > 50 chars = quality 4 (pass), else quality 2 (fail).
  const quality = input.answer.length > 50 ? 4 : 2;
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

  return {
    passed: result.passed,
    masteryScore: result.passed ? 0.75 : 0.4,
    xpChange: result.xpChange,
    nextReviewAt: result.newState.nextReviewAt ?? new Date().toISOString(),
  };
}

export async function startRelearn(
  db: Database,
  profileId: string,
  input: RelearnTopicInput
): Promise<{ message: string; topicId: string; method: string }> {
  // Mark topic as needs deepening if not already
  const repo = createScopedRepository(db, profileId);
  const existing = await repo.needsDeepeningTopics.findMany(
    eq(needsDeepeningTopics.topicId, input.topicId)
  );
  const active = existing.find((d) => d.status === 'active');

  if (!active) {
    // Find subjectId through the topic's curriculum chain
    const topic = await db.query.curriculumTopics.findFirst({
      where: eq(curriculumTopics.id, input.topicId),
    });
    const curriculum = topic
      ? await db.query.curricula.findFirst({
          where: eq(curricula.id, topic.curriculumId),
        })
      : null;

    if (curriculum) {
      await db.insert(needsDeepeningTopics).values({
        profileId,
        subjectId: curriculum.subjectId,
        topicId: input.topicId,
        status: 'active',
      });
    }
  }

  return {
    message: 'Relearn started',
    topicId: input.topicId,
    method: input.method,
  };
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
      .set({ method, updatedAt: new Date() })
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
      method,
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
