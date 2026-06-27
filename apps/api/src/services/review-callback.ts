// ---------------------------------------------------------------------------
// Review callback — RR-1 + RR-13 minimal cross-session memory thread
//
// Derives the learner's last outcome for a topic from the SM-2 retention card
// (authoritative — see CH-1 in
// docs/specs/2026-06-27-rr1-rr13-warm-review-callback.md) and assembles the
// warm-opener material the REVIEW prompt block consumes. Read-only over
// retention_cards + session_events; never mutates SM-2 state.
// ---------------------------------------------------------------------------

import { and, desc, eq } from 'drizzle-orm';
import {
  retentionCards,
  sessionEvents,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import {
  computeDaysSinceLastReview,
  rowToRetentionState,
} from './retention-data';
import type { RetentionState } from './retention';
import type { ReviewCallback, ReviewOutcome } from './exchange-types';

/** Beyond this gap the last outcome is too stale to claim — gentle re-entry. */
const LONG_GAP_DAYS = 30;

/**
 * Authoritative outcome from the SM-2 card. Precedence is deliberate:
 *   first_time → long_gap → cracked → wobbled → unknown
 * `long_gap` takes precedence over cracked/wobbled because after 30+ days the
 * recall state is too stale to honestly claim "you cracked it" (CH-1).
 */
export function deriveReviewOutcome(
  card: RetentionState | null,
  daysSinceLastReview: number | null,
): ReviewOutcome {
  // `first_time` means genuinely no recall history. A failed recall resets
  // SM-2 `repetitions` to 0 (sm2: "quality 2 resets repetitions to 0"), so we
  // must also require no failures here — otherwise a learner who only ever
  // missed this topic would be mislabeled `first_time` and get neutral copy
  // instead of the warmer `wobbled` pick-up-where-it-got-shaky framing.
  if (!card || (card.repetitions === 0 && card.failureCount === 0)) {
    return 'first_time';
  }
  if (daysSinceLastReview !== null && daysSinceLastReview > LONG_GAP_DAYS) {
    return 'long_gap';
  }
  if (card.xpStatus === 'verified' || card.consecutiveSuccesses >= 1) {
    return 'cracked';
  }
  if (card.failureCount > 0 || card.xpStatus === 'decayed') {
    return 'wobbled';
  }
  return 'unknown';
}

/**
 * Assemble the warm-opener thread for a review-mode first turn. Scoped read:
 * the retention card via `createScopedRepository`; the last learner message via
 * a direct query with an explicit `profileId` filter (session_events is
 * profile-scoped — repo data-access rule). The quote is read ONLY for the
 * `cracked` branch and is private grounding, never surfaced verbatim.
 */
export async function getReviewCallbackContext(
  db: Database,
  profileId: string,
  topicId: string,
  topicTitle: string,
  now: Date = new Date(),
): Promise<ReviewCallback> {
  const repo = createScopedRepository(db, profileId);
  const cardRow = await repo.retentionCards.findFirst(
    eq(retentionCards.topicId, topicId),
  );
  const card: RetentionState | null = cardRow
    ? rowToRetentionState(cardRow)
    : null;
  const daysSinceLastReview = computeDaysSinceLastReview(
    cardRow?.lastReviewedAt ?? null,
    now,
  );
  const outcome = deriveReviewOutcome(card, daysSinceLastReview);

  let lastLearnerMessage: string | null = null;
  if (outcome === 'cracked') {
    const [last] = await db
      .select({ content: sessionEvents.content })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.topicId, topicId),
          eq(sessionEvents.eventType, 'user_message'),
        ),
      )
      .orderBy(desc(sessionEvents.createdAt))
      .limit(1);
    lastLearnerMessage = last?.content ?? null;
  }

  return {
    topicTitle,
    outcome,
    daysSinceLastReview,
    lastLearnerMessage,
  };
}
