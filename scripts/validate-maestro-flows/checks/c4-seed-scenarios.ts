import type {
  CheckResult,
  FlowFile,
  ValidatorInputs,
  Violation,
} from '../shared';

const SEED_SCENARIO_RE = /SEED_SCENARIO:\s*["']([a-z0-9-]+)["']/g;

function extractScenarios(
  flow: FlowFile,
): Array<{ scenario: string; line: number }> {
  const out: Array<{ scenario: string; line: number }> = [];
  for (let i = 0; i < flow.lines.length; i++) {
    const line = flow.lines[i];
    SEED_SCENARIO_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SEED_SCENARIO_RE.exec(line)) !== null) {
      out.push({ scenario: m[1], line: i + 1 });
    }
  }
  return out;
}

export function runC4(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const all = [...inputs.flows, ...inputs.setupFlows];
  for (const flow of all) {
    const refs = extractScenarios(flow);
    for (const { scenario, line } of refs) {
      checked++;
      if (!inputs.seedScenarios.has(scenario)) {
        violations.push({
          file: flow.repoPath,
          line,
          reason: `references seed scenario '${scenario}' not in SeedScenario type`,
        });
      }
    }
  }
  return {
    code: 'C4',
    title: 'Seed scenarios',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}

export const _internals = { extractScenarios };
