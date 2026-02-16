// ---------------------------------------------------------------------------
// Subject Urgency Ranking — Story 4.3
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface SubjectUrgencyInput {
  subjectId: string;
  overdueRecallCount: number;
  weakForgottenCount: number;
  daysSinceLastSession: number;
  totalTopics: number;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Calculates an urgency score for a subject.
 *
 * Weighted formula:
 *   overdueRecallCount * 3 + weakForgottenCount * 2 + daysSinceLastSession * 0.5
 *
 * Higher score = more urgent.
 */
export function calculateUrgencyScore(input: SubjectUrgencyInput): number {
  return (
    input.overdueRecallCount * 3 +
    input.weakForgottenCount * 2 +
    input.daysSinceLastSession * 0.5
  );
}

/**
 * Ranks subjects by urgency score descending.
 *
 * Ties are broken by totalTopics (larger investment at risk ranks higher).
 */
export function rankSubjectsByUrgency(
  subjects: SubjectUrgencyInput[]
): SubjectUrgencyInput[] {
  return [...subjects].sort((a, b) => {
    const scoreA = calculateUrgencyScore(a);
    const scoreB = calculateUrgencyScore(b);

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // Tie-break: larger totalTopics first (more investment at risk)
    return b.totalTopics - a.totalTopics;
  });
}
