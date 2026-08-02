// ---------------------------------------------------------------------------
// sim-grid-gate.ts — [WI-2461 review round 2] main-grid completeness gate for
// the mastery simulator (simulate.ts).
//
// runRounds deliberately skips a round that fails transiently (or whose
// profile is missing) so a single blip near the end of a paid run does not
// discard the completed rounds. That is the right COLLECTION behavior — but
// the pre-fix DECISION behavior treated the resulting partial main grid as a
// console.warn only: an ordinary run exited 0, --check-baseline gated over an
// incomplete corpus, and --update-baseline WROTE a baseline built from
// incomplete results. This gate makes any failed main-grid round fail all
// three modes; corpus/metrics diagnostics are still written first.
//
// Extracted into its own module (same pattern as gates.ts vs index.ts)
// because simulate.ts self-invokes main() at module load and cannot be
// imported by a unit test.
// ---------------------------------------------------------------------------

export type SimRunMode = 'run' | 'check-baseline' | 'update-baseline';

export interface MainGridGateInput {
  /** Rounds the requested main grid dispatched (after any explicit budget cap). */
  attemptedRounds: number;
  /** Rounds that actually completed (runRounds results). */
  completedRounds: number;
  mode: SimRunMode;
}

export interface MainGridGateResult {
  ok: boolean;
  skippedRounds: number;
  /** Fail-closed diagnostic for the caller to print; null when ok. */
  message: string | null;
}

export function evaluateMainGridCompleteness(
  input: MainGridGateInput,
): MainGridGateResult {
  const skippedRounds = Math.max(
    0,
    input.attemptedRounds - input.completedRounds,
  );
  if (skippedRounds === 0) {
    return { ok: true, skippedRounds: 0, message: null };
  }

  const counts = `${input.completedRounds}/${input.attemptedRounds} main-grid round(s) completed (${skippedRounds} skipped)`;
  let message: string;
  switch (input.mode) {
    case 'update-baseline':
      message =
        `[eval:llm:sim] ${counts} — refusing to write simulation-baseline.json from an incomplete main grid. ` +
        `Re-run until every requested round completes before seeding.`;
      break;
    case 'check-baseline':
      message =
        `[eval:llm:sim] ${counts} — cannot check-baseline over an incomplete main grid; failing closed. ` +
        `A skipped round could hide the exact over-credit/drift the gate exists to catch.`;
      break;
    default:
      message =
        `[eval:llm:sim] ${counts} — failing the run; a partial main grid is not a trustworthy corpus. ` +
        `Re-run (transient provider failures usually clear) or fix the missing-profile config.`;
  }
  return { ok: false, skippedRounds, message };
}
