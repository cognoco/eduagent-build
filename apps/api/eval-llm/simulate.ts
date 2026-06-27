#!/usr/bin/env -S tsx
// ---------------------------------------------------------------------------
// Challenge-Round simulated-learner harness — CLI entry.
//
// Generates non-scripted, multi-turn Challenge Round transcripts (topic ×
// persona × N runs) and measures the mastery gate against ground truth. A
// SYNTHETIC pre-screen that COMPLEMENTS RR-2 (it does NOT discharge RR-2's
// real-staging-transcript dependency) and feeds the mastery-bar half of RR-6.
//
//   pnpm --filter @eduagent/api eval:llm:sim -- --list
//     List the scenario grid. No LLM call, no Doppler (no provider bootstrap).
//
//   doppler run -c stg -- pnpm --filter @eduagent/api eval:llm:sim -- \
//     --mentor-model openai/gpt-oss-120b \
//     --learner-model anthropic/claude-3.5-sonnet --runs 2 --max-live-calls 30
//     Live grid: the candidate mentor model grades a distinct learner model.
//
// Prerequisites for a live run:
//   - OPENROUTER_API_KEY in the resolved Doppler config (-c stg). The learner
//     ALWAYS calls OpenRouter; bootstrap treats the key as optional and only
//     fails at call time, so its absence surfaces mid-run otherwise.
//   - The two-model guard (learner ≠ mentor, and not the same base family)
//     must pass — see runner/simulated-conversation.ts.
//
// Caveat: --provider pins the OpenRouter host GLOBALLY (every OpenRouter call
// this run, including an OpenRouter mentor candidate), so only use it when the
// mentor is production-routed or both deliberately share the pinned host.
// ---------------------------------------------------------------------------

import * as path from 'node:path';
import { MAX_CHALLENGE_QUESTIONS } from '../src/services/challenge-round/caps';
import {
  CHALLENGE_SIM_SCENARIOS,
  resolveScenarioProfile,
} from './fixtures/challenge-personas';
import { setOpenRouterModelOverride } from './runner/llm-client';
import {
  bootstrapLlmProviders,
  setOpenRouterProviderPin,
} from './runner/llm-bootstrap';
import {
  assertTwoModelGuard,
  runSimulatedRound,
  type SimulatedRoundResult,
} from './runner/simulated-conversation';
import { aggregate, writeCorpus } from './runner/simulation-metrics';

const DEFAULT_MAX_LIVE_CALLS = 30;
/** Upper bound on LLM calls per round: learner + mentor, once per question. */
const CALLS_PER_ROUND = 2 * MAX_CHALLENGE_QUESTIONS;

interface SimCliArgs {
  learnerModel: string | null;
  mentorModel: string | null;
  provider: string | null;
  topics: string[] | 'all';
  runs: number;
  maxLiveCalls: number;
  list: boolean;
  allowSameFamily: boolean;
}

function parseArgs(argv: string[]): SimCliArgs {
  const args: SimCliArgs = {
    learnerModel: null,
    mentorModel: null,
    provider: null,
    topics: 'all',
    runs: 1,
    maxLiveCalls: DEFAULT_MAX_LIVE_CALLS,
    list: false,
    allowSameFamily: false,
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
      case '--mentor-model':
        args.mentorModel = next();
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
        // letting `|| DEFAULT` silently promote it to the default 30.
        const parsed = Number.parseInt(next(), 10);
        args.maxLiveCalls = Number.isFinite(parsed)
          ? parsed
          : DEFAULT_MAX_LIVE_CALLS;
        break;
      }
      case '--list':
        args.list = true;
        break;
      case '--allow-same-family':
        args.allowSameFamily = true;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // --list must work with NO bootstrap (no Doppler / provider keys needed).
  if (args.list) {
    printGrid();
    return;
  }

  if (!args.learnerModel) {
    throw new Error(
      '--learner-model <slug> is required for a run (omit it only with --list).',
    );
  }

  // Two-model guard for the EXPLICIT candidate case runs BEFORE bootstrap, so an
  // obviously-invalid config fails without touching Doppler. The production-
  // routing (null) case resolves the concrete slug inside runSimulatedRound,
  // after providers are registered.
  if (args.mentorModel) {
    assertTwoModelGuard(
      args.learnerModel,
      args.mentorModel,
      args.allowSameFamily,
    );
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

  // The budget is a HARD cap — never force a round that would overrun it (the
  // old Math.max(1, …) could run ~CALLS_PER_ROUND calls under a smaller budget).
  const maxRounds = Math.floor(args.maxLiveCalls / CALLS_PER_ROUND);
  if (maxRounds < 1) {
    throw new Error(
      `--max-live-calls=${args.maxLiveCalls} is below the ~${CALLS_PER_ROUND} calls a single round needs; raise it to run at least one round.`,
    );
  }
  const grid = fullGrid.slice(0, maxRounds);
  if (grid.length < fullGrid.length) {
    console.warn(
      `[budget] requested ${fullGrid.length} rounds but --max-live-calls=${args.maxLiveCalls} ` +
        `(~${CALLS_PER_ROUND} calls/round) caps at ${grid.length}. ${fullGrid.length - grid.length} round(s) dropped — raise --max-live-calls to run them.`,
    );
  }

  // Provider pin + mentor-candidate override BEFORE bootstrap.
  setOpenRouterProviderPin(args.provider ? [args.provider] : null);
  setOpenRouterModelOverride(args.mentorModel ?? null);
  bootstrapLlmProviders();

  console.log(
    `Running ${grid.length} simulated round(s): learner=${args.learnerModel}, mentor=${args.mentorModel ?? 'production-routing'}\n`,
  );

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
        learnerModel: args.learnerModel,
        mentorModel: args.mentorModel,
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

  const metrics = aggregate(results);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const corpusDir = path.resolve(__dirname, 'corpus', ts);
  await writeCorpus(corpusDir, results, metrics);

  console.log(
    '\n— Calibration metrics (SYNTHETIC / PROVISIONAL, RR-2 not discharged) —',
  );
  console.log(`  rounds:              ${metrics.totalRounds}`);
  console.log(`  outcome rates:       ${JSON.stringify(metrics.outcomeRates)}`);
  console.log(
    `  mastery-verified:    ${metrics.masteryVerifiedRate.toFixed(3)}`,
  );
  console.log(`  over-credit rate:    ${metrics.overCreditRate.toFixed(3)}`);
  console.log(`  under-credit rate:   ${metrics.underCreditRate.toFixed(3)}`);
  console.log(
    `  signal-emission:     ${JSON.stringify(metrics.signalEmissionRateByMentor)}`,
  );
  console.log(`\nCorpus written to: ${corpusDir}`);
}

main().catch((err: unknown) => {
  console.error(
    `\n[eval:llm:sim] ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
