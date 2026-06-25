// ---------------------------------------------------------------------------
// Suitability-judge dispatch resolver (MMT-ADR-0016 §3/§7 phase 4).
//
// Pure decision + payload-shaping for the post-display suitability judge: given
// the exchange's non-PII facts (opaque event ids, age, tutor vendor/model) and
// an injected random draw, decide whether THIS reply is judged and, if so,
// build the `app/judge.suitability_requested` event payload.
//
// Purity is deliberate: no DB, no `Math.random()`, no clock here — the caller
// (`maybeDispatchSuitabilityJudge`) supplies `rng` + `timestamp` so the gating
// is deterministically unit-testable. The payload carries opaque session_events
// row ids only; the handler rehydrates text from the DB inside one step closure
// (see `inngest/functions/judge-suitability.ts`).
// ---------------------------------------------------------------------------

import {
  computeAgeBracket,
  type AgeBracket,
  type ConversationLanguage,
  type SuitabilityJudgeRequestedEvent,
} from '@eduagent/schemas';
import { shouldJudge } from './judge-profile';

export interface SuitabilityJudgeDispatchInput {
  /** `JUDGE_FRAMEWORK_ENABLED` resolved for this request. */
  enabled: boolean;
  profileId: string;
  sessionId: string;
  /**
   * session_events row id of the persisted `ai_response` reply under review.
   * Absent when the reply was not persisted — there is then no PII-safe
   * reference, so the dispatch is skipped.
   */
  replyEventId: string | undefined;
  /** session_events row id of the immediately-preceding learner message, if any. */
  precedingLearnerMessageEventId: string | undefined;
  /** Learner birth year; `null`/`undefined` (age not loaded) → conservative minor. */
  birthYear: number | null | undefined;
  tutorVendor: string | undefined;
  tutorModel: string | undefined;
  flow: string;
  conversationLanguage?: ConversationLanguage;
  /** Injected uniform draw in [0, 1) for the coverage sampling decision. */
  rng: number;
  /** Injected ISO timestamp for the event payload. */
  timestamp: string;
}

/**
 * Decide whether to dispatch the suitability judge for one reply and, if so,
 * return the event payload. Returns `null` to skip (flag off, no reply ref,
 * missing tutor identity, or not sampled).
 */
export function resolveSuitabilityJudgeDispatch(
  input: SuitabilityJudgeDispatchInput,
): SuitabilityJudgeRequestedEvent | null {
  if (!input.enabled) return null;
  // No persisted reply row → no PII-safe reference to judge. Skip.
  if (!input.replyEventId) return null;
  // The judge needs the tutor's vendor/model for calibration attribution; a
  // reply produced without a resolved provider is not a calibratable sample.
  if (!input.tutorVendor || !input.tutorModel) return null;

  // Unknown age → conservative minor default ('child' → full coverage), never
  // under-covered. Matches resolveSuitabilityProfile's null handling.
  const ageBracket: AgeBracket =
    input.birthYear != null ? computeAgeBracket(input.birthYear) : 'child';

  if (!shouldJudge(ageBracket, input.rng)) return null;

  return {
    profileId: input.profileId,
    sessionId: input.sessionId,
    replyEventId: input.replyEventId,
    precedingLearnerMessageEventId:
      input.precedingLearnerMessageEventId ?? null,
    ageBracket,
    tutorVendor: input.tutorVendor,
    tutorModel: input.tutorModel,
    flow: input.flow,
    ...(input.conversationLanguage
      ? { conversationLanguage: input.conversationLanguage }
      : {}),
    timestamp: input.timestamp,
  };
}
