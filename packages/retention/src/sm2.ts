/**
 * SM-2 Spaced Repetition Algorithm
 * Pure math — zero dependencies, deterministic output
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

export interface RetentionCard {
  easeFactor: number; // >= 1.3
  interval: number; // days until next review
  repetitions: number; // consecutive correct recalls
  lastReviewedAt: string; // ISO 8601
  nextReviewAt: string; // ISO 8601
}

export interface SM2Input {
  quality: number; // 0-5 (0=total blackout, 5=perfect recall)
  card?: RetentionCard; // undefined = new card
}

export interface SM2Result {
  card: RetentionCard;
  wasSuccessful: boolean; // quality >= 3
}

/** Default ease factor for new cards */
const DEFAULT_EASE = 2.5;
/** Minimum ease factor */
const MIN_EASE = 1.3;

export function sm2(input: SM2Input): SM2Result {
  const { card } = input;
  // Guard against NaN/Infinity — treat non-finite quality as total blackout (0)
  const raw = Number.isFinite(input.quality) ? input.quality : 0;
  // Clamp quality to valid 0-5 range (out-of-range values would produce wrong ease factors)
  const quality = Math.max(0, Math.min(5, Math.round(raw)));
  const reviewedAt = new Date();
  const wasSuccessful = quality >= 3;

  const prevEase = card?.easeFactor ?? DEFAULT_EASE;
  const prevReps = card?.repetitions ?? 0;

  // Calculate new ease factor
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  let newEase =
    prevEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEase < MIN_EASE) newEase = MIN_EASE;

  let newInterval: number;
  let newReps: number;

  if (!wasSuccessful) {
    // Failed: reset repetitions, short interval
    newReps = 0;
    newInterval = 1;
  } else if (card == null || prevReps === 0) {
    // First successful recall — either a brand-new card (card is undefined/null)
    // or a card whose previous recalls all failed (repetitions reset to 0).
    // Note: `card == null` (null/undefined) is the only falsy case reachable here
    // because `SM2Input.card` is typed `RetentionCard | undefined`; checking it
    // explicitly (rather than `!card`) prevents future contributors from
    // accidentally extending the branch to other falsy values if the type widens.
    newReps = 1;
    newInterval = 1;
  } else if (prevReps === 1) {
    // Second successful recall
    newReps = 2;
    newInterval = 6;
  } else {
    // Subsequent successful recalls
    newReps = prevReps + 1;
    newInterval = Math.round((card?.interval ?? 6) * newEase);
  }

  // [BUG-574] Always anchor next-review schedule to the actual review time
  // (canonical SM-2). The earlier dueDate-anchored variant collapsed the
  // schedule to +1 day whenever a learner recalled an overdue card, because
  // anchor + newInterval landed in the past and triggered the +1-day fallback.
  const nextReviewDate = new Date(reviewedAt);
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    card: {
      easeFactor: Math.round(newEase * 100) / 100,
      interval: newInterval,
      repetitions: newReps,
      lastReviewedAt: reviewedAt.toISOString(),
      nextReviewAt: nextReviewDate.toISOString(),
    },
    wasSuccessful,
  };
}
