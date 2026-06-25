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
 *   - Returns `true` if the session is on the interview/onboarding fast path
 *     (`metadata.onboardingFastPath` object present) AND the persisted
 *     `exchangeCount` has reached {@link MAX_INTERVIEW_EXCHANGES}. This is
 *     the server-side hard cap mandated by the envelope contract in
 *     AGENTS.md — without it the interview runs all the way to
 *     MAX_EXCHANGES_PER_SESSION (50).
 *   - Returns `false` otherwise. Non-interview sessions are not capped here
 *     and rely on the global MAX_EXCHANGES_PER_SESSION ceiling.
 *
 * Note: the LLM-driven early-close path (`signals.ready_to_finish`) was
 * removed because `ready_to_finish` is absent from every exchange prompt
 * template (`getExchangeEnvelopeInstruction` in exchange-prompts.ts), so
 * the LLM never emits it and the path was permanently dead. The hard cap
 * above is sufficient — it is the server-side safety net mandated by the
 * envelope contract, and it fires even when the LLM never signals.
 *
 * Extracted as a pure function so the cap logic is unit-testable without
 * spinning up the full processMessage DB pipeline.
 */
export function resolveReadyToFinish(input: {
  exchangeCount: number;
  sessionMetadata: Record<string, unknown> | null;
}): boolean {
  const meta = input.sessionMetadata;
  const isInterviewFlow =
    meta != null &&
    meta['onboardingFastPath'] != null &&
    typeof meta['onboardingFastPath'] === 'object' &&
    !Array.isArray(meta['onboardingFastPath']);
  if (!isInterviewFlow) return false;
  return input.exchangeCount >= MAX_INTERVIEW_EXCHANGES;
}
