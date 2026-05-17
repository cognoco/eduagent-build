#!/usr/bin/env tsx
/**
 * Maestro flow validator entry point.
 *
 * Runs 7 static checks (C1-C7) defined in docs/audit/e2e/validator-spec.md.
 * Each check can be toggled via env var (VALIDATE_C1=0 disables; all enabled
 * by default).
 *
 * Exit code 0 = all enabled checks passed. Non-zero = at least one violation.
 */

import { findRepoRoot, loadInputs, type CheckResult } from './shared';
import { runC1 } from './checks/c1-flow-refs';
import { runC2 } from './checks/c2-helpers';
import { runC3 } from './checks/c3-test-ids';
import { runC4 } from './checks/c4-seed-scenarios';
import { runC5 } from './checks/c5-launch-legacy';
import { runC6 } from './checks/c6-optional';
import { runC7 } from './checks/c7-tags';

type CheckId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7';

const REGISTRY: Array<{
  id: CheckId;
  run: (inputs: ReturnType<typeof loadInputs>) => CheckResult;
}> = [
  { id: 'C1', run: runC1 },
  { id: 'C2', run: runC2 },
  { id: 'C3', run: runC3 },
  { id: 'C4', run: runC4 },
  { id: 'C5', run: runC5 },
  { id: 'C6', run: runC6 },
  { id: 'C7', run: runC7 },
];

function isEnabled(id: CheckId): boolean {
  const env = process.env[`VALIDATE_${id}`];
  if (env === undefined) return true;
  return env !== '0' && env.toLowerCase() !== 'false';
}

function formatResult(result: CheckResult): string {
  const tag = result.passed ? '[PASS]' : '[FAIL]';
  const header = `${tag} ${result.code}: ${result.title} (${result.checkedCount} checked, ${result.violations.length} violation${result.violations.length === 1 ? '' : 's'})`;
  if (result.passed) return header;
  const lines = [header];
  for (const v of result.violations) {
    const loc = v.line !== undefined ? `${v.file}:${v.line}` : v.file;
    lines.push(`  ${result.code}: ${loc} — ${v.reason}`);
  }
  return lines.join('\n');
}

function main(): number {
  const started = Date.now();
  const repoRoot = findRepoRoot();
  const inputs = loadInputs(repoRoot);

  const summary = {
    flows: inputs.flows.length,
    setupFlows: inputs.setupFlows.length,
    appTestIds: inputs.appTestIds.size,
    seedScenarios: inputs.seedScenarios.size,
    registryTags: inputs.registryTags.size,
  };
  console.log(
    `Maestro validator — ${summary.flows} flows + ${summary.setupFlows} setup helpers; ${summary.appTestIds} app testIDs; ${summary.seedScenarios} seed scenarios; ${summary.registryTags} registered tags`,
  );

  const results: CheckResult[] = [];
  let totalViolations = 0;
  let failedChecks = 0;
  const skipped: string[] = [];

  for (const entry of REGISTRY) {
    if (!isEnabled(entry.id)) {
      skipped.push(entry.id);
      continue;
    }
    const r = entry.run(inputs);
    results.push(r);
    console.log(formatResult(r));
    if (!r.passed) {
      failedChecks++;
      totalViolations += r.violations.length;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log('');
  console.log(
    `Summary: ${passed}/${results.length} checks passed, ${failedChecks} failed (${totalViolations} violation${totalViolations === 1 ? '' : 's'}) in ${elapsed}s${skipped.length ? `; skipped via env: ${skipped.join(', ')}` : ''}`,
  );

  return failedChecks > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

export { main };
