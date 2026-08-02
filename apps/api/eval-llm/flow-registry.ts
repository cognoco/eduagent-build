import { capitalsFlow } from './flows/quiz-capitals';
import { vocabularyFlow } from './flows/quiz-vocabulary';
import { guessWhoFlow } from './flows/quiz-guess-who';
import { dictationGenerateFlow } from './flows/dictation-generate';
import { dictationGenerateSanitizationFlow } from './flows/dictation-generate-sanitization';
import { prepareHomeworkFlow } from './flows/dictation-prepare-homework';
import { dictationReviewFlow } from './flows/dictation-review';
import { sessionAnalysisFlow } from './flows/session-analysis';
import { sessionRecapFlow } from './flows/session-recap';
import { sessionSummaryFlow } from './flows/session-summary';
import { filingPreSessionFlow } from './flows/filing-pre-session';
import { topicProbeSignalsFlow } from './flows/topic-probe-signals';
import { topicIntentMatcherFlow } from './flows/topic-intent-matcher';
import { subjectClassifyFlow } from './flows/subject-classify';
import { languageDetectFlow } from './flows/language-detect';
import { bookSuggestionRegenerationFlow } from './flows/book-suggestion-regeneration';
import { progressSummaryFlow } from './flows/progress-summary';
import { assessmentEvaluationFlow } from './flows/assessment-evaluation';
import { recallGraderFlow } from './flows/recall-grader';
import { anthropicResponseFormatFlow } from './flows/anthropic-response-format';
import { languagePromptsFlow } from './flows/language-prompts';
import { gradedInputPromptsFlow } from './flows/graded-input-prompts';
import { adaptiveTeachingFlow } from './flows/adaptive-teaching';
import { nowParkReturnFlow } from './flows/now-park-return';
import { parkAndReturnRankingFlow } from './flows/park-and-return-ranking';
import { parkAndReturnReweaveFlow } from './flows/park-and-return-reweave';
import { appHelpV2Flow } from './flows/app-help-v2';
import { misconceptionRepairFlow } from './flows/misconception-repair';
import { teachingSessionFlow } from './flows/teaching-session';
import { challengeGraderFlow } from './flows/challenge-grader';
import { judgeSuitabilityFlow } from './flows/judge-suitability';
import { learningTextSafetyJudgeFlow } from './flows/learning-text-safety-judge';
import { recheckJudgeFlow } from './flows/recheck-judge';
import {
  exchangesFlow,
  homeworkNoticeFlow,
  probesFlow,
  safetyProbesFlow,
  languageQualityFlow,
  challengeRoundMasteryFlow,
  reviewContinuityOpenerFlow,
} from './envelope-flow-registry';
import type { FlowDefinition } from './runner/types';

export const FLOWS: FlowDefinition[] = [
  capitalsFlow,
  vocabularyFlow,
  guessWhoFlow,
  dictationGenerateFlow,
  dictationGenerateSanitizationFlow,
  prepareHomeworkFlow,
  dictationReviewFlow,
  sessionAnalysisFlow,
  sessionRecapFlow,
  sessionSummaryFlow,
  filingPreSessionFlow,
  exchangesFlow,
  homeworkNoticeFlow,
  topicProbeSignalsFlow,
  topicIntentMatcherFlow,
  subjectClassifyFlow,
  languageDetectFlow,
  probesFlow,
  safetyProbesFlow,
  languageQualityFlow,
  bookSuggestionRegenerationFlow,
  progressSummaryFlow,
  assessmentEvaluationFlow,
  anthropicResponseFormatFlow,
  languagePromptsFlow,
  gradedInputPromptsFlow,
  adaptiveTeachingFlow,
  nowParkReturnFlow,
  parkAndReturnRankingFlow,
  parkAndReturnReweaveFlow,
  appHelpV2Flow,
  challengeRoundMasteryFlow,
  misconceptionRepairFlow,
  teachingSessionFlow,
  challengeGraderFlow,
  reviewContinuityOpenerFlow,
  recallGraderFlow,
  judgeSuitabilityFlow,
  recheckJudgeFlow,
  learningTextSafetyJudgeFlow,
];
