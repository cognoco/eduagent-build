import type { RetentionStatus } from '@eduagent/schemas';

export interface RetentionInput {
  failureCount?: number;
  xpStatus?: string;
  repetitions: number;
  nextReviewAt?: string | null;
}

/**
 * Derives a retention status from SRS card fields.
 * Returns 'weak' for null/undefined input.
 *
 * Thresholds:
 *   failureCount >= 3 or xpStatus === 'decayed' → forgotten
 *   repetitions === 0 → weak
 *   no nextReviewAt → weak
 *   daysUntilReview > 3 → strong
 *   daysUntilReview > 0 → fading
 *   else → weak
 */
export function deriveRetentionStatus(
  card: RetentionInput | null | undefined
): RetentionStatus {
  if (!card) return 'weak';
  if ((card.failureCount ?? 0) >= 3 || card.xpStatus === 'decayed')
    return 'forgotten';
  if (card.repetitions === 0) return 'weak';
  if (!card.nextReviewAt) return 'weak';
  const now = Date.now();
  const reviewAt = new Date(card.nextReviewAt).getTime();
  const daysUntilReview = (reviewAt - now) / (1000 * 60 * 60 * 24);
  if (daysUntilReview > 3) return 'strong';
  if (daysUntilReview > 0) return 'fading';
  return 'weak';
}

/** Dominant retention for a shelf/book — weakest signal wins for visibility. */
export const RETENTION_ORDER: Record<RetentionStatus, number> = {
  forgotten: 0,
  weak: 1,
  fading: 2,
  strong: 3,
};
