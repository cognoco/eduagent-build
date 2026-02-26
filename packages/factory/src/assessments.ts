import type {
  AssessmentRecord,
  RetentionCardResponse,
  EvaluateAssessment,
  TeachBackAssessment,
} from '@eduagent/schemas';
import { uuidv7 } from 'uuidv7';

export function buildAssessment(
  overrides?: Partial<AssessmentRecord>
): AssessmentRecord {
  const now = new Date().toISOString();
  return {
    id: uuidv7(),
    profileId: uuidv7(),
    subjectId: uuidv7(),
    topicId: uuidv7(),
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
    topicId: uuidv7(),
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 0,
    nextReviewAt: null,
    lastReviewedAt: null,
    xpStatus: 'pending',
    failureCount: 0,
    ...overrides,
  };
}

export function buildEvaluateAssessment(
  overrides?: Partial<EvaluateAssessment>
): EvaluateAssessment {
  return {
    challengePassed: true,
    flawIdentified: 'The formula was applied incorrectly',
    quality: 4,
    ...overrides,
  };
}

export function buildTeachBackAssessment(
  overrides?: Partial<TeachBackAssessment>
): TeachBackAssessment {
  return {
    completeness: 4,
    accuracy: 4,
    clarity: 3,
    overallQuality: 4,
    weakestArea: 'clarity',
    gapIdentified: null,
    ...overrides,
  };
}

/** Reset factory state — useful in test `beforeEach` blocks. */
export function resetAssessmentCounter(): void {
  // no-op: preserved for API compatibility
}
