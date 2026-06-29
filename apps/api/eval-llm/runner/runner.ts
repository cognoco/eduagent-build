import type { FlowDefinition, QualityIssue, Scenario } from './types';
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
//   --scenarios core|full|source-grounding|personalization|homework-source|book-suggestions|<csv>
//                             restrict scenarios for enumerated flows
//   --max-live-calls N     hard cap on live LLM calls (default 20)
//   --only-envelope-flows  run only flows with emitsEnvelope:true (baseline set)
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
   * Restrict the run to flows with `emitsEnvelope: true` — the exact set the
   * baseline regression guard tracks. Lets CI's `--check-baseline` live run
   * cover exactly the envelope-emitting flows without hardcoding a flow list
   * that rots when a new envelope flow is added (WI-560). Composes with
   * `--flow` (intersection).
   */
  onlyEnvelopeFlows?: boolean;
  /**
   * Candidate-model gate: route every live call to this OpenRouter model slug
   * (verbatim passthrough, e.g. "mistralai/mistral-small-2603") instead of the
   * production router. Requires --live and OPENROUTER_API_KEY. The §6
   * validation-gate switch from the 2026-06-05 model-selection memo.
   */
  openrouterModel?: string;
  /**
   * Reasoning-effort dial for the candidate model (requires
   * --openrouter-model). Measured 2026-06-06 on gpt-5-mini: medium = at the
   * 25s wall, low = 10–13s, minimal = 4–7s. See memo §6 diagnostics.
   */
  openrouterReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * Pin candidate serving to one OpenRouter host, fallbacks disabled
   * (requires --openrouter-model). For open/hybrid-weight models the host
   * changes behavior (e.g. deepseek-v4-pro: DeepInfra fast/non-reasoning,
   * Novita reasoning-by-default).
   */
  openrouterProvider?: string;
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
   * Structural validation of the checked-in baseline file. Unlike
   * checkBaseline this makes NO live LLM calls — it parses `baseline.json`
   * and asserts it is non-empty for every envelope-emitting flow. This is the
   * deterministic guard CI can run on every PR: it catches a placebo
   * `{ "flows": {} }` baseline (which silently makes envelope-signal drift
   * invisible) without burning LLM credits or introducing non-determinism.
   */
  validateBaseline?: boolean;
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
  qualityWarnings: number;
  qualityFailures: number;
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
      // `--scenarios core|full|S1,S3` — suite names and "core" are sugar.
      // `core` expands to S1,S3,S5 (highest-signal default).
      const next = argv[++i];
      if (next) {
        if (next === 'full') {
          // no filter — all scenarios run
        } else if (next === 'core') {
          scenarioFilter.add('S1-rung1-teach-new');
          scenarioFilter.add('S3-rung3-evaluate');
          scenarioFilter.add('S5-rung5-exit');
        } else if (next === 'source-grounding') {
          addScenarioRange(scenarioFilter, 'SGA', 1, 6);
        } else if (next === 'personalization') {
          addScenarioRange(scenarioFilter, 'PM', 1, 8);
        } else if (next === 'homework-source') {
          addScenarioRange(scenarioFilter, 'HW', 1, 4);
        } else if (next === 'book-suggestions') {
          for (const id of [
            'relevance-diversity',
            'age-register-adult',
            'four-strands-language',
            'source-neutral',
            'duplicate-tiny-avoidance',
          ]) {
            scenarioFilter.add(id);
          }
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
    } else if (arg === '--openrouter-model') {
      const next = argv[++i];
      if (next) options.openrouterModel = next;
    } else if (arg === '--openrouter-reasoning-effort') {
      const next = argv[++i];
      if (
        next === 'minimal' ||
        next === 'low' ||
        next === 'medium' ||
        next === 'high'
      ) {
        options.openrouterReasoningEffort = next;
      } else {
        console.error(
          `Invalid --openrouter-reasoning-effort "${next ?? ''}" — use minimal|low|medium|high.`,
        );
        process.exit(2);
      }
    } else if (arg === '--openrouter-provider') {
      const next = argv[++i];
      if (next) options.openrouterProvider = next;
    } else if (arg === '--check-baseline') {
      options.checkBaseline = true;
    } else if (arg === '--update-baseline') {
      options.updateBaseline = true;
    } else if (arg === '--validate-baseline') {
      options.validateBaseline = true;
    } else if (arg === '--only-envelope-flows') {
      options.onlyEnvelopeFlows = true;
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

function addScenarioRange(
  scenarioFilter: Set<string>,
  prefix: string,
  start: number,
  end: number,
): void {
  for (let i = start; i <= end; i++) {
    scenarioFilter.add(`${prefix}${i.toString().padStart(2, '0')}`);
  }
}

const DEFAULT_MAX_LIVE_CALLS = 20;

export async function runHarness(
  flows: FlowDefinition[],
  options: RunOptions,
): Promise<RunSummary> {
  const summary: RunSummary = {
    flowsRun: 0,
    profilesRun: 0,
    snapshotsWritten: 0,
    liveCallsOk: 0,
    liveCallsFailed: 0,
    qualityWarnings: 0,
    qualityFailures: 0,
    skipped: [],
    envelopeMetrics: {},
  };

  // Per-flow bags of SampleMetrics — folded into aggregates at the end so we
  // can attribute drift back to individual flows without having to re-parse.
  const samplesByFlow = new Map<string, SampleMetrics[]>();

  const activeFlows = flows.filter(
    (f) =>
      (!options.flowFilter || options.flowFilter.has(f.id)) &&
      (!options.onlyEnvelopeFlows || f.emitsEnvelope === true),
  );
  const activeProfiles = PROFILES.filter(
    (p) => !options.profileFilter || options.profileFilter.has(p.id),
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
          let qualityIssues: QualityIssue[] | undefined;

          if (flow.evaluateDeterministic) {
            try {
              qualityIssues = await flow.evaluateDeterministic({
                input: item.input,
                messages,
                profile,
                scenarioId: item.scenarioId,
              });
            } catch (deterministicErr) {
              qualityIssues = [
                {
                  severity: 'error',
                  code: 'deterministic-check-threw',
                  message:
                    deterministicErr instanceof Error
                      ? deterministicErr.message
                      : String(deterministicErr),
                },
              ];
            }

            recordQualityIssues(summary, qualityIssues);
          }

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
                  const rawResult =
                    flow.expectedResponseSchema.safeParse(liveResponse);
                  if (!rawResult.success) {
                    try {
                      const jsonMatch = liveResponse.match(/\{[\s\S]*\}/);
                      const parsed = JSON.parse(
                        jsonMatch ? jsonMatch[0] : liveResponse,
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
                }

                if (flow.evaluateQuality && liveResponse) {
                  let liveQualityIssues: QualityIssue[];
                  try {
                    // Awaited because evaluateQuality may be async (LLM-judge
                    // flows); awaiting a plain array is a no-op for the
                    // existing sync evaluators.
                    liveQualityIssues = await flow.evaluateQuality({
                      input: item.input,
                      messages,
                      liveResponse,
                      profile,
                      scenarioId: item.scenarioId,
                    });
                  } catch (qualityErr) {
                    liveQualityIssues = [
                      {
                        severity: 'error',
                        code: 'quality-check-threw',
                        message:
                          qualityErr instanceof Error
                            ? qualityErr.message
                            : String(qualityErr),
                      },
                    ];
                  }

                  recordQualityIssues(summary, liveQualityIssues);
                  qualityIssues = [
                    ...(qualityIssues ?? []),
                    ...liveQualityIssues,
                  ];
                }
              } catch (err) {
                // `|| String(err)` so an Error with an empty message never
                // produces a falsy liveError (which the snapshot renderer
                // would previously have dropped silently).
                liveError =
                  err instanceof Error
                    ? err.message || String(err)
                    : String(err);
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
            qualityIssues,
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

function recordQualityIssues(
  summary: RunSummary,
  qualityIssues: QualityIssue[] | undefined,
): void {
  for (const issue of qualityIssues ?? []) {
    if (issue.severity === 'warning') {
      summary.qualityWarnings++;
    } else {
      summary.qualityFailures++;
    }
  }
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
