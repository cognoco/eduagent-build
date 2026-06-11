// ---------------------------------------------------------------------------
// Session Exchange Spine slice — carved from session-exchange.ts (WI-571)
//
// Contains: resolveReadyToFinish (interview/onboarding hard-cap logic).
//
// This is a structural carve only. Behavior is NOT changed.
// ---------------------------------------------------------------------------

import { MAX_INTERVIEW_EXCHANGES } from '../exchanges';

/**
 * [BUG-92 / CR-2026-05-19-C4] Decide whether the interview / onboarding loop
 * should terminate on this turn.
 *
 * Contract:
 *   - Returns `true` if the LLM emitted `signals.ready_to_finish`
 *     (passed in as `llmReadyToFinish`).
 *   - Returns `true` if the session is on the interview/onboarding fast path
 *     (`metadata.onboardingFastPath` object present) AND the persisted
 *     `exchangeCount` has reached {@link MAX_INTERVIEW_EXCHANGES}. This is
 *     the server-side hard cap mandated by the envelope contract in
 *     AGENTS.md — without it, an LLM that never emits the signal lets the
 *     interview run all the way to MAX_EXCHANGES_PER_SESSION (50).
 *   - Returns `false` otherwise. Non-interview sessions are not capped here
 *     and rely on the global MAX_EXCHANGES_PER_SESSION ceiling.
 *
 * Extracted as a pure function so the cap logic is unit-testable without
 * spinning up the full processMessage DB pipeline.
 */
export function resolveReadyToFinish(input: {
  llmReadyToFinish: boolean;
  exchangeCount: number;
  sessionMetadata: Record<string, unknown> | null;
}): boolean {
  if (input.llmReadyToFinish) return true;
  const meta = input.sessionMetadata;
  const isInterviewFlow =
    meta != null &&
    meta['onboardingFastPath'] != null &&
    typeof meta['onboardingFastPath'] === 'object' &&
    !Array.isArray(meta['onboardingFastPath']);
  if (!isInterviewFlow) return false;
  return input.exchangeCount >= MAX_INTERVIEW_EXCHANGES;
}
