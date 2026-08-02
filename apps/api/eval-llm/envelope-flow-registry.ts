import { exchangesFlow } from './flows/exchanges';
import { homeworkNoticeFlow } from './flows/homework-notice';
import { probesFlow } from './flows/probes';
import { safetyProbesFlow } from './flows/safety-probes';
import { languageQualityFlow } from './flows/language-quality';
import { challengeRoundMasteryFlow } from './flows/challenge-round-mastery';
import { reviewContinuityOpenerFlow } from './flows/review-continuity-opener';
import type { FlowDefinition } from './runner/types';

/** The real subset tracked by --only-envelope-flows and baseline.json. */
export const ENVELOPE_FLOWS: FlowDefinition[] = [
  exchangesFlow as FlowDefinition,
  homeworkNoticeFlow as FlowDefinition,
  probesFlow as FlowDefinition,
  safetyProbesFlow as FlowDefinition,
  languageQualityFlow as FlowDefinition,
  challengeRoundMasteryFlow as FlowDefinition,
  reviewContinuityOpenerFlow as FlowDefinition,
];

export {
  exchangesFlow,
  homeworkNoticeFlow,
  probesFlow,
  safetyProbesFlow,
  languageQualityFlow,
  challengeRoundMasteryFlow,
  reviewContinuityOpenerFlow,
};
