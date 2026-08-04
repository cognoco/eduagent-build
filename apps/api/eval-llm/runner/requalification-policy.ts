/**
 * Mastery over-credit requalification policy [WI-3043, ratified 2026-08-05].
 *
 * WHAT: when the over-credit ceiling check flags a scenario, that offender is
 * re-tested this many times before the breach is allowed to red CI. The gate
 * exits 1 only if the breach REPRODUCES, so a one-off LLM slip does not fail
 * the run — see eval-llm/README.md, "--check-baseline".
 *
 * THE POLICY IS FIXED PER OFFENDER, NOT ADAPTIVE. Every offender gets the full
 * round count regardless of how many offenders a run turns up. The alternative
 * considered was adaptive rounds — fewer for a single isolated offender on the
 * theory that one offender is likelier a flake than a real regression. That
 * option was rejected because it *requires* the isolated-flake assumption, and
 * the assumption can only be justified by observed reproduce statistics. There
 * are none: over-credit is a hard pass/fail ceiling rather than a tracked rate,
 * so nothing in the repo records it, and the only producer of such data — the
 * weekly live gate in eval-live.yml — had eight scheduled runs and zero
 * successes at the time of the ruling. With zero observations the assumption
 * cannot be validated, and under this harness's fail-closed posture an
 * unvalidated assumption that weakens evidence is not available. Fixed rounds
 * require no such assumption.
 *
 * WHY IT LIVES IN ITS OWN MODULE, away from sim-budget.ts: the round count must
 * never become a residue of whatever live-call budget happens to remain. The
 * budget derivation MAY consume this policy's cost — deriveMasteryReproduceCapacity
 * takes the round count as an input and fails closed when it cannot afford it —
 * but it must never DEFINE the rounds. Keeping the policy in a module with no
 * budget imports makes that direction structural rather than a comment someone
 * has to trust.
 *
 * Changing the round count is a policy decision, not a tuning knob. It is pinned
 * by requalification-policy.test.ts precisely so a budget refactor cannot move it
 * silently.
 */
export const MASTERY_REQUALIFICATION_ROUNDS = 3;

/**
 * Total reproduce rounds required to requalify `offenderCount` flagged
 * scenarios. Fixed per offender by ratified policy, so this scales linearly and
 * deliberately: N offenders cost N × MASTERY_REQUALIFICATION_ROUNDS rounds.
 */
export function requalificationRoundsFor(offenderCount: number): number {
  if (offenderCount <= 0) {
    return 0;
  }

  return offenderCount * MASTERY_REQUALIFICATION_ROUNDS;
}
