#!/usr/bin/env -S tsx
// ---------------------------------------------------------------------------
// Eval-LLM — Entry point
//
// Run with:
//   pnpm eval:llm                              # tier 1 (prompts only, free)
//   pnpm eval:llm -- --list                    # list flows and profiles
//   pnpm eval:llm -- --flow quiz-capitals       # one flow
//   pnpm eval:llm -- --profile 09yo-dinosaurs   # one profile
//   doppler run -- pnpm eval:llm -- --live      # tier 2 (real LLM calls)
// ---------------------------------------------------------------------------

import { capitalsFlow } from './flows/quiz-capitals';
import { vocabularyFlow } from './flows/quiz-vocabulary';
import { guessWhoFlow } from './flows/quiz-guess-who';
import { dictationGenerateFlow } from './flows/dictation-generate';
import { prepareHomeworkFlow } from './flows/dictation-prepare-homework';
import { dictationReviewFlow } from './flows/dictation-review';
import { sessionAnalysisFlow } from './flows/session-analysis';
import { filingPreSessionFlow } from './flows/filing-pre-session';
import {
  listFlows,
  parseCliArgs,
  runHarness,
  type RunSummary,
} from './runner/runner';
import type { FlowDefinition } from './runner/types';

const FLOWS: FlowDefinition[] = [
  capitalsFlow as FlowDefinition,
  vocabularyFlow as FlowDefinition,
  guessWhoFlow as FlowDefinition,
  dictationGenerateFlow as FlowDefinition,
  prepareHomeworkFlow as FlowDefinition,
  dictationReviewFlow as FlowDefinition,
  sessionAnalysisFlow as FlowDefinition,
  filingPreSessionFlow as FlowDefinition,
];

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, listOnly } = parseCliArgs(argv);

  if (listOnly) {
    listFlows(FLOWS);
    return;
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
}

main().catch((err) => {
  console.error('Eval harness failed:', err);
  process.exit(1);
});
