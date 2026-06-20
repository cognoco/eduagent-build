/**
 * A learner interest with context indicating whether it applies to free time,
 * school activities, or both. Used for prompt personalization across quiz flows.
 */
export interface Interest {
  label: string;
  context: 'free_time' | 'school' | 'both';
}

export const QUIZ_CONFIG = {
  defaults: {
    roundSize: 6,
    libraryRatio: 0.25,
    libraryRatioMinItems: 3,
    libraryRatioScaleUpThreshold: 20,
    libraryRatioScaleUpValue: 0.35,
    timerBonusThresholdMs: 5000,
    recentlySeenBufferSize: 30,
  },
  perActivity: {
    capitals: { roundSize: 8 },
    vocabulary: {
      roundSize: 6,
      libraryRatio: 0.5,
      libraryRatioMinItems: 1,
      libraryRatioScaleUpThreshold: 10,
      libraryRatioScaleUpValue: 0.67,
    },
    guess_who: { roundSize: 4 },
  },
  xp: {
    perCorrect: 10,
    timerBonus: 2,
    perfectBonus: 25,
    guessWhoClueBonus: 3,
    freeTextBonus: 5,
  },
  celebrationThresholds: {
    perfect: 1,
    great: 0.8,
  },
  // [BUG-852] Hard cap on the number of non-final ("probe") /check submissions
  // accepted per questionIndex within a single active round. Generous relative
  // to legitimate play (guess_who has at most 5 clues; capitals/vocab are always
  // final on the first submission), but bounds the jsonb `results` row so a
  // client cannot grow it without limit by replaying /check.
  maxProbeAttemptsPerQuestion: 10,
} as const;

export type QuizActivityConfig = typeof QUIZ_CONFIG;

/**
 * [F-036b] Format an activity type enum for display:
 * "capitals" → "Capitals", "guess_who" → "Guess Who".
 *
 * Centralized here so every client (mobile, future web) gets consistent
 * casing. Otherwise each surface re-implements `.replace('_', ' ')` +
 * title-case and they drift.
 */
export function formatActivityLabel(activityType: string): string {
  return activityType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

import type { AgeBracket } from '@eduagent/schemas';
export type { AgeBracket };

/**
 * Human-readable description of an age bracket for LLM prompt injection.
 *
 * WI-570 (data-model.md §2A.5): 'child' (sub-13) added to AgeBracket for
 * the v1 13+ floor and future v1.1 sub-13 ungating. Sub-13 users cannot
 * currently reach this path (birthYearSchema enforces 13-floor); the case
 * exists for forward-compatibility.
 */
export function describeAgeBracket(ageBracket: AgeBracket): string {
  switch (ageBracket) {
    case 'child':
      // WI-570: sub-13 bracket; currently unreachable (birthYearSchema 13-floor).
      return 'under-13';
    case 'adolescent':
      return '13-17';
    case 'adult':
      return '18+';
    default: {
      const exhaustive: never = ageBracket;
      throw new Error(`Unexpected ageBracket: ${exhaustive}`);
    }
  }
}
