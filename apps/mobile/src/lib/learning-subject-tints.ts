import type { ThemeColors } from './theme';

export interface LearningSubjectTint {
  solid: string;
  soft: string;
}

export function getLearningSubjectTint(
  index: number,
  colors: ThemeColors,
): LearningSubjectTint {
  const palette = [
    { solid: colors.practiceQuiz, soft: colors.practiceQuizBg },
    { solid: colors.practiceDictation, soft: colors.practiceDictationBg },
    { solid: colors.practiceRecite, soft: colors.practiceReciteBg },
    { solid: colors.practiceMint, soft: colors.practiceReviewBg },
    { solid: colors.practiceHistory, soft: colors.practiceChipBg },
  ];

  return palette[index % palette.length]!;
}
