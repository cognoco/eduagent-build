#!/usr/bin/env -S tsx
// ---------------------------------------------------------------------------
// Eval-LLM — Entry point
//
// Run with:
//   pnpm eval:llm                              # tier 1 (prompts only, free)
//   pnpm eval:llm -- --list                    # list flows and profiles
//   pnpm eval:llm -- --flow quiz-capitals       # one flow
//   pnpm eval:llm -- --profile 12yo-dinosaurs   # one profile
//   pnpm eval:llm -- --flow exchanges --scenarios core   # 3 highest-signal scenarios
//   pnpm eval:llm -- --flow exchanges --scenarios S1,S3  # specific scenarios
//   pnpm eval:llm -- --max-live-calls 5         # optional live-call cap (default 20)
//   doppler run -- pnpm eval:llm -- --live      # tier 2 (real LLM calls)
//
//   doppler run -- pnpm eval:llm -- --flow safety-probes --live \
//     --openrouter-model mistralai/mistral-small-2603
//     Candidate-model gate (model-selection memo §6): route all live calls to
//     the named model via OpenRouter instead of production routing. Restore
//     snapshots afterwards: git checkout -- apps/api/eval-llm/snapshots
//
//   doppler run -- pnpm eval:llm -- --live --check-baseline --only-envelope-flows
//     Compare envelope signal metrics against baseline.json; exit 1 on drift.
//     --only-envelope-flows scopes the run to the emitsEnvelope flow set (the
//     weekly drift gate in eval-live.yml) so it covers exactly the baselined
//     flows without a hardcoded, rot-prone flow list (WI-560).
//   doppler run -- pnpm eval:llm -- --live --update-baseline
//     Overwrite baseline.json with the current run's metrics (commit after).
//   pnpm eval:llm -- --validate-baseline
//     Deterministic, key-free structural check of baseline.json — fails if a
//     placebo `{ "flows": {} }` baseline would make signal drift invisible.
//     Safe to run in CI on every PR (no LLM calls, no Doppler).
// ---------------------------------------------------------------------------

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FLOWS } from './flow-registry';
// [WI-1755] Launch-guard eval coverage for the language-learning-intent
// detector used at subject creation. See flow file for context.
// Flow registry is shared with deterministic workflow-contract tests.
// [H3 — 2026-06-05 safety audit] Adversarial safety regression suite:
// jailbreaks, prompt extraction, crisis disclosures, harmful-content asks.
// [Memo §6.2] Conversation-language quality for cs/nb/pl — LLM judge on
// production routing scores candidate-model prose. See flow file.
// [BUG-125] Snapshot coverage for the two prompt builders the pre-commit
// hook was previously blind to. See flow files for context.
// [WI-1547] Snapshot coverage for the graded-input generation prompt.
// Pedagogy-coverage flows: the harness proved epistemic safety (source
// grounding, no-cheating, no-stereotyping) but only *observed* whether
// teaching produces understanding. These two close that gap — see flow files.
// [T1–T4 — 2026-06-27 plan] Teaching-session multi-turn flow: stuck-unless-taught
// learner, 8-turn loop, unaided transfer probe, temp-0 judge (PRE-TEEN/TEEN-BAND).
// [T10 — 2026-06-26 plan] Model-selection gate for the dedicated grader that
// emits challenge_round_evaluation when the tutor (gpt-oss) drops it. Two-axis
// fixture battery: format (non-empty schema-valid verdict) + judgment (solid /
// misconception / missing / false-mastery guard). See flow file for bake-off
// commands (--flow challenge-grader --live --openrouter-model <slug>).
// [plan 2026-06-27] Review-continuity opener faithfulness — deterministic
// builder snapshots + two-independent-model judge (model A pinned mentor,
// model B independent OpenRouter judge). See flow file.
// [WI-1877 rework] Suitability-judge injection resistance — behavioral,
// single-model live run proving a fenced learner-message directive cannot
// flip an unsuitable reply's verdict to a clean "ok". See flow file.
// [WI-2625] Mentor-notice re-check judge — behavioral live run proving the
// independent server-side judge lands on the correct verdict per accepted
// pair, resolves an off-topic message to "continue", and resists an
// injected directive trying to force locked_in. See flow file.
import {
  listFlows,
  parseCliArgs,
  runHarness,
  type RunSummary,
  type RunOptions,
} from './runner/runner';
import {
  buildBaseline,
  parseBaseline,
  validateBaselineStructure,
  type Baseline,
} from './runner/metrics';
import { PROFILES } from './fixtures/profiles';
import {
  deriveEnvelopeBudgetFromMatrix,
  deriveEnvelopeProviderDemandFromMatrix,
  resolveEnvelopeLiveCallCap,
} from './runner/budget';
import { evaluateGates } from './runner/gates';
import {
  bootstrapLlmProviders,
  setOpenRouterProviderPin,
} from './runner/llm-bootstrap';
import { setOpenRouterModelOverride } from './runner/llm-client';
import {
  removeZeroDriftReceipt,
  writeZeroDriftReceipt,
} from './runner/zero-drift-receipt';
import { isPromptTouchingPath } from './runner/prompt-paths';

const BASELINE_PATH = path.resolve(__dirname, 'baseline.json');
const DEFAULT_TOLERANCE_PP = 0.05; // 5pp — one sample of noise at N≈20

async function readBaseline(): Promise<Baseline | null> {
  try {
    const raw = await fs.readFile(BASELINE_PATH, 'utf8');
    return parseBaseline(raw);
  } catch {
    return null;
  }
}

async function writeBaseline(baseline: Baseline): Promise<void> {
  const body = JSON.stringify(baseline, null, 2) + '\n';
  await fs.writeFile(BASELINE_PATH, body, 'utf8');
}

function shouldWriteZeroDriftReceipt(options: RunOptions): boolean {
  return (
    !options.live &&
    !options.flowFilter &&
    !options.profileFilter &&
    !options.scenarioFilter &&
    !options.checkBaseline &&
    !options.updateBaseline &&
    !options.validateBaseline
  );
}

function clearZeroDriftReceipt(): void {
  try {
    removeZeroDriftReceipt(process.cwd());
  } catch {
    // The receipt is a local pre-commit aid. Failure to clear it is harmless
    // because validation still fails closed against HEAD, prompt hashes, and
    // snapshot hashes.
  }
}

function updateZeroDriftReceipt(options: RunOptions): void {
  if (!shouldWriteZeroDriftReceipt(options)) {
    clearZeroDriftReceipt();
    return;
  }

  const result = writeZeroDriftReceipt(process.cwd(), {
    command: 'pnpm eval:llm',
    promptPathPredicate: isPromptTouchingPath,
  });
  if (result.written) {
    console.log(`Eval-LLM zero-drift receipt written: ${result.path}`);
  } else {
    console.log(
      'Eval-LLM snapshots changed; stage snapshot files instead of using a zero-drift receipt.',
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, listOnly } = parseCliArgs(argv);

  if (listOnly) {
    clearZeroDriftReceipt();
    listFlows(FLOWS);
    const baseline = await readBaseline();
    const budget = deriveEnvelopeBudgetFromMatrix(
      FLOWS,
      PROFILES,
      baseline?.flows,
    );
    const providerDemand = deriveEnvelopeProviderDemandFromMatrix(
      FLOWS,
      PROFILES,
    );
    console.log(
      `Envelope matrix demand: required=${budget.requiredSamples} ` +
        `baseline=${budget.baselineSamples} configured=${budget.configuredBudget} ` +
        `headroom=${budget.headroomSamples} (${budget.headroomRate * 100}%)`,
    );
    console.log(
      `Envelope provider demand: outer=${providerDemand.outerRunLiveCalls} ` +
        `internal=${providerDemand.internalProviderCalls} ` +
        `total=${providerDemand.providerCalls}`,
    );
    for (const [flowId, demand] of Object.entries(budget.flows)) {
      console.log(
        `  [${flowId}] required=${demand.requiredSamples} baseline=${demand.baselineSamples}`,
      );
    }
    return;
  }

  // Structural baseline validation — fully deterministic, makes NO LLM calls
  // and needs no API keys. Runs before the harness matrix because it only
  // inspects the checked-in baseline.json. CI uses this to catch a placebo
  // `{ "flows": {} }` baseline that would otherwise make envelope-signal
  // drift invisible. The aggregate signal-distribution comparison itself
  // still requires the key-gated, non-deterministic `--check-baseline --live`.
  if (options.validateBaseline) {
    clearZeroDriftReceipt();
    if (options.live || options.checkBaseline || options.updateBaseline) {
      console.error(
        '--validate-baseline is a standalone deterministic check; do not combine it with --live / --check-baseline / --update-baseline.',
      );
      process.exit(2);
    }
    const requiredFlows = FLOWS.filter((f) => f.emitsEnvelope).map((f) => f.id);
    const baseline = await readBaseline();
    const issues = validateBaselineStructure(baseline, requiredFlows);
    if (issues.length === 0) {
      console.log(
        `Baseline structure OK — ${requiredFlows.length} envelope-emitting flow(s) present with samples (${BASELINE_PATH}).`,
      );
      return;
    }
    console.error(`Baseline validation failed (${BASELINE_PATH}):`);
    for (const issue of issues) {
      console.error(`  [${issue.flowId}] ${issue.message}`);
    }
    console.error('');
    console.error(
      'Seed a real baseline once with:\n  doppler run -- pnpm eval:llm -- --live --update-baseline\nthen commit the regenerated baseline.json. See apps/api/eval-llm/README.md.',
    );
    process.exit(1);
  }

  // Usage gate, before the (potentially long) harness run: --check-baseline /
  // --update-baseline are only meaningful after a live run. Tier-1 runs emit
  // an empty envelopeMetrics map and would trip the baseline for the wrong
  // reason — and a misspelled invocation should not burn a full matrix run
  // before erroring (CodeRabbit on PR #820).
  if ((options.updateBaseline || options.checkBaseline) && !options.live) {
    clearZeroDriftReceipt();
    console.error(
      '--check-baseline / --update-baseline require --live (envelope metrics are only collected from live LLM responses)',
    );
    process.exit(2);
  }

  // Candidate-model gate (--openrouter-model): reroutes every live call to
  // the named model via the eval-only OpenRouter adapter. Guard rails:
  // pointless without --live, and a candidate's envelope metrics must never
  // be written into the production-model baseline.
  if (options.openrouterModel) {
    if (!options.live) {
      clearZeroDriftReceipt();
      console.error(
        '--openrouter-model requires --live (it only affects live LLM calls).',
      );
      process.exit(2);
    }
    if (options.updateBaseline) {
      clearZeroDriftReceipt();
      console.error(
        '--openrouter-model cannot be combined with --update-baseline: the baseline tracks the PRODUCTION routing, not a candidate model.',
      );
      process.exit(2);
    }
  } else if (options.openrouterReasoningEffort || options.openrouterProvider) {
    clearZeroDriftReceipt();
    console.error(
      '--openrouter-reasoning-effort / --openrouter-provider require --openrouter-model (they only shape candidate-model calls).',
    );
    process.exit(2);
  }

  if (options.live && options.onlyEnvelopeFlows) {
    const baseline = await readBaseline();
    const budget = deriveEnvelopeBudgetFromMatrix(
      FLOWS.filter(
        (flow) => !options.flowFilter || options.flowFilter.has(flow.id),
      ),
      PROFILES.filter(
        (profile) =>
          !options.profileFilter || options.profileFilter.has(profile.id),
      ),
      baseline?.flows,
      { scenarioFilter: options.scenarioFilter },
    );
    options.maxLiveCalls = resolveEnvelopeLiveCallCap(options, budget);
    if (
      options.maxLiveCalls !== undefined &&
      options.maxLiveCalls < budget.configuredBudget
    ) {
      clearZeroDriftReceipt();
      console.error(
        `Envelope matrix requires ${budget.requiredSamples} samples plus ` +
          `${budget.headroomSamples} headroom calls (configured floor=${budget.configuredBudget}; ` +
          `baseline=${budget.baselineSamples}); supplied ` +
          `--max-live-calls=${options.maxLiveCalls} is below the configured floor.`,
      );
      process.exit(2);
    }
  }

  // Bootstrap LLM providers early so any missing-key errors surface before
  // the run matrix starts. Tier-1 runs skip this — no LLM calls are made.
  if (options.live) {
    if (options.openrouterProvider) {
      // Must precede bootstrap so the adapter is created with the pin.
      setOpenRouterProviderPin([options.openrouterProvider]);
    }
    bootstrapLlmProviders();
    if (options.openrouterModel) {
      setOpenRouterModelOverride(options.openrouterModel, {
        ...(options.openrouterReasoningEffort
          ? { reasoningEffort: options.openrouterReasoningEffort }
          : {}),
      });
    }
  }

  console.log(
    `\nEval-LLM harness — tier ${
      options.live ? '2 (live LLM calls)' : '1 (prompt snapshots only)'
    }${
      options.openrouterModel
        ? `\nCANDIDATE-MODEL RUN — all live calls routed to "${options.openrouterModel}" via OpenRouter (not production routing).${
            options.openrouterReasoningEffort
              ? ` reasoning_effort=${options.openrouterReasoningEffort}.`
              : ''
          }${
            options.openrouterProvider
              ? ` Host pinned to "${options.openrouterProvider}" (fallbacks off).`
              : ''
          } Snapshots will reflect the candidate; restore with: git checkout -- apps/api/eval-llm/snapshots`
        : ''
    }\n`,
  );

  const summary: RunSummary = await runHarness(FLOWS, options);

  if (options.live) {
    const baselineForReport = await readBaseline();
    const matrixFlows = FLOWS.filter(
      (flow) =>
        (!options.flowFilter || options.flowFilter.has(flow.id)) &&
        (!options.onlyEnvelopeFlows || flow.emitsEnvelope === true),
    );
    const matrixProfiles = PROFILES.filter(
      (profile) =>
        !options.profileFilter || options.profileFilter.has(profile.id),
    );
    const envelopeBudget = deriveEnvelopeBudgetFromMatrix(
      matrixFlows,
      matrixProfiles,
      baselineForReport?.flows,
      { scenarioFilter: options.scenarioFilter },
    );
    console.log(
      `Envelope budget: configured=${envelopeBudget.configuredBudget} ` +
        `required=${envelopeBudget.requiredSamples} ` +
        `baseline=${envelopeBudget.baselineSamples} ` +
        `headroom=${envelopeBudget.headroomSamples} ` +
        `(${envelopeBudget.headroomRate * 100}%); no truncation contract`,
    );
    for (const [flowId, demand] of Object.entries(envelopeBudget.flows)) {
      const coverage = summary.envelopeCoverage[flowId];
      console.log(
        `  [${flowId}] required=${demand.requiredSamples} ` +
          `attempted=${coverage?.attempted ?? 0} ` +
          `completed=${coverage?.completed ?? 0} ` +
          `budget-skipped=${coverage?.budgetSkipped ?? 0}`,
      );
    }
  }

  console.log('');
  console.log('─────────────────────────────────────────');
  console.log(`Flows run:          ${summary.flowsRun}`);
  console.log(`Snapshots written:  ${summary.snapshotsWritten}`);
  if (options.live) {
    console.log(`Live calls OK:      ${summary.liveCallsOk}`);
    console.log(`Live calls failed:  ${summary.liveCallsFailed}`);
  }
  if (
    options.live ||
    summary.qualityWarnings > 0 ||
    summary.qualityFailures > 0
  ) {
    console.log(`Quality warnings:   ${summary.qualityWarnings}`);
    console.log(`Quality failures:   ${summary.qualityFailures}`);
  }
  if (summary.skipped.length > 0) {
    console.log(`Skipped:            ${summary.skipped.length}`);
    for (const s of summary.skipped) {
      console.log(`  - ${s.flowId} × ${s.profileId}: ${s.reason}`);
    }
  }
  console.log('─────────────────────────────────────────');

  // Baseline seed (--update-baseline) runs BEFORE the quality-gate exit
  // [WI-556]: the baseline tracks envelope-signal *distribution*, which
  // legitimately includes failed samples (envelopeOk < 1.0 is itself a
  // tracked rate). Scenario-level quality failures are triaged separately —
  // and NOT silently bypassed: they are printed below and the run still
  // exits 1, so an operator must look at them before committing the seeded
  // baseline. See README § Signal-distribution baseline.
  if (options.updateBaseline) {
    const baseline = buildBaseline(summary.envelopeMetrics, {
      ref: process.env.GIT_COMMIT,
    });
    // Seed-path guard: refuse to write a baseline that would itself fail
    // --validate-baseline. A budget-starved run (envelope flows skipped)
    // produces an empty/partial flows map — exactly the placebo state the
    // structural check exists to catch. Same rule set, same source of truth.
    const requiredFlows = FLOWS.filter((f) => f.emitsEnvelope).map((f) => f.id);
    const issues = validateBaselineStructure(baseline, requiredFlows);
    if (issues.length > 0) {
      console.error(
        `Refusing to write baseline — this run did not collect envelope metrics for every envelope-emitting flow:`,
      );
      for (const issue of issues) {
        console.error(`  [${issue.flowId}] ${issue.message}`);
      }
      console.error('');
      console.error(
        `Include all envelope-emitting flows and raise the budget, e.g.:\n` +
          `  doppler run -- pnpm eval:llm -- --live ${requiredFlows
            .map((id) => `--flow ${id}`)
            .join(' ')} --max-live-calls 250 --update-baseline`,
      );
      process.exit(1);
    }
    await writeBaseline(baseline);
    console.log(`Baseline updated → ${BASELINE_PATH}`);
  }

  // [WI-1148] Single post-run gate. The --check-baseline drift comparison must
  // run even when scenario-quality failures occurred — a quality failure (which
  // is routine across ~262 non-deterministic live calls) must never MASK drift,
  // which was the bug: the old quality `process.exit(1)` sat BEFORE this block,
  // so the weekly eval-live.yml drift gate was unreachable. evaluateGates owns
  // the ordering and the combined exit; here we only clear the receipt, print,
  // and exit. Quality failures still fail the run — they just no longer hide
  // drift, and both reasons are named in the failure message.
  if (
    options.updateBaseline ||
    options.checkBaseline ||
    summary.qualityFailures > 0
  ) {
    clearZeroDriftReceipt();
  }

  const gate = await evaluateGates(summary, options, {
    readBaseline,
    baselinePath: BASELINE_PATH,
    tolerancePp: options.baselineTolerancePp ?? DEFAULT_TOLERANCE_PP,
  });
  for (const m of gate.messages) {
    if (m.level === 'error') console.error(m.text);
    else console.log(m.text);
  }
  if (gate.exitCode !== 0) {
    process.exit(gate.exitCode);
  }
  if (options.updateBaseline || options.checkBaseline) {
    // Both gate modes have fully reported; no zero-drift receipt is written for
    // them (receipts are reserved for clean tier-1 runs).
    return;
  }

  updateZeroDriftReceipt(options);
}

main().catch((err) => {
  console.error('Eval harness failed:', err);
  process.exit(1);
});
