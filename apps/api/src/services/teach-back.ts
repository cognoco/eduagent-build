// ---------------------------------------------------------------------------
// TEACH_BACK Service — Feynman Technique (FR138-143)
// Stories 3.16-3.18: Student explains concept, AI plays confused student
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { TeachBackAssessment } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Trigger gating
// ---------------------------------------------------------------------------

/**
 * Determines whether a TEACH_BACK session should be triggered.
 * Moderate-to-strong retention: student must know the concept well enough
 * to attempt teaching it to someone else.
 *
 * @param easeFactor - SM-2 ease factor (>= 2.3 = moderate retention)
 * @param repetitions - Number of successful SM-2 repetitions (> 0 = reviewed at least once)
 */
export function shouldTriggerTeachBack(
  easeFactor: number,
  repetitions: number
): boolean {
  return easeFactor >= 2.3 && repetitions > 0;
}

// ---------------------------------------------------------------------------
// Quality mapping — TEACH_BACK rubric → SM-2
// ---------------------------------------------------------------------------

/**
 * Maps TEACH_BACK rubric scores to SM-2 quality using weighted average.
 *
 * Weights: accuracy 50%, completeness 30%, clarity 20%
 * These weights reflect the relative importance of factual correctness
 * vs breadth vs presentation quality.
 *
 * @param assessment - TEACH_BACK assessment from LLM
 * @returns SM-2 quality rating (0-5)
 */
export function mapTeachBackRubricToSm2(
  assessment: TeachBackAssessment
): number {
  const weighted =
    assessment.accuracy * 0.5 +
    assessment.completeness * 0.3 +
    assessment.clarity * 0.2;

  return Math.round(Math.max(0, Math.min(5, weighted)));
}

// ---------------------------------------------------------------------------
// Assessment parsing
// ---------------------------------------------------------------------------

/**
 * Parses a TEACH_BACK assessment from an LLM response containing
 * a JSON block in the structured assessment section.
 *
 * Expected JSON format:
 * ```json
 * {
 *   "completeness": 4,
 *   "accuracy": 3,
 *   "clarity": 4,
 *   "overallQuality": 4,
 *   "weakestArea": "accuracy",
 *   "gapIdentified": "missed the distinction between X and Y"
 * }
 * ```
 */
export function parseTeachBackAssessment(
  llmResponse: string
): TeachBackAssessment | null {
  // Look for JSON block containing the assessment fields
  const jsonMatch = llmResponse.match(
    /\{[\s\S]*?"completeness"[\s\S]*?"accuracy"[\s\S]*?\}/
  );
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const clamp = (val: unknown, fallback: number): number => {
      if (typeof val !== 'number') return fallback;
      return Math.max(0, Math.min(5, Math.round(val)));
    };

    const completeness = clamp(parsed.completeness, 3);
    const accuracy = clamp(parsed.accuracy, 3);
    const clarity = clamp(parsed.clarity, 3);
    const overallQuality = clamp(parsed.overallQuality, 3);

    const validAreas = ['completeness', 'accuracy', 'clarity'] as const;
    const weakestArea = validAreas.includes(
      parsed.weakestArea as (typeof validAreas)[number]
    )
      ? (parsed.weakestArea as (typeof validAreas)[number])
      : findWeakest(completeness, accuracy, clarity);

    const gapIdentified =
      typeof parsed.gapIdentified === 'string' ? parsed.gapIdentified : null;

    return {
      completeness,
      accuracy,
      clarity,
      overallQuality,
      weakestArea,
      gapIdentified,
    };
  } catch {
    return null;
  }
}

/**
 * Determines the weakest area from rubric scores.
 * Breaks ties in order: accuracy > completeness > clarity
 * (accuracy is most pedagogically important).
 */
function findWeakest(
  completeness: number,
  accuracy: number,
  clarity: number
): 'completeness' | 'accuracy' | 'clarity' {
  if (accuracy <= completeness && accuracy <= clarity) return 'accuracy';
  if (completeness <= clarity) return 'completeness';
  return 'clarity';
}
