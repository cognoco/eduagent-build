import type { FlowDefinition, Scenario } from './types';
import { PROFILES, type EvalProfile } from '../fixtures/profiles';
import { writeSnapshot } from './snapshot';
import {
  aggregateFlowSamples,
  extractSampleMetrics,
  type FlowAggregate,
  type SampleMetrics,
} from './metrics';

// ---------------------------------------------------------------------------
// Runner — orchestrates the flow × profile matrix.
//
// CLI flags:
//   --live                 hit the real LLM providers (opt-in, costs credits)
//   --flow <id>            only run this flow (repeatable)
//   --profile <id>         only run this profile (repeatable)
//   --scenarios core|full|<csv>  restrict which scenarios run (exchanges flow)
//   --max-live-calls N     hard cap on live LLM calls (default 20)
//   --list                 list registered flows and fixtures and exit
// ---------------------------------------------------------------------------

export interface RunOptions {
  live: boolean;
  flowFilter?: Set<string>;
  profileFilter?: Set<string>;
  /**
   * Restrict which scenarios run for flows that use `enumerateScenarios`.
   * Set of scenarioId strings. If empty/undefined, all scenarios run.
   */
  scenarioFilter?: Set<string>;
  /**
   * Hard cap on total live LLM calls across all flows × profiles × scenarios.
   * When hit, the runner aborts the remaining items with a "budget exceeded"
   * skip reason so tier-2 runs don't surprise with large bills. Default = 20.
   */
  maxLiveCalls?: number;
  /**
   * Baseline regression guard. When true, after the run the CLI compares
   * `summary.envelopeMetrics` against the checked-in baseline file and
   * exits non-zero if any metric drifts more than `baselineTolerancePp`.
   */
  checkBaseline?: boolean;
  /**
   * Overwrite the baseline file with the current run's envelope metrics.
   * Mutually exclusive with checkBaseline — callers accept the new shape
   * intentionally before committing the updated baseline.
   */
  updateBaseline?: boolean;
  /**
   * Allowed absolute percentage-point drift before the baseline guard
   * flags a shift. 0.05 = 5pp. Default 0.05 matches the ~30-sample matrix.
   */
  baselineTolerancePp?: number;
}

export interface RunSummary {
  flowsRun: number;
  profilesRun: number;
  snapshotsWritten: number;
  liveCallsOk: number;
  liveCallsFailed: number;
  skipped: Array<{ flowId: string; profileId: string; reason: string }>;
  /**
   * Per-envelope-flow signal aggregates, populated only for --live runs on
   * flows with `emitsEnvelope: true`. Drives the baseline regression guard.
   */
  envelopeMetrics: Record<string, FlowAggregate>;
}

export function parseCliArgs(argv: string[]): {
  options: RunOptions;
  listOnly: boolean;
} {
  const options: RunOptions = { live: false };
  let listOnly = false;
  const flowFilter = new Set<string>();
  const profileFilter = new Set<string>();
  const scenarioFilter = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--live') {
      options.live = true;
    } else if (arg === '--list') {
      listOnly = true;
    } else if (arg === '--flow') {
      const next = argv[++i];
      if (next) flowFilter.add(next);
    } else if (arg === '--profile') {
      const next = argv[++i];
      if (next) profileFilter.add(next);
    } else if (arg === '--scenarios') {
      // `--scenarios core|full|S1,S3` — "core" and "full" are sugar.
      // `core` expands to S1,S3,S5 (highest-signal default).
      const next = argv[++i];
      if (next) {
        if (next === 'full') {
          // no filter — all scenarios run
        } else if (next === 'core') {
          scenarioFilter.add('S1-rung1-teach-new');
          scenarioFilter.add('S3-rung3-evaluate');
          scenarioFilter.add('S5-rung5-exit');
        } else {
          for (const s of next.split(',')) {
            if (s.trim()) scenarioFilter.add(s.trim());
          }
        }
      }
    } else if (arg === '--max-live-calls') {
      const next = argv[++i];
      const parsed = next ? Number.parseInt(next, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= 0) {
        options.maxLiveCalls = parsed;
      }
    } else if (arg === '--check-baseline') {
      options.checkBaseline = true;
    } else if (arg === '--update-baseline') {
      options.updateBaseline = true;
    } else if (arg === '--baseline-tolerance') {
      const next = argv[++i];
      const parsed = next ? Number.parseFloat(next) : NaN;
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        options.baselineTolerancePp = parsed;
      }
    }
  }

  if (flowFilter.size > 0) options.flowFilter = flowFilter;
  if (profileFilter.size > 0) options.profileFilter = profileFilter;
  if (scenarioFilter.size > 0) options.scenarioFilter = scenarioFilter;

  return { options, listOnly };
}

const DEFAULT_MAX_LIVE_CALLS = 20;

export async function runHarness(
  flows: FlowDefinition[],
  options: RunOptions
): Promise<RunSummary> {
  const summary: RunSummary = {
    flowsRun: 0,
    profilesRun: 0,
    snapshotsWritten: 0,
    liveCallsOk: 0,
    liveCallsFailed: 0,
    skipped: [],
    envelopeMetrics: {},
  };

  // Per-flow bags of SampleMetrics — folded into aggregates at the end so we
  // can attribute drift back to individual flows without having to re-parse.
  const samplesByFlow = new Map<string, SampleMetrics[]>();

  const activeFlows = flows.filter(
    (f) => !options.flowFilter || options.flowFilter.has(f.id)
  );
  const activeProfiles = PROFILES.filter(
    (p) => !options.profileFilter || options.profileFilter.has(p.id)
  );

  const maxLiveCalls = options.maxLiveCalls ?? DEFAULT_MAX_LIVE_CALLS;
  let liveCallsMade = 0;

  for (const flow of activeFlows) {
    summary.flowsRun++;
    for (const profile of activeProfiles) {
      // Fan the profile out into one-or-more items. Flows without
      // enumerateScenarios produce a single anonymous item; flows with it
      // produce one item per scenario. `scenarioId` is undefined in the
      // anonymous case so snapshot paths stay backwards-compatible.
      const items: Array<{ scenarioId?: string; input: unknown }> = [];
      if (flow.enumerateScenarios) {
        const scenarios = flow.enumerateScenarios(profile);
        if (!scenarios || scenarios.length === 0) {
          summary.skipped.push({
            flowId: flow.id,
            profileId: profile.id,
            reason: 'flow does not apply to this profile',
          });
          continue;
        }
        for (const s of scenarios as Array<Scenario<unknown>>) {
          if (
            options.scenarioFilter &&
            !options.scenarioFilter.has(s.scenarioId)
          ) {
            continue; // silently drop filtered scenarios
          }
          items.push({ scenarioId: s.scenarioId, input: s.input });
        }
        if (items.length === 0) {
          summary.skipped.push({
            flowId: flow.id,
            profileId: profile.id,
            reason: 'all scenarios filtered out',
          });
          continue;
        }
      } else {
        const input = flow.buildPromptInput(profile);
        if (input === null) {
          summary.skipped.push({
            flowId: flow.id,
            profileId: profile.id,
            reason: 'flow does not apply to this profile',
          });
          continue;
        }
        items.push({ input });
      }

      for (const item of items) {
        try {
          const messages = flow.buildPrompt(item.input);

          let liveResponse: string | undefined;
          let liveProvider: string | undefined;
          let liveModel: string | undefined;
          let liveError: string | undefined;
          let schemaViolation: string | undefined;

          if (options.live && flow.runLive) {
            if (liveCallsMade >= maxLiveCalls) {
              liveError = `live budget exceeded (${maxLiveCalls} calls); re-run with --max-live-calls to raise`;
              summary.skipped.push({
                flowId: flow.id,
                profileId: profile.id,
                reason: liveError,
              });
            } else {
              liveCallsMade++;
              try {
                liveResponse = await flow.runLive(item.input, messages);
                summary.liveCallsOk++;

                // Collect signal metrics for envelope-emitting flows so the
                // baseline regression guard can detect drift (Layer 1).
                if (flow.emitsEnvelope && liveResponse) {
                  const bucket = samplesByFlow.get(flow.id) ?? [];
                  bucket.push(extractSampleMetrics(liveResponse));
                  samplesByFlow.set(flow.id, bucket);
                }

                if (flow.expectedResponseSchema && liveResponse) {
                  try {
                    const jsonMatch = liveResponse.match(/\{[\s\S]*\}/);
                    const parsed = JSON.parse(
                      jsonMatch ? jsonMatch[0] : liveResponse
                    );
                    const result =
                      flow.expectedResponseSchema.safeParse(parsed);
                    if (!result.success) {
                      schemaViolation =
                        result.error instanceof Error
                          ? result.error.message
                          : JSON.stringify(result.error);
                    }
                  } catch (parseErr) {
                    schemaViolation =
                      parseErr instanceof Error
                        ? `JSON parse failed: ${parseErr.message}`
                        : 'JSON parse failed';
                  }
                }
              } catch (err) {
                liveError = err instanceof Error ? err.message : String(err);
                summary.liveCallsFailed++;
              }
            }
          } else if (options.live && !flow.runLive) {
            liveError = 'runLive not implemented for this flow';
          }

          const snapshotPath = await writeSnapshot({
            flow,
            profile,
            scenarioId: item.scenarioId,
            builderInput: item.input,
            messages,
            liveResponse,
            liveProvider,
            liveModel,
            liveError,
            schemaViolation,
          });

          summary.snapshotsWritten++;
          summary.profilesRun++;
          const tag = item.scenarioId
            ? `${profile.id} · ${item.scenarioId}`
            : profile.id;
          console.log(`  [${flow.id}] ${tag} → ${relativize(snapshotPath)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const tag = item.scenarioId
            ? `${profile.id} · ${item.scenarioId}`
            : profile.id;
          console.error(`  [${flow.id}] ${tag} FAILED: ${msg}`);
          summary.skipped.push({
            flowId: flow.id,
            profileId: profile.id,
            reason: `error: ${msg}`,
          });
        }
      }
    }
  }

  // Fold per-flow sample bags into the final aggregate so callers (the CLI
  // baseline guard, tests) see a single Record<flowId, FlowAggregate>.
  for (const [flowId, samples] of samplesByFlow.entries()) {
    summary.envelopeMetrics[flowId] = aggregateFlowSamples(samples);
  }

  return summary;
}

export function listFlows(flows: FlowDefinition[]): void {
  console.log('Registered flows:');
  for (const flow of flows) {
    console.log(`  ${flow.id.padEnd(32)} ${flow.name}  (${flow.sourceFile})`);
  }
  console.log('');
  console.log('Registered profiles:');
  for (const p of PROFILES as EvalProfile[]) {
    console.log(`  ${p.id.padEnd(32)} ${p.description}`);
  }
}

function relativize(absPath: string): string {
  const idx = absPath.indexOf('eval-llm');
  if (idx < 0) return absPath;
  return `…/${absPath.slice(idx)}`;
}
