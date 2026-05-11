import { type AgeBracket } from '@eduagent/schemas';

export type { AgeBracket };

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

export function describeAgeBracket(ageBracket: AgeBracket): string {
  switch (ageBracket) {
    case 'child':
      return '11-12';
    case 'adolescent':
      return '13-17';
    default:
      return '18+';
  }
}
