// ---------------------------------------------------------------------------
// Eval-LLM — Post-run gate decision [WI-1148]
//
// Decides the harness exit code AFTER the run (and any --update-baseline seed)
// completes. Pulled out of index.ts's main() so it is unit-testable WITHOUT
// importing index.ts, which self-invokes main() at module load.
//
// The bug this fixes: index.ts used to `process.exit(1)` on ANY scenario-quality
// failure BEFORE running the --check-baseline drift comparison. With ~262
// non-deterministic live calls per weekly run, a stray quality failure is
// routine (6 observed 2026-06-29), so the drift gate — the entire purpose of
// eval-live.yml — was unreachable. evaluateGates() runs the drift comparison
// whenever --check-baseline is set REGARDLESS of quality failures, then exits
// non-zero if EITHER gate tripped, naming both reasons. Quality failures still
// FAIL the run (they are real signal); they simply no longer MASK drift.
// ---------------------------------------------------------------------------

import type { RunOptions, RunSummary } from './runner';
import {
  compareAgainstBaseline,
  formatDriftReport,
  type Baseline,
} from './metrics';
import { isCoverageIncomplete } from './coverage';

/** A line for the caller to print: stdout (`log`) or stderr (`error`). */
export interface GateMessage {
  level: 'log' | 'error';
  text: string;
}

export interface GateResult {
  /** 0 = clean, 1 = a gate tripped, 2 = misconfiguration (no baseline file). */
  exitCode: 0 | 1 | 2;
  /**
   * Whether the --check-baseline drift comparison actually executed. This is
   * the regression-critical property: it MUST be true when `checkBaseline` is
   * set, even if quality failures occurred. The pre-WI-1148 ordering left it
   * effectively false because the quality exit short-circuited first.
   */
  driftEvaluated: boolean;
  /** Ordered messages for the caller to print (keeps this fn side-effect-free). */
  messages: GateMessage[];
}

export interface GateDeps {
  readBaseline: () => Promise<Baseline | null>;
  baselinePath: string;
  tolerancePp: number;
}

/**
 * Decide the post-run exit. The caller has already printed the run summary and,
 * for --update-baseline, written the baseline file. This function does NOT call
 * process.exit and does NOT print — it returns the exit code + messages so it
 * can be exercised by a unit test.
 */
export async function evaluateGates(
  summary: RunSummary,
  options: RunOptions,
  deps: GateDeps,
): Promise<GateResult> {
  const messages: GateMessage[] = [];
  const qualityFailed = summary.qualityFailures > 0;
  // [WI-2461 AC-3] Execution gate: runner.ts increments liveCallsFailed when a
  // flow's runLive throws (provider/runtime error). Such a run produced no
  // judgeable output for those calls, so it can never be trusted green — the
  // pre-fix gate ignored this counter and a genuine execution failure exited 0.
  const executionFailed = summary.liveCallsFailed > 0;

  if (qualityFailed) {
    messages.push({
      level: 'error',
      text: 'Quality gate: scenario-level failures detected. Open the snapshots with "Quality issues" sections.',
    });
  }

  if (executionFailed) {
    messages.push({
      level: 'error',
      text: `Execution gate: ${summary.liveCallsFailed} live call(s) failed to execute (provider/runtime errors). Open the snapshots with "Error" lines under their live-response section.`,
    });
  }

  // --update-baseline seed path: the baseline was already written by the caller
  // (it includes the failed samples by design, WI-556). Never compare against a
  // baseline we just wrote. Quality and execution failures still fail the run
  // so an operator inspects them before committing the seed.
  if (options.updateBaseline) {
    // [WI-3029 S5] A starved seed run must never look clean: seeding from a
    // truncated run is strictly worse than checking against one, so an
    // incomplete envelopeCoverage flow fails this path exactly like a
    // quality/execution failure does, even when neither of those fired.
    const incompleteFlows = Object.entries(summary.envelopeCoverage).filter(
      ([, coverage]) => isCoverageIncomplete(coverage),
    );
    if (qualityFailed || executionFailed || incompleteFlows.length > 0) {
      messages.push({
        level: 'error',
        text: 'NOTE: baseline.json WAS written (signal distributions include the failed samples). Triage the quality/live-call execution failures above before committing it.',
      });
      for (const [flowId, coverage] of incompleteFlows) {
        messages.push({
          level: 'error',
          text:
            `Coverage gate: ${flowId} is incomplete (attempted=${coverage.attempted}, ` +
            `completed=${coverage.completed}, budget-skipped=${coverage.budgetSkipped}, ` +
            `required=${coverage.required}); the written baseline for this flow is truncated — ` +
            'do not commit it as-is.',
        });
      }
      return { exitCode: 1, driftEvaluated: false, messages };
    }
    return { exitCode: 0, driftEvaluated: false, messages };
  }

  let driftEvaluated = false;
  let driftExceeded = false;
  let coverageIncomplete = false;

  // The drift comparison runs whenever --check-baseline is set — independently
  // of `qualityFailed`. This ordering IS the fix.
  if (options.checkBaseline) {
    const baseline = await deps.readBaseline();
    if (!baseline) {
      messages.push({
        level: 'error',
        text: `No baseline found at ${deps.baselinePath} — run with --update-baseline first to seed it.`,
      });
      return { exitCode: 2, driftEvaluated: false, messages };
    }
    driftEvaluated = true;
    for (const [flowId, coverage] of Object.entries(summary.envelopeCoverage)) {
      // No `baseline.flows[flowId]` guard: a flow not yet seeded into the
      // baseline (a brand-new envelope flow) is EXACTLY the case
      // compareAgainstBaseline below excludes from drift (budget starvation
      // isn't a signal collapse) — so the coverage gate must catch it
      // regardless of baseline membership, or it is invisible everywhere.
      // [WI-3029 S3]
      if (isCoverageIncomplete(coverage)) {
        coverageIncomplete = true;
        messages.push({
          level: 'error',
          text:
            `Coverage gate: ${flowId} is incomplete (attempted=${coverage.attempted}, ` +
            `completed=${coverage.completed}, budget-skipped=${coverage.budgetSkipped}); ` +
            'baseline drift is not evaluated for this flow.',
        });
      }
    }
    const drifts = compareAgainstBaseline(
      summary.envelopeMetrics,
      baseline,
      deps.tolerancePp,
      summary.envelopeCoverage,
    );
    if (drifts.length === 0) {
      messages.push({
        level: 'log',
        text: `Baseline check passed (tolerance: ${(deps.tolerancePp * 100).toFixed(1)}pp).`,
      });
    } else {
      driftExceeded = true;
      messages.push({ level: 'error', text: formatDriftReport(drifts) });
      messages.push({ level: 'error', text: '' });
      messages.push({
        level: 'error',
        text: `Baseline tolerance: ${(deps.tolerancePp * 100).toFixed(
          1,
        )}pp. Inspect the drift above, then run with --update-baseline if the shift is intentional.`,
      });
    }
  }

  if (qualityFailed || executionFailed || driftExceeded || coverageIncomplete) {
    const reasons = [
      qualityFailed ? 'scenario-quality failures' : null,
      executionFailed ? 'live-call execution failures' : null,
      driftExceeded ? 'baseline signal drift' : null,
      coverageIncomplete ? 'incomplete baseline coverage' : null,
    ].filter((r): r is string => r !== null);
    messages.push({
      level: 'error',
      text: `Eval gate failed: ${reasons.join(' AND ')}.`,
    });
    return { exitCode: 1, driftEvaluated, messages };
  }

  return { exitCode: 0, driftEvaluated, messages };
}
