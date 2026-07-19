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
//   pnpm eval:llm -- --max-live-calls 5         # cap live LLM calls (default 20)
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
import { capitalsFlow } from './flows/quiz-capitals';
import { vocabularyFlow } from './flows/quiz-vocabulary';
import { guessWhoFlow } from './flows/quiz-guess-who';
import { dictationGenerateFlow } from './flows/dictation-generate';
import { dictationGenerateSanitizationFlow } from './flows/dictation-generate-sanitization';
import { prepareHomeworkFlow } from './flows/dictation-prepare-homework';
import { dictationReviewFlow } from './flows/dictation-review';
import { sessionAnalysisFlow } from './flows/session-analysis';
import { sessionRecapFlow } from './flows/session-recap';
import { sessionSummaryFlow } from './flows/session-summary';
import { filingPreSessionFlow } from './flows/filing-pre-session';
import { exchangesFlow } from './flows/exchanges';
import { homeworkNoticeFlow } from './flows/homework-notice';
import { topicProbeSignalsFlow } from './flows/topic-probe-signals';
import { topicIntentMatcherFlow } from './flows/topic-intent-matcher';
import { subjectClassifyFlow } from './flows/subject-classify';
// [WI-1755] Launch-guard eval coverage for the language-learning-intent
// detector used at subject creation. See flow file for context.
import { languageDetectFlow } from './flows/language-detect';
import { probesFlow } from './flows/probes';
// [H3 — 2026-06-05 safety audit] Adversarial safety regression suite:
// jailbreaks, prompt extraction, crisis disclosures, harmful-content asks.
import { safetyProbesFlow } from './flows/safety-probes';
// [Memo §6.2] Conversation-language quality for cs/nb/pl — LLM judge on
// production routing scores candidate-model prose. See flow file.
import { languageQualityFlow } from './flows/language-quality';
import { bookSuggestionRegenerationFlow } from './flows/book-suggestion-regeneration';
import { progressSummaryFlow } from './flows/progress-summary';
import { assessmentEvaluationFlow } from './flows/assessment-evaluation';
import { recallGraderFlow } from './flows/recall-grader';
import { anthropicResponseFormatFlow } from './flows/anthropic-response-format';
// [BUG-125] Snapshot coverage for the two prompt builders the pre-commit
// hook was previously blind to. See flow files for context.
import { languagePromptsFlow } from './flows/language-prompts';
// [WI-1547] Snapshot coverage for the graded-input generation prompt.
import { gradedInputPromptsFlow } from './flows/graded-input-prompts';
import { adaptiveTeachingFlow } from './flows/adaptive-teaching';
import { nowParkReturnFlow } from './flows/now-park-return';
import { parkAndReturnRankingFlow } from './flows/park-and-return-ranking';
import { parkAndReturnReweaveFlow } from './flows/park-and-return-reweave';
import { appHelpV2Flow } from './flows/app-help-v2';
// Pedagogy-coverage flows: the harness proved epistemic safety (source
// grounding, no-cheating, no-stereotyping) but only *observed* whether
// teaching produces understanding. These two close that gap — see flow files.
import { challengeRoundMasteryFlow } from './flows/challenge-round-mastery';
import { misconceptionRepairFlow } from './flows/misconception-repair';
// [T1–T4 — 2026-06-27 plan] Teaching-session multi-turn flow: stuck-unless-taught
// learner, 8-turn loop, unaided transfer probe, temp-0 judge (PRE-TEEN/TEEN-BAND).
import { teachingSessionFlow } from './flows/teaching-session';
// [T10 — 2026-06-26 plan] Model-selection gate for the dedicated grader that
// emits challenge_round_evaluation when the tutor (gpt-oss) drops it. Two-axis
// fixture battery: format (non-empty schema-valid verdict) + judgment (solid /
// misconception / missing / false-mastery guard). See flow file for bake-off
// commands (--flow challenge-grader --live --openrouter-model <slug>).
import { challengeGraderFlow } from './flows/challenge-grader';
// [plan 2026-06-27] Review-continuity opener faithfulness — deterministic
// builder snapshots + two-independent-model judge (model A pinned mentor,
// model B independent OpenRouter judge). See flow file.
import { reviewContinuityOpenerFlow } from './flows/review-continuity-opener';
// [WI-1877 rework] Suitability-judge injection resistance — behavioral,
// single-model live run proving a fenced learner-message directive cannot
// flip an unsuitable reply's verdict to a clean "ok". See flow file.
import { judgeSuitabilityFlow } from './flows/judge-suitability';
import {
  listFlows,
  parseCliArgs,
  runHarness,
  type RunSummary,
  type RunOptions,
} from './runner/runner';
import type { FlowDefinition } from './runner/types';
import {
  buildBaseline,
  parseBaseline,
  validateBaselineStructure,
  type Baseline,
} from './runner/metrics';
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

const FLOWS: FlowDefinition[] = [
  capitalsFlow as FlowDefinition,
  vocabularyFlow as FlowDefinition,
  guessWhoFlow as FlowDefinition,
  dictationGenerateFlow as FlowDefinition,
  dictationGenerateSanitizationFlow as FlowDefinition,
  prepareHomeworkFlow as FlowDefinition,
  dictationReviewFlow as FlowDefinition,
  sessionAnalysisFlow as FlowDefinition,
  sessionRecapFlow as FlowDefinition,
  sessionSummaryFlow as FlowDefinition,
  filingPreSessionFlow as FlowDefinition,
  exchangesFlow as FlowDefinition,
  homeworkNoticeFlow as FlowDefinition,
  topicProbeSignalsFlow as FlowDefinition,
  topicIntentMatcherFlow as FlowDefinition,
  subjectClassifyFlow as FlowDefinition,
  languageDetectFlow as FlowDefinition,
  probesFlow as FlowDefinition,
  safetyProbesFlow as FlowDefinition,
  languageQualityFlow as FlowDefinition,
  bookSuggestionRegenerationFlow as FlowDefinition,
  progressSummaryFlow as FlowDefinition,
  assessmentEvaluationFlow as FlowDefinition,
  anthropicResponseFormatFlow as FlowDefinition,
  languagePromptsFlow as FlowDefinition,
  gradedInputPromptsFlow as FlowDefinition,
  adaptiveTeachingFlow as FlowDefinition,
  nowParkReturnFlow as FlowDefinition,
  parkAndReturnRankingFlow as FlowDefinition,
  parkAndReturnReweaveFlow as FlowDefinition,
  appHelpV2Flow as FlowDefinition,
  challengeRoundMasteryFlow as FlowDefinition,
  misconceptionRepairFlow as FlowDefinition,
  teachingSessionFlow as FlowDefinition,
  challengeGraderFlow as FlowDefinition,
  reviewContinuityOpenerFlow as FlowDefinition,
  recallGraderFlow as FlowDefinition,
  judgeSuitabilityFlow as FlowDefinition,
];

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, listOnly } = parseCliArgs(argv);

  if (listOnly) {
    clearZeroDriftReceipt();
    listFlows(FLOWS);
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
