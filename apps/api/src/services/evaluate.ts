// ---------------------------------------------------------------------------
// EVALUATE Service — Devil's Advocate Verification (FR128-133)
// Stories 3.11-3.13: Present flawed reasoning for students to critique
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type { EvaluateAssessment } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Trigger gating
// ---------------------------------------------------------------------------

/**
 * Determines whether an EVALUATE challenge should be triggered.
 * Strong retention gate: student must already know the material well.
 *
 * @param easeFactor - SM-2 ease factor (>= 2.5 = strong retention)
 * @param repetitions - Number of successful SM-2 repetitions (> 0 = reviewed at least once)
 */
export function shouldTriggerEvaluate(
  easeFactor: number,
  repetitions: number
): boolean {
  return easeFactor >= 2.5 && repetitions > 0;
}

// ---------------------------------------------------------------------------
// Difficulty rung descriptions
// ---------------------------------------------------------------------------

const RUNG_DESCRIPTIONS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Obvious flaw: use a clearly wrong formula, reversed cause-effect, or factual error that contradicts basic definitions.',
  2: 'Moderate flaw: use a common misconception or apply a correct rule to the wrong context.',
  3: 'Subtle flaw: correct reasoning chain with one incorrect premise, or an edge case error that produces a plausible but wrong answer.',
  4: 'Expert flaw: correct at surface level but with a hidden assumption violation, or conflation of two related but distinct concepts.',
};

/**
 * Returns a human-readable description for the given difficulty rung.
 */
export function getEvaluateRungDescription(rung: 1 | 2 | 3 | 4): string {
  return RUNG_DESCRIPTIONS[rung];
}

// ---------------------------------------------------------------------------
// Quality mapping — EVALUATE → SM-2
// ---------------------------------------------------------------------------

/**
 * Maps EVALUATE challenge result to SM-2 quality.
 *
 * Key difference from standard: failure floors at quality 2-3 (not 0-1)
 * to prevent a single EVALUATE failure from devastating retention.
 *
 * @param passed - Whether the student correctly identified the flaw
 * @param rawQuality - LLM-assessed quality (0-5) of the student's critique
 * @returns SM-2 quality rating (0-5)
 */
export function mapEvaluateQualityToSm2(
  passed: boolean,
  rawQuality: number
): number {
  if (passed) {
    // Passed: quality 3-5 based on critique depth
    return Math.max(3, Math.min(5, rawQuality));
  }
  // Failed: floor at 2-3 (not 0-1)
  return rawQuality <= 1 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Three-strike failure handling
// ---------------------------------------------------------------------------

export interface EvaluateFailureAction {
  action: 'reveal_flaw' | 'lower_difficulty' | 'exit_to_standard';
  message: string;
  newDifficultyRung?: 1 | 2 | 3 | 4;
}

/**
 * Determines the appropriate response after an EVALUATE failure.
 *
 * Three-strike escalation:
 * - 1st failure: reveal the flaw and explain the misconception
 * - 2nd failure: retry at a lower difficulty rung
 * - 3rd+ failure: mark for standard review, exit EVALUATE mode
 *
 * @param consecutiveFailures - Number of consecutive EVALUATE failures
 * @param currentRung - Current difficulty rung (1-4)
 */
export function handleEvaluateFailure(
  consecutiveFailures: number,
  currentRung: 1 | 2 | 3 | 4
): EvaluateFailureAction {
  if (consecutiveFailures <= 1) {
    return {
      action: 'reveal_flaw',
      message:
        'Let me show you where the flaw was. Take a look at the explanation again.',
    };
  }

  if (consecutiveFailures === 2 && currentRung > 1) {
    const newRung = (currentRung - 1) as 1 | 2 | 3 | 4;
    return {
      action: 'lower_difficulty',
      message:
        "Let's try a simpler challenge. This one will have a more obvious flaw.",
      newDifficultyRung: newRung,
    };
  }

  return {
    action: 'exit_to_standard',
    message:
      "That's okay — this was a tough challenge. Let's review this topic in the standard way first.",
  };
}

// ---------------------------------------------------------------------------
// Assessment parsing
// ---------------------------------------------------------------------------

/**
 * Parses an EVALUATE assessment from an LLM response containing
 * a JSON block in the structured assessment section.
 *
 * Expected JSON format:
 * ```json
 * {"challengePassed": true, "flawIdentified": "description", "quality": 4}
 * ```
 */
export function parseEvaluateAssessment(
  llmResponse: string
): EvaluateAssessment | null {
  // Look for JSON block in the response
  const jsonMatch = llmResponse.match(/\{[\s\S]*?"challengePassed"[\s\S]*?\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const challengePassed =
      typeof parsed.challengePassed === 'boolean'
        ? parsed.challengePassed
        : false;
    const quality =
      typeof parsed.quality === 'number'
        ? Math.max(0, Math.min(5, Math.round(parsed.quality)))
        : challengePassed
        ? 4
        : 2;
    const flawIdentified =
      typeof parsed.flawIdentified === 'string'
        ? parsed.flawIdentified
        : undefined;

    return { challengePassed, quality, flawIdentified };
  } catch {
    return null;
  }
}
