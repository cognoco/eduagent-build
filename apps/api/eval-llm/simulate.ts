#!/usr/bin/env -S tsx
// ---------------------------------------------------------------------------
// Challenge-Round simulated-learner harness — CLI entry.
//
// Generates non-scripted, multi-turn Challenge Round transcripts (topic ×
// persona × N runs) and measures the mastery gate against ground truth. A
// SYNTHETIC pre-screen that COMPLEMENTS RR-2 (it does NOT discharge RR-2's
// real-staging-transcript dependency) and feeds the mastery-bar half of RR-6.
//
// PRODUCTION GRADER-ON pipeline: the TUTOR is pinned to gpt-oss-120b (MENTOR_MODEL,
// via OpenRouter — the harness router can't reach the production gpt-oss host) and
// only drives the conversation; the measured component is the GRADER (the
// production-routed grading model), which owns the mastery evaluation. NOTE:
// every sim scenario is a minor, and the router's under-18 gate resolves before
// the capability:'judge' branch, so the resolved grader is the age-appropriate
// approved model (possibly the same family as the tutor), NOT necessarily the
// adult claude judge — adult-judge coverage needs the T13 adult scenarios. The optional
// `--grader-model` override pins a grader CANDIDATE for an A/B; omit it (the
// committed-gate default) and the grader is production-routed to the
// judge-of-record. The learner is always a pinned OpenRouter slug (`--learner-model`).
//
//   pnpm --filter @eduagent/api eval:llm:sim -- --list
//     List the scenario grid. No LLM call, no Doppler (no provider bootstrap).
//
//   pnpm --filter @eduagent/api eval:llm:sim -- --validate-baseline
//     Deterministic, key-free: structurally validate the committed
//     simulation-baseline.json + check the judge slug is current. No LLM call.
//
//   doppler run -c stg -- pnpm --filter @eduagent/api eval:llm:sim -- \
//     --learner-model meta-llama/llama-3.3-70b-instruct --runs 3 \
//     --max-live-calls 189 --check-baseline
//     Live grid: gpt-oss tutor + production judge grade a distinct learner;
//     enforce the over-credit ceiling + drift vs the committed baseline. The
//     learner must be a non-gpt family (the stg minor judge is gpt-4o-mini —
//     openai/gpt-4o collides and the two-model guard hard-fails).
//   doppler run -c stg -- pnpm --filter @eduagent/api eval:llm:sim -- \
//     --grader-model openai/gpt-oss-120b \
//     --learner-model anthropic/claude-3.5-sonnet --runs 5
//     Live grid: the candidate JUDGE grades a distinct learner model. Omit
//     --max-live-calls to auto-fit the budget to the grid (no silent truncation).
//     Use --runs >=5 for a calibration-grade N (see metrics.sufficientForCalibration).
//     Add --check-baseline to enforce the over-credit ceiling + drift vs the
//     committed simulation-baseline.json; --update-baseline (re)seeds it.
//
// Prerequisites for a live run:
//   - OPENROUTER_API_KEY in the resolved Doppler config (-c stg). The learner
//     ALWAYS calls OpenRouter; bootstrap treats the key as optional and only
//     fails at call time, so its absence surfaces mid-run otherwise.
//   - ANTHROPIC_API_KEY (or the judge-of-record's key) for the production grader.
//   - The two-model guard (learner ≠ grader, and not the same base family) must
//     pass — see runner/simulated-conversation.ts. It runs in-round on the
//     resolved grader slug; an explicit --grader-model is also checked up-front.
//
// Caveat: --provider pins the OpenRouter host GLOBALLY (every OpenRouter call
// this run, including a grader candidate), so only use it when the grader is
// production-routed or both deliberately share the pinned host.
// ---------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { MAX_CHALLENGE_QUESTIONS } from '../src/services/challenge-round/caps';
import {
  CHALLENGE_SIM_SCENARIOS,
  resolveScenarioProfile,
} from './fixtures/challenge-personas';
import type { EvalProfile } from './fixtures/profiles';
import { setOpenRouterModelOverride } from './runner/llm-client';
import {
  bootstrapLlmProviders,
  setOpenRouterProviderPin,
} from './runner/llm-bootstrap';
import {
  assertTwoModelGuard,
  MENTOR_MODEL,
  resolveJudgeSlugProbe,
  resolveProductionGraderModel,
  runSimulatedRound,
  type SimulatedRoundResult,
} from './runner/simulated-conversation';
import {
  aggregate,
  compareSimulationBaseline,
  formatSimulatorDiagnosticMetrics,
  toBaseline,
  validateBaselineStructure,
  writeCorpus,
  type SimulationBaseline,
} from './runner/simulation-metrics';

/**
 * Upper bound on LLM calls per round: learner + grader + tutor, once per
 * question. The grader is a real LLM call per turn under the grader-ON pipeline,
 * so this is 3× (not 2×) MAX_CHALLENGE_QUESTIONS — undercounting it would let
 * `maxRounds = floor(maxLiveCalls / CALLS_PER_ROUND)` silently overspend the cap.
 */
const CALLS_PER_ROUND = 3 * MAX_CHALLENGE_QUESTIONS;

const BASELINE_PATH = path.resolve(__dirname, 'simulation-baseline.json');
/**
 * Soft-drift tolerance (percentage points). Deliberately wide: at the weekly
 * grid's small N the soft-drift channel is near-uninformative, so drift is
 * advisory-only until N is large enough to calibrate against seed variance.
 * Doubled again for <10 rounds inside compareSimulationBaseline.
 */
const DRIFT_TOLERANCE_PP = 0.15;
/** Re-run an over-credit breach this many times before failing CI (kills the
 *  one-off-LLM-slip false positive; only a reproducing breach reds). */
const REPRODUCE_N = 3;

interface SimCliArgs {
  learnerModel: string | null;
  /** Optional grader CANDIDATE slug (OpenRouter override). null = production. */
  graderModel: string | null;
  provider: string | null;
  topics: string[] | 'all';
  runs: number;
  /** null = auto-fit to the grid (no silent truncation). */
  maxLiveCalls: number | null;
  list: boolean;
  allowSameFamily: boolean;
  validateBaseline: boolean;
  checkBaseline: boolean;
  updateBaseline: boolean;
}

function parseArgs(argv: string[]): SimCliArgs {
  const args: SimCliArgs = {
    learnerModel: null,
    graderModel: null,
    provider: null,
    topics: 'all',
    runs: 1,
    maxLiveCalls: null,
    list: false,
    allowSameFamily: false,
    validateBaseline: false,
    checkBaseline: false,
    updateBaseline: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      i += 1;
      return v;
    };
    switch (flag) {
      case '--':
        // pnpm --filter passes the `--` separator through literally; ignore it.
        break;
      case '--learner-model':
        args.learnerModel = next();
        break;
      case '--grader-model':
        args.graderModel = next();
        break;
      case '--provider':
        args.provider = next();
        break;
      case '--topics': {
        const raw = next();
        args.topics =
          raw === 'all'
            ? 'all'
            : raw
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
        break;
      }
      case '--runs':
        args.runs = Math.max(1, Number.parseInt(next(), 10) || 1);
        break;
      case '--max-live-calls': {
        // Keep an explicit 0 as 0 (a hard budget that runs nothing) instead of
        // letting `|| DEFAULT` silently promote it. A non-numeric value is an
        // error rather than a silent fallback.
        const parsed = Number.parseInt(next(), 10);
        if (!Number.isFinite(parsed)) {
          throw new Error('--max-live-calls expects an integer');
        }
        args.maxLiveCalls = parsed;
        break;
      }
      case '--list':
        args.list = true;
        break;
      case '--allow-same-family':
        args.allowSameFamily = true;
        break;
      case '--validate-baseline':
        args.validateBaseline = true;
        break;
      case '--check-baseline':
        args.checkBaseline = true;
        break;
      case '--update-baseline':
        args.updateBaseline = true;
        break;
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  return args;
}

function selectScenarios(
  topics: string[] | 'all',
): typeof CHALLENGE_SIM_SCENARIOS {
  if (topics === 'all') return CHALLENGE_SIM_SCENARIOS;
  const wanted = new Set(topics.map((t) => t.toLowerCase()));
  return CHALLENGE_SIM_SCENARIOS.filter((s) => wanted.has(s.id.toLowerCase()));
}

function printGrid(): void {
  console.log('Challenge-Round simulated-learner scenarios:\n');
  for (const s of CHALLENGE_SIM_SCENARIOS) {
    const profile = resolveScenarioProfile(s);
    console.log(
      `  ${s.id.padEnd(34)} profile=${(profile?.id ?? '??').padEnd(22)} expected=${s.expectedOutcome}`,
    );
  }
  console.log(
    `\n${CHALLENGE_SIM_SCENARIOS.length} scenarios. Use --topics <id,id|all> to select; --runs N to repeat.`,
  );
}

/**
 * Run a prebuilt grid of scenarios, skipping rounds whose profile is missing or
 * that error transiently, but hard-failing the run on a two-model guard error
 * (a config mistake, not a transient blip).
 */
async function runRounds(
  grid: typeof CHALLENGE_SIM_SCENARIOS,
  args: SimCliArgs,
): Promise<SimulatedRoundResult[]> {
  const results: SimulatedRoundResult[] = [];
  for (const [i, scenario] of grid.entries()) {
    const profile = resolveScenarioProfile(scenario);
    if (!profile) {
      console.warn(`  [skip] ${scenario.id}: profile not found`);
      continue;
    }
    let result: SimulatedRoundResult;
    try {
      result = await runSimulatedRound({
        scenario,
        profile,
        learnerModel: args.learnerModel!,
        graderModel: args.graderModel,
        allowSameFamily: args.allowSameFamily,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The two-model guard is a config error — hard-fail the whole run rather
      // than silently emitting an empty/partial corpus. Any other error (a
      // transient OpenRouter 429/5xx/network blip) skips just this round so a
      // single failure near the end of a paid run doesn't discard the rest.
      if (msg.startsWith('two-model guard')) throw err;
      console.warn(
        `  [${i + 1}/${grid.length}] ${scenario.id}: round FAILED (${msg}) — skipped; corpus keeps completed rounds.`,
      );
      continue;
    }
    results.push(result);
    const flag =
      result.decision.outcome === 'verified' &&
      result.expectedOutcome !== 'verified'
        ? ' ⚠ OVER-CREDIT'
        : '';
    console.log(
      `  [${i + 1}/${grid.length}] ${scenario.id}: gate=${result.decision.outcome} (expected=${result.expectedOutcome}) signal=${result.signalEmitted}${flag}`,
    );
  }
  return results;
}

interface ReproduceResult {
  /** Scenario ids that over-credited AGAIN on the re-run. */
  reproducedIds: string[];
  /** Re-test rounds we attempted (offenders × n). */
  attempted: number;
  /** Re-test rounds that actually completed (attempted minus transient skips). */
  completed: number;
}

/**
 * Re-run just the named over-credit scenarios N× to tell a one-off LLM slip
 * (non-reproducing) from a genuine leniency regression (reproducing). Returns
 * BOTH the reproduced ids AND attempted/completed counts so the caller can fail
 * CLOSED when re-test rounds get skipped — a detected breach must never be
 * exonerated by transient flakiness in the verification step. Runs after
 * bootstrap (providers ready). The caller pre-checks budget so this never
 * overspends the `--max-live-calls` hard cap.
 */
async function reproduceOverCredit(
  ids: string[],
  n: number,
  args: SimCliArgs,
): Promise<ReproduceResult> {
  const wanted = new Set(ids);
  const offenders = CHALLENGE_SIM_SCENARIOS.filter((s) => wanted.has(s.id));
  if (offenders.length === 0) {
    return { reproducedIds: [], attempted: 0, completed: 0 };
  }
  const grid = Array.from({ length: n }, () => offenders).flat();
  const results = await runRounds(grid, args);
  const metrics = aggregate(results);
  return {
    reproducedIds: [...new Set(metrics.overCreditScenarioIds)],
    attempted: grid.length,
    completed: results.length,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // --list must work with NO bootstrap (no Doppler / provider keys needed).
  if (args.list) {
    printGrid();
    return;
  }

  // --validate-baseline is deterministic + key-free: a structural check plus a
  // judge-slug currency check. It needs NO learner model and NO bootstrap, so it
  // must run BEFORE the learner-model requirement below (mirrors --list).
  if (args.validateBaseline) {
    const raw = JSON.parse(
      await readFile(BASELINE_PATH, 'utf8').catch(() => 'null'),
    ) as unknown;
    const v = validateBaselineStructure(raw);
    if (!v.ok) {
      console.error(`[eval:llm:sim] invalid baseline: ${v.reason}`);
      process.exit(1);
    }
    const baseline = raw as SimulationBaseline;
    // Judge-slug currency (HIGH-3 staleness): pure matrix read, no bootstrap.
    // NOTE for T12: seed the baseline under the SAME llm-routing flag state this
    // probe resolves under, or the slugs will mismatch and red every PR.
    const liveJudge = resolveJudgeSlugProbe();
    if (baseline.graderModel !== liveJudge) {
      console.error(
        `[eval:llm:sim] baseline judge stale: ${baseline.graderModel} ≠ live ${liveJudge} — re-seed via --update-baseline (T12).`,
      );
      process.exit(1);
    }
    console.log('[eval:llm:sim] baseline structurally valid + judge current.');
    return;
  }

  if (!args.learnerModel) {
    throw new Error(
      '--learner-model <slug> is required for a run (omit it only with --list / --validate-baseline).',
    );
  }

  // Up-front two-model guard for the EXPLICIT grader-candidate case, so an
  // obviously-invalid config fails without touching Doppler. The production-
  // routing (null) case resolves the concrete judge slug inside runSimulatedRound
  // (after providers register) and guards there.
  if (args.graderModel) {
    assertTwoModelGuard(
      args.learnerModel,
      args.graderModel,
      args.allowSameFamily,
    );
  }

  // --check-baseline: load + structurally validate the committed baseline BEFORE
  // spending a single live call. The read used to happen after the full grid ran,
  // so a missing/invalid baseline (e.g. pre-T12 seeding) burned the entire paid
  // budget and THEN threw. Fail fast on cost instead.
  let loadedBaseline: SimulationBaseline | null = null;
  if (args.checkBaseline) {
    const raw = JSON.parse(
      await readFile(BASELINE_PATH, 'utf8').catch(() => 'null'),
    ) as unknown;
    const v = validateBaselineStructure(raw);
    if (!v.ok) {
      console.error(
        `[eval:llm:sim] cannot --check-baseline: ${v.reason}. Seed it via --update-baseline (T12) before gating.`,
      );
      process.exit(1);
    }
    loadedBaseline = raw as SimulationBaseline;
  }

  const scenarios = selectScenarios(args.topics);
  if (scenarios.length === 0) {
    throw new Error(
      `no scenarios matched --topics; run --list to see valid ids.`,
    );
  }

  // Build the grid ROUND-ROBIN (runs outer, scenarios inner): [s1..sN, s1..sN].
  // A budget truncation then drops repeats of later runs, not whole topics, so
  // the measured distribution stays representative across the scenario set.
  const fullGrid = Array.from({ length: args.runs }, () => scenarios).flat();

  // Budget: auto-fit to the grid when --max-live-calls is omitted (the default
  // never silently truncates). An explicit budget is a HARD cap — never force a
  // round that would overrun it.
  const effectiveMaxCalls =
    args.maxLiveCalls ?? fullGrid.length * CALLS_PER_ROUND;
  const maxRounds = Math.floor(effectiveMaxCalls / CALLS_PER_ROUND);
  if (maxRounds < 1) {
    throw new Error(
      `--max-live-calls=${effectiveMaxCalls} is below the ~${CALLS_PER_ROUND} calls a single round needs; raise it to run at least one round.`,
    );
  }
  const grid = fullGrid.slice(0, maxRounds);
  if (grid.length < fullGrid.length) {
    console.warn(
      `[budget] requested ${fullGrid.length} rounds but --max-live-calls=${args.maxLiveCalls} ` +
        `(~${CALLS_PER_ROUND} calls/round) caps at ${grid.length}. ${fullGrid.length - grid.length} round(s) dropped — raise --max-live-calls to run them.`,
    );
  }

  // Provider pin + grader-candidate override BEFORE bootstrap. The override
  // pins the GRADER candidate (defaultGraderTurn → runHarnessLlm honors it);
  // the tutor is pinned to MENTOR_MODEL via callOpenRouterModel directly, so it
  // ignores the grader override (but a --provider host pin DOES apply to it).
  setOpenRouterProviderPin(args.provider ? [args.provider] : null);
  setOpenRouterModelOverride(args.graderModel ?? null);
  bootstrapLlmProviders();

  console.log(
    `Running ${grid.length} simulated round(s): learner=${args.learnerModel}, tutor=${MENTOR_MODEL}, grader=${args.graderModel ?? 'production-routing'}\n`,
  );

  const results = await runRounds(grid, args);

  const metrics = aggregate(results);

  // Empty-corpus guard (gate-integrity): if EVERY round skipped — a missing
  // provider key (bootstrap treats keys as optional and fails at call time) or a
  // mass transient failure — `results` is [] and every rate is 0/empty. An
  // over-credit gate over an empty corpus would exit GREEN having measured
  // nothing. Refuse to emit/seed/gate on zero rounds; warn on a partial corpus.
  if (metrics.totalRounds === 0) {
    console.error(
      `[eval:llm:sim] measured 0 rounds — every round skipped (missing provider key or mass transient failure). ` +
        `Refusing to report, seed, or gate over an empty corpus.`,
    );
    process.exit(1);
  }
  if (metrics.totalRounds < grid.length) {
    console.warn(
      `[eval:llm:sim] coverage gap: ${grid.length - metrics.totalRounds}/${grid.length} round(s) skipped; ` +
        `metrics below cover only ${metrics.totalRounds} round(s).`,
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const corpusDir = path.resolve(__dirname, 'corpus', ts);
  await writeCorpus(corpusDir, results, metrics, {
    runs: args.runs,
    gradingPath: 'production-grader',
  });

  const ci = metrics.ci;
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  console.log(
    '\n— Calibration metrics (SYNTHETIC / PROVISIONAL, RR-2 not discharged) —',
  );
  console.log(`  rounds (N):          ${metrics.totalRounds}`);
  console.log(`  outcome rates:       ${JSON.stringify(metrics.outcomeRates)}`);
  console.log(
    `  mastery-verified:    ${pct(metrics.masteryVerifiedRate)}  [95% CI ${pct(ci.masteryVerified.low)}–${pct(ci.masteryVerified.high)}]`,
  );
  console.log(
    `  over-credit rate:    ${pct(metrics.overCreditRate)}  [95% CI ${pct(ci.overCredit.low)}–${pct(ci.overCredit.high)}]`,
  );
  console.log(
    `  under-credit rate:   ${pct(metrics.underCreditRate)}  [95% CI ${pct(ci.underCredit.low)}–${pct(ci.underCredit.high)}]`,
  );
  console.log(
    `  signal-emission:     ${pct(metrics.signalEmissionRate)}  [95% CI ${pct(ci.signalEmission.low)}–${pct(ci.signalEmission.high)}]`,
  );
  console.log(
    `  per-grader signal:   ${JSON.stringify(metrics.signalEmissionRateByGrader)}`,
  );
  for (const line of formatSimulatorDiagnosticMetrics(metrics)) {
    console.log(`  ${line}`);
  }
  if (!metrics.sufficientForCalibration) {
    console.warn(
      `\n  ⚠ INSUFFICIENT N: ${metrics.totalRounds} round(s) is a smoke run, NOT a calibration ` +
        `basis (the CIs above are wide). Re-run with --runs >=5 for a calibration-grade corpus.`,
    );
  }
  console.log(`\nCorpus written to: ${corpusDir}`);

  // --update-baseline: persist this run's metrics as the committed baseline,
  // stamping the resolved judge slug + the provenance marker.
  if (args.updateBaseline) {
    const repProfile = grid
      .map((s) => resolveScenarioProfile(s))
      .find((p): p is EvalProfile => p != null);
    if (!repProfile) {
      throw new Error(
        '--update-baseline: no scenario resolved to a profile; cannot resolve the grader slug.',
      );
    }
    const baseline = toBaseline(metrics, {
      learnerModel: args.learnerModel,
      mentorModel: MENTOR_MODEL,
      graderModel: args.graderModel ?? resolveProductionGraderModel(repProfile),
      updatedAt: new Date().toISOString(),
      provenance: 'update-baseline',
    });
    await writeFile(
      BASELINE_PATH,
      JSON.stringify(baseline, null, 2) + '\n',
      'utf8',
    );
    console.log(`\n[eval:llm:sim] wrote ${BASELINE_PATH}`);
    return;
  }

  // --check-baseline: enforce the reproduce-gated over-credit ceiling + report
  // drift. The baseline was already loaded + validated BEFORE the paid run.
  if (args.checkBaseline) {
    const baseline = loadedBaseline!;
    const gate = compareSimulationBaseline(
      metrics,
      baseline,
      DRIFT_TOLERANCE_PP,
    );
    for (const d of gate.drift) {
      console.warn(
        `[drift] ${d.metric}: ${d.baseline} → ${d.current} (Δ${d.delta})`,
      );
    }
    if (gate.overCreditCount > 0) {
      const ids = gate.overCreditScenarioIds;
      // Budget the re-test against the HARD --max-live-calls cap. If we cannot
      // requalify EVERY offender REPRODUCE_N× within the remaining budget, fail
      // CLOSED — a detected breach is never silently dropped for lack of budget.
      const neededRounds = ids.length * REPRODUCE_N;
      const remainingRounds = Math.max(0, maxRounds - grid.length);
      if (remainingRounds < neededRounds) {
        console.error(
          `[eval:llm:sim] OVER-CREDIT CEILING BREACH on ${ids.join(', ')} — ` +
            `insufficient budget to requalify (${remainingRounds} round(s) left, need ${neededRounds}). ` +
            `Failing closed; re-run with a higher --max-live-calls to re-test a suspected one-off slip.`,
        );
        process.exit(1);
      }
      console.warn(
        `[eval:llm:sim] over-credit on ${ids.join(', ')} — reproducing ${REPRODUCE_N}× before failing…`,
      );
      const rep = await reproduceOverCredit(ids, REPRODUCE_N, args);
      if (rep.reproducedIds.length > 0) {
        console.error(
          `[eval:llm:sim] OVER-CREDIT CEILING BREACH (reproduced): ${rep.reproducedIds.join(', ')}`,
        );
        process.exit(1);
      }
      // Inconclusive re-test (some re-run rounds skipped) must NOT exonerate a
      // breach found in the main run — fail closed, never pass on missing data.
      if (rep.completed < rep.attempted) {
        console.error(
          `[eval:llm:sim] OVER-CREDIT detected on ${ids.join(', ')}; reproduce INCONCLUSIVE ` +
            `(${rep.attempted - rep.completed}/${rep.attempted} re-test round(s) skipped). ` +
            `Failing closed — a breach is never exonerated by skipped re-tests.`,
        );
        process.exit(1);
      }
      console.warn(
        `[eval:llm:sim] [slip] over-credit did not reproduce across ${rep.completed} clean re-test round(s) on ${ids.join(', ')} — passing.`,
      );
    }
    console.log('[eval:llm:sim] over-credit ceiling held (0).');
    return;
  }
}

main().catch((err: unknown) => {
  console.error(
    `\n[eval:llm:sim] ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
