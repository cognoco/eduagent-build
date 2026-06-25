// ---------------------------------------------------------------------------
// Suitability-judge profile / sampling (MMT-ADR-0016 §3 — judge framework
// phase 4 increment 1, post-display calibration).
//
// This resolver answers ONE question: for a learner of a given age bracket,
// what fraction of tutor replies does the post-display suitability judge cover?
//
//   - Under-18 (child, adolescent): coverage 1.0 — every reply is judged.
//     Coverage is never the risk-targeted variable (§3): judging is cheap, so
//     full coverage keeps the DPIA claim simple ("every reply to a minor is
//     independently reviewed"). The RISK-targeted variable is the gating MODE,
//     which is phase-5 work and is NOT resolved here.
//   - Adult: sampled at ADULT_SUITABILITY_SAMPLING (launch 0.1).
//   - Unknown/absent age: conservative minor default (1.0) — fail safe toward
//     more coverage, never less.
//
// The gating mode (S/G/F per §3) is intentionally absent: S-vs-G turns on the
// per-jurisdiction digital-consent age (13–16 by country), which this function
// does not receive, and gating is not enforced in increment 1 regardless.
// ---------------------------------------------------------------------------

import type { AgeBracket } from '@eduagent/schemas';

/** Adult post-display coverage at launch. Tunable during calibration. */
export const ADULT_SUITABILITY_SAMPLING = 0.1;

/** Coverage for any minor / unknown-age learner: every reply is judged. */
const MINOR_SUITABILITY_SAMPLING = 1.0;

export interface SuitabilityProfile {
  /**
   * Probability in [0, 1] that a given reply is sent to the suitability judge.
   * 1.0 = every reply (all under-18 + unknown age); adults sampled.
   */
  sampling: number;
}

/**
 * Resolve the post-display suitability coverage for a learner's age bracket.
 * `null`/`undefined` (age not loaded) falls back to the conservative minor
 * default so an unknown learner is never under-covered.
 */
export function resolveSuitabilityProfile(
  ageBracket: AgeBracket | null | undefined,
): SuitabilityProfile {
  if (ageBracket === 'adult') {
    return { sampling: ADULT_SUITABILITY_SAMPLING };
  }
  // child, adolescent, and unknown (null/undefined) → full coverage.
  return { sampling: MINOR_SUITABILITY_SAMPLING };
}

/**
 * Decide whether THIS reply is judged, given an injected random draw `rng`
 * from [0, 1). `rng` is injected (not read from `Math.random()` here) so the
 * decision is pure and deterministically testable. Strict `<` makes the rate a
 * lower-exclusive bound: sampling 0.1 judges ~10% of uniform draws.
 */
export function shouldJudge(
  ageBracket: AgeBracket | null | undefined,
  rng: number,
): boolean {
  return rng < resolveSuitabilityProfile(ageBracket).sampling;
}
