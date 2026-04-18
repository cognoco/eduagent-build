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

export type AgeBracket = 'child' | 'adolescent' | 'adult';

export function describeAgeBracket(ageBracket: AgeBracket): string {
  switch (ageBracket) {
    case 'child':
      return '6-9';
    case 'adolescent':
      return '10-13';
    default:
      return '14+';
  }
}
