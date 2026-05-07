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
//   doppler run -- pnpm eval:llm -- --live --check-baseline
//     Compare envelope signal metrics against baseline.json; exit 1 on drift.
//   doppler run -- pnpm eval:llm -- --live --update-baseline
//     Overwrite baseline.json with the current run's metrics (commit after).
// ---------------------------------------------------------------------------

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { capitalsFlow } from './flows/quiz-capitals';
import { vocabularyFlow } from './flows/quiz-vocabulary';
import { guessWhoFlow } from './flows/quiz-guess-who';
import { dictationGenerateFlow } from './flows/dictation-generate';
import { prepareHomeworkFlow } from './flows/dictation-prepare-homework';
import { dictationReviewFlow } from './flows/dictation-review';
import { sessionAnalysisFlow } from './flows/session-analysis';
import { sessionRecapFlow } from './flows/session-recap';
import { sessionSummaryFlow } from './flows/session-summary';
import { filingPreSessionFlow } from './flows/filing-pre-session';
import { exchangesFlow } from './flows/exchanges';
import { interviewFlow } from './flows/interview';
import { interviewSignalsFlow } from './flows/interview-signals';
import { interviewOrphanFlow } from './flows/interview-orphan';
import { topicIntentMatcherFlow } from './flows/topic-intent-matcher';
import { probesFlow } from './flows/probes';
import {
  listFlows,
  parseCliArgs,
  runHarness,
  type RunSummary,
} from './runner/runner';
import type { FlowDefinition } from './runner/types';
import {
  buildBaseline,
  compareAgainstBaseline,
  formatDriftReport,
  parseBaseline,
  type Baseline,
} from './runner/metrics';
import { bootstrapLlmProviders } from './runner/llm-bootstrap';

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

const FLOWS: FlowDefinition[] = [
  capitalsFlow as FlowDefinition,
  vocabularyFlow as FlowDefinition,
  guessWhoFlow as FlowDefinition,
  dictationGenerateFlow as FlowDefinition,
  prepareHomeworkFlow as FlowDefinition,
  dictationReviewFlow as FlowDefinition,
  sessionAnalysisFlow as FlowDefinition,
  sessionRecapFlow as FlowDefinition,
  sessionSummaryFlow as FlowDefinition,
  filingPreSessionFlow as FlowDefinition,
  exchangesFlow as FlowDefinition,
  interviewFlow as FlowDefinition,
  interviewSignalsFlow as FlowDefinition,
  interviewOrphanFlow as FlowDefinition,
  topicIntentMatcherFlow as FlowDefinition,
  probesFlow as FlowDefinition,
];

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, listOnly } = parseCliArgs(argv);

  if (listOnly) {
    listFlows(FLOWS);
    return;
  }

  // Bootstrap LLM providers early so any missing-key errors surface before
  // the run matrix starts. Tier-1 runs skip this — no LLM calls are made.
  if (options.live) {
    bootstrapLlmProviders();
  }

  console.log(
    `\nEval-LLM harness — tier ${
      options.live ? '2 (live LLM calls)' : '1 (prompt snapshots only)'
    }\n`
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
  if (summary.skipped.length > 0) {
    console.log(`Skipped:            ${summary.skipped.length}`);
    for (const s of summary.skipped) {
      console.log(`  - ${s.flowId} × ${s.profileId}: ${s.reason}`);
    }
  }
  console.log('─────────────────────────────────────────');

  // Baseline regression guard — only meaningful after a live run. Tier-1
  // runs emit an empty envelopeMetrics map and would trip the baseline for
  // the wrong reason, so we gate explicitly on --live here.
  if (options.updateBaseline || options.checkBaseline) {
    if (!options.live) {
      console.error(
        '--check-baseline / --update-baseline require --live (envelope metrics are only collected from live LLM responses)'
      );
      process.exit(2);
    }

    if (options.updateBaseline) {
      const baseline = buildBaseline(summary.envelopeMetrics, {
        ref: process.env.GIT_COMMIT,
      });
      await writeBaseline(baseline);
      console.log(`Baseline updated → ${BASELINE_PATH}`);
      return;
    }

    const baseline = await readBaseline();
    if (!baseline) {
      console.error(
        `No baseline found at ${BASELINE_PATH} — run with --update-baseline first to seed it.`
      );
      process.exit(2);
    }

    const tolerance = options.baselineTolerancePp ?? DEFAULT_TOLERANCE_PP;
    const drifts = compareAgainstBaseline(
      summary.envelopeMetrics,
      baseline,
      tolerance
    );
    if (drifts.length === 0) {
      console.log(
        `Baseline check passed (tolerance: ${(tolerance * 100).toFixed(1)}pp).`
      );
      return;
    }
    console.error(formatDriftReport(drifts));
    console.error('');
    console.error(
      `Baseline tolerance: ${(tolerance * 100).toFixed(
        1
      )}pp. Inspect the drift above, then run with --update-baseline if the shift is intentional.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Eval harness failed:', err);
  process.exit(1);
});
