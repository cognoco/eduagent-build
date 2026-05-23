export { prepareHomework } from './prepare-homework';
export { generateDictation } from './generate';
export type { GenerateContext } from './generate';
export { reviewDictation } from './review';
export type { DictationReviewResult } from './review';
export {
  deriveLegacyDictationCompletionKey,
  recordDictationResult,
  getDictationStreak,
  fetchGenerateContext,
} from './result';
export type { RecordResultInput, StreakResult } from './result';
