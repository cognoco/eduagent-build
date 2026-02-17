// ---------------------------------------------------------------------------
// Retention Management — Stories 3.3, 3.4, 3.5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { sm2 } from '@eduagent/retention';

export interface RetentionState {
  topicId: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  failureCount: number;
  consecutiveSuccesses: number;
  xpStatus: 'pending' | 'verified' | 'decayed';
  nextReviewAt: string | null;
  lastReviewedAt: string | null;
}

export interface RecallTestResult {
  passed: boolean;
  newState: RetentionState;
  xpChange: 'verified' | 'decayed' | 'none';
  failureAction?: 'feedback_only' | 'redirect_to_learning_book';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Anti-cramming cooldown in milliseconds (24 hours — FR54) */
const RETEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create the initial retention state for a topic */
export function createInitialRetentionState(topicId: string): RetentionState {
  return {
    topicId,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    nextReviewAt: null,
    lastReviewedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Processes a recall test result through SM-2 and updates retention state.
 *
 * Success path (quality >= 3):
 * - First success after assessment: XP stays pending (needs delayed recall)
 * - Delayed recall success (already had successes): XP becomes verified
 * - consecutiveSuccesses incremented
 *
 * Failure path (quality < 3):
 * - failureCount incremented, consecutiveSuccesses reset
 * - XP decays proportionally
 * - Failure 1-2: feedback_only
 * - Failure 3+: redirect_to_learning_book
 */
export function processRecallResult(
  state: RetentionState,
  quality: number
): RecallTestResult {
  const clampedQuality = Math.max(0, Math.min(5, Math.round(quality)));
  const now = new Date().toISOString();

  const sm2Result = sm2({
    quality: clampedQuality,
    card: {
      easeFactor: state.easeFactor,
      interval: state.intervalDays,
      repetitions: state.repetitions,
      lastReviewedAt: state.lastReviewedAt ?? now,
      nextReviewAt: state.nextReviewAt ?? now,
    },
  });

  if (sm2Result.wasSuccessful) {
    // Success path
    const isDelayedRecall = state.consecutiveSuccesses > 0;
    const newXpStatus: RetentionState['xpStatus'] = isDelayedRecall
      ? 'verified'
      : state.xpStatus;

    const newState: RetentionState = {
      ...state,
      easeFactor: sm2Result.card.easeFactor,
      intervalDays: sm2Result.card.interval,
      repetitions: sm2Result.card.repetitions,
      consecutiveSuccesses: state.consecutiveSuccesses + 1,
      xpStatus: newXpStatus,
      nextReviewAt: sm2Result.card.nextReviewAt,
      lastReviewedAt: now,
    };

    return {
      passed: true,
      newState,
      xpChange: isDelayedRecall ? 'verified' : 'none',
    };
  }

  // Failure path
  const newFailureCount = state.failureCount + 1;
  const newXpStatus: RetentionState['xpStatus'] =
    state.xpStatus === 'verified' || state.xpStatus === 'pending'
      ? 'decayed'
      : state.xpStatus;

  const newState: RetentionState = {
    ...state,
    easeFactor: sm2Result.card.easeFactor,
    intervalDays: sm2Result.card.interval,
    repetitions: sm2Result.card.repetitions,
    failureCount: newFailureCount,
    consecutiveSuccesses: 0,
    xpStatus: newXpStatus,
    nextReviewAt: sm2Result.card.nextReviewAt,
    lastReviewedAt: now,
  };

  const failureAction: RecallTestResult['failureAction'] =
    newFailureCount >= 3 ? 'redirect_to_learning_book' : 'feedback_only';

  return {
    passed: false,
    newState,
    xpChange: 'decayed',
    failureAction,
  };
}

/**
 * Checks if a review is due based on the nextReviewAt timestamp.
 */
export function isReviewDue(state: RetentionState, now?: Date): boolean {
  if (!state.nextReviewAt) {
    return false;
  }
  const currentTime = now ?? new Date();
  return new Date(state.nextReviewAt) <= currentTime;
}

/**
 * Checks if a topic can be re-tested (24-hour anti-cramming cooldown — FR54).
 *
 * Returns true if:
 * - There is no lastTestAt (never tested), or
 * - At least 24 hours have passed since lastTestAt
 */
export function canRetestTopic(
  state: RetentionState,
  lastTestAt: string | null
): boolean {
  if (!lastTestAt) {
    return true;
  }
  const elapsed = Date.now() - new Date(lastTestAt).getTime();
  return elapsed >= RETEST_COOLDOWN_MS;
}

/**
 * Determines retention status based on time elapsed since last review
 * relative to the scheduled interval.
 *
 * - strong: within the interval
 * - fading: 1-2x past the interval
 * - weak: 2-4x past the interval
 * - forgotten: 4x+ past the interval or never reviewed
 */
export function getRetentionStatus(
  state: RetentionState
): 'strong' | 'fading' | 'weak' | 'forgotten' {
  if (!state.lastReviewedAt) {
    return 'forgotten';
  }

  const now = Date.now();
  const lastReview = new Date(state.lastReviewedAt).getTime();
  const daysSinceReview = (now - lastReview) / (1000 * 60 * 60 * 24);
  const ratio = daysSinceReview / Math.max(state.intervalDays, 1);

  if (ratio <= 1) return 'strong';
  if (ratio <= 2) return 'fading';
  if (ratio <= 4) return 'weak';
  return 'forgotten';
}
