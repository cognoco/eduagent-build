import type { FlowDefinition } from './types';
import { PROFILES, type EvalProfile } from '../fixtures/profiles';
import { writeSnapshot } from './snapshot';

// ---------------------------------------------------------------------------
// Runner — orchestrates the flow × profile matrix.
//
// CLI flags:
//   --live            hit the real LLM providers (opt-in, costs credits)
//   --flow <id>       only run this flow (repeatable)
//   --profile <id>    only run this profile (repeatable)
//   --list            list registered flows and fixtures and exit
// ---------------------------------------------------------------------------

export interface RunOptions {
  live: boolean;
  flowFilter?: Set<string>;
  profileFilter?: Set<string>;
}

export interface RunSummary {
  flowsRun: number;
  profilesRun: number;
  snapshotsWritten: number;
  liveCallsOk: number;
  liveCallsFailed: number;
  skipped: Array<{ flowId: string; profileId: string; reason: string }>;
}

export function parseCliArgs(argv: string[]): {
  options: RunOptions;
  listOnly: boolean;
} {
  const options: RunOptions = { live: false };
  let listOnly = false;
  const flowFilter = new Set<string>();
  const profileFilter = new Set<string>();

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
    }
  }

  if (flowFilter.size > 0) options.flowFilter = flowFilter;
  if (profileFilter.size > 0) options.profileFilter = profileFilter;

  return { options, listOnly };
}

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
  };

  const activeFlows = flows.filter(
    (f) => !options.flowFilter || options.flowFilter.has(f.id)
  );
  const activeProfiles = PROFILES.filter(
    (p) => !options.profileFilter || options.profileFilter.has(p.id)
  );

  for (const flow of activeFlows) {
    summary.flowsRun++;
    let seenProfileForFlow = false;
    for (const profile of activeProfiles) {
      try {
        const input = flow.buildPromptInput(profile);
        if (input === null) {
          summary.skipped.push({
            flowId: flow.id,
            profileId: profile.id,
            reason: 'flow does not apply to this profile',
          });
          continue;
        }

        const messages = flow.buildPrompt(input);

        let liveResponse: string | undefined;
        let liveProvider: string | undefined;
        let liveModel: string | undefined;
        let liveError: string | undefined;
        let schemaViolation: string | undefined;

        if (options.live && flow.runLive) {
          try {
            liveResponse = await flow.runLive(input, messages);
            summary.liveCallsOk++;

            // If the flow declares an expectedResponseSchema, try to parse
            // the raw response as JSON and validate — mismatches surface as
            // a "Schema violation" section in the snapshot.
            if (flow.expectedResponseSchema && liveResponse) {
              try {
                const jsonMatch = liveResponse.match(/\{[\s\S]*\}/);
                const parsed = JSON.parse(
                  jsonMatch ? jsonMatch[0] : liveResponse
                );
                const result = flow.expectedResponseSchema.safeParse(parsed);
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
        } else if (options.live && !flow.runLive) {
          liveError = 'runLive not implemented for this flow';
        }

        const snapshotPath = await writeSnapshot({
          flow,
          profile,
          builderInput: input,
          messages,
          liveResponse,
          liveProvider,
          liveModel,
          liveError,
          schemaViolation,
        });

        summary.snapshotsWritten++;
        if (!seenProfileForFlow) seenProfileForFlow = true;
        summary.profilesRun++;
        console.log(
          `  [${flow.id}] ${profile.id} → ${relativize(snapshotPath)}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [${flow.id}] ${profile.id} FAILED: ${msg}`);
        summary.skipped.push({
          flowId: flow.id,
          profileId: profile.id,
          reason: `error: ${msg}`,
        });
      }
    }
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
