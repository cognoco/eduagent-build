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
 * [CR-2026-05-19-H11] Product is strictly 11+; `computeAgeBracket` only ever
 * returns 'child' for impossibly-low birth years. The 'child' branch is kept
 * as a defensive fallback but must NOT emit kid-flavored framing ("under 13",
 * "young child") that would steer the LLM into simplified, age-inappropriate
 * register for the actual 11-12 cohort. We treat it as the lowest in-range
 * label ("11-12") so any leak still produces in-product framing.
 */
export function describeAgeBracket(ageBracket: AgeBracket): string {
  switch (ageBracket) {
    case 'child':
      return '11-12';
    case 'adolescent':
      return '11-17';
    case 'adult':
      return '18+';
    default: {
      const exhaustive: never = ageBracket;
      throw new Error(`Unexpected ageBracket: ${exhaustive}`);
    }
  }
}
