// ---------------------------------------------------------------------------
// Coaching Card Precompute Service — Story 3.4 Step 2
// Computes the appropriate coaching card for a profile after session completion
// and caches it in the DB (KV stand-in per ARCH-11).
// Pure business logic — no Hono imports.
// ---------------------------------------------------------------------------

import { eq, sql } from 'drizzle-orm';
import {
  coachingCardCache,
  learningSessions,
  streaks,
  createScopedRepository,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type { CoachingCard } from '@eduagent/schemas';
import { getStreakDisplayInfo, type StreakState } from './streaks';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Profiles with fewer than this many completed sessions get cold-start fallback */
const COLD_START_SESSION_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// precomputeCoachingCard
// ---------------------------------------------------------------------------

/**
 * Queries retention cards + streaks, computes the highest-priority coaching
 * card using this priority order:
 *   1. review_due  (priority 7-10, scales with overdue count)
 *   2. streak      (priority 6, learner on grace period)
 *   3. insight     (priority 4, verified topics exist)
 *   4. challenge   (priority 3, fallback)
 */
export async function precomputeCoachingCard(
  db: Database,
  profileId: string
): Promise<CoachingCard> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS).toISOString();
  const createdAt = now.toISOString();
  const id = generateUUIDv7();

  // Fetch retention cards (scoped to profile)
  const repo = createScopedRepository(db, profileId);
  const allCards = await repo.retentionCards.findMany();

  // Fetch streak state (streaks has unique profileId constraint)
  const streakRow = await db.query.streaks.findFirst({
    where: eq(streaks.profileId, profileId),
  });

  // --- Priority 1: review_due ---
  const overdueCards = allCards.filter(
    (c) => c.nextReviewAt && c.nextReviewAt.getTime() <= now.getTime()
  );

  if (overdueCards.length > 0) {
    // Pick the most overdue card (earliest nextReviewAt)
    const mostOverdue = overdueCards.sort(
      (a, b) =>
        (a.nextReviewAt?.getTime() ?? 0) - (b.nextReviewAt?.getTime() ?? 0)
    )[0];

    // Priority scales: 7 base + 1 per overdue card, capped at 10
    const priority = Math.min(7 + overdueCards.length - 1, 10);

    return {
      id,
      profileId,
      type: 'review_due',
      title: 'Review due',
      body: `You have ${overdueCards.length} topic${
        overdueCards.length > 1 ? 's' : ''
      } ready for review.`,
      priority,
      expiresAt,
      createdAt,
      topicId: mostOverdue.topicId,
      dueAt: mostOverdue.nextReviewAt!.toISOString(),
      easeFactor: Number(mostOverdue.easeFactor),
    };
  }

  // --- Priority 2: streak (grace period) ---
  if (streakRow) {
    const streakState: StreakState = {
      currentStreak: streakRow.currentStreak,
      longestStreak: streakRow.longestStreak,
      lastActivityDate: streakRow.lastActivityDate,
      gracePeriodStartDate: streakRow.gracePeriodStartDate,
    };

    const today = now.toISOString().slice(0, 10);
    const display = getStreakDisplayInfo(streakState, today);

    if (display.isOnGracePeriod) {
      return {
        id,
        profileId,
        type: 'streak',
        title: 'Keep your streak alive!',
        body: `Your ${streakState.currentStreak}-day streak is at risk. ${
          display.graceDaysRemaining
        } grace day${display.graceDaysRemaining === 1 ? '' : 's'} remaining.`,
        priority: 6,
        expiresAt,
        createdAt,
        currentStreak: streakState.currentStreak,
        graceRemaining: display.graceDaysRemaining,
      };
    }
  }

  // --- Priority 3: insight (verified topics) ---
  const verifiedCards = allCards.filter((c) => c.xpStatus === 'verified');
  if (verifiedCards.length > 0) {
    const firstVerified = verifiedCards[0];
    return {
      id,
      profileId,
      type: 'insight',
      title: 'Great progress!',
      body: 'You have verified your understanding of a topic. Keep up the momentum!',
      priority: 4,
      expiresAt,
      createdAt,
      topicId: firstVerified.topicId,
      insightType: 'strength',
    };
  }

  // --- Priority 4: challenge (fallback) ---
  // If there are any retention cards, pick the first topic; otherwise use a placeholder
  const fallbackTopicId = allCards.length > 0 ? allCards[0].topicId : profileId;
  return {
    id,
    profileId,
    type: 'challenge',
    title: 'Ready for a challenge?',
    body: 'Take the next step in your learning journey!',
    priority: 3,
    expiresAt,
    createdAt,
    topicId: fallbackTopicId,
    difficulty: 'easy',
    xpReward: 10,
  };
}

// ---------------------------------------------------------------------------
// writeCoachingCardCache
// ---------------------------------------------------------------------------

/**
 * Upserts a coaching card to the `coaching_card_cache` table.
 * Uses ON CONFLICT profileId DO UPDATE for idempotent writes.
 * Sets a 24-hour TTL on expiresAt.
 */
export async function writeCoachingCardCache(
  db: Database,
  profileId: string,
  card: CoachingCard
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  await db
    .insert(coachingCardCache)
    .values({
      profileId,
      cardData: card,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: coachingCardCache.profileId,
      set: {
        cardData: card,
        expiresAt,
        updatedAt: now,
      },
    });
}

// ---------------------------------------------------------------------------
// readCoachingCardCache
// ---------------------------------------------------------------------------

/**
 * Reads a cached coaching card for a profile.
 * Returns null if missing or expired.
 */
export async function readCoachingCardCache(
  db: Database,
  profileId: string
): Promise<CoachingCard | null> {
  const row = await db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });

  if (!row) return null;

  const now = new Date();
  if (row.expiresAt.getTime() <= now.getTime()) return null;

  return row.cardData as CoachingCard;
}

// ---------------------------------------------------------------------------
// Cold-start fallback actions
// ---------------------------------------------------------------------------

export interface ColdStartFallback {
  actions: Array<{ key: string; label: string; description: string }>;
}

const COLD_START_FALLBACK: ColdStartFallback = {
  actions: [
    {
      key: 'continue_learning',
      label: 'Continue learning',
      description: 'Pick up where you left off.',
    },
    {
      key: 'start_new_topic',
      label: 'Start a new topic',
      description: 'Explore something new in your curriculum.',
    },
    {
      key: 'review_progress',
      label: 'Review progress',
      description: 'See how far you have come.',
    },
  ],
};

// ---------------------------------------------------------------------------
// getCoachingCardForProfile
// ---------------------------------------------------------------------------

export interface CoachingCardResponse {
  coldStart: boolean;
  card: CoachingCard | null;
  fallback: ColdStartFallback | null;
}

/**
 * Returns the coaching card for a profile.
 *
 * - Cold start (< 5 completed sessions): returns three-button fallback data.
 * - Warm path: reads from cache (fast); on miss, computes fresh + writes cache.
 */
export async function getCoachingCardForProfile(
  db: Database,
  profileId: string
): Promise<CoachingCardResponse> {
  // Check session count for cold-start detection
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningSessions)
    .where(eq(learningSessions.profileId, profileId));

  const sessionCount = countResult[0]?.count ?? 0;

  if (sessionCount < COLD_START_SESSION_THRESHOLD) {
    return { coldStart: true, card: null, fallback: COLD_START_FALLBACK };
  }

  // Warm path: try cache first
  const cached = await readCoachingCardCache(db, profileId);
  if (cached) {
    return { coldStart: false, card: cached, fallback: null };
  }

  // Cache miss: compute fresh and write to cache
  const card = await precomputeCoachingCard(db, profileId);
  await writeCoachingCardCache(db, profileId, card);

  return { coldStart: false, card, fallback: null };
}
