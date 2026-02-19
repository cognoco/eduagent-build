import type {
  AssessmentRecord,
  RetentionCardResponse,
} from '@eduagent/schemas';
import { randomUUID } from 'crypto';

export function buildAssessment(
  overrides?: Partial<AssessmentRecord>
): AssessmentRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    profileId: randomUUID(),
    subjectId: randomUUID(),
    topicId: randomUUID(),
    sessionId: null,
    verificationDepth: 'recall',
    status: 'in_progress',
    masteryScore: null,
    qualityRating: null,
    exchangeHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildRetentionCard(
  overrides?: Partial<RetentionCardResponse>
): RetentionCardResponse {
  return {
    topicId: randomUUID(),
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    nextReviewAt: null,
    xpStatus: 'pending',
    failureCount: 0,
    ...overrides,
  };
}

/** Reset factory state — useful in test `beforeEach` blocks. */
export function resetAssessmentCounter(): void {
  // no-op: preserved for API compatibility
}
