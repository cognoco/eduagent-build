import { basename, dirname, relative, resolve } from 'path';
import type { CheckResult, ValidatorInputs, Violation } from '../shared';
import { _internals as c1Internals } from './c1-flow-refs';

export function runC2(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const setupRoot = 'apps/mobile/e2e/flows/_setup/';
  const all = [...inputs.flows, ...inputs.setupFlows];
  for (const flow of all) {
    const targets = c1Internals.extractRunFlowTargets(flow);
    for (const { target, line } of targets) {
      const baseDir = dirname(flow.absPath);
      const resolved = resolve(baseDir, target);
      const rel = relative(inputs.repoRoot, resolved).replace(/\\/g, '/');
      if (!rel.startsWith(setupRoot)) continue;
      checked++;
      const helperName = basename(resolved);
      if (!inputs.setupHelperNames.has(helperName)) {
        violations.push({
          file: flow.repoPath,
          line,
          reason: `references missing _setup helper '${helperName}'`,
        });
      }
    }
  }
  return {
    code: 'C2',
    title: 'Setup helper references',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}
