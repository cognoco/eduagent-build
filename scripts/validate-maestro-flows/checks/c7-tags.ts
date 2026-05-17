import type { CheckResult, ValidatorInputs, Violation } from '../shared';

export function runC7(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  // Only enforce on non-setup flows. Setup helpers are exempt.
  for (const flow of inputs.flows) {
    checked++;
    if (flow.tags.length === 0) {
      violations.push({
        file: flow.repoPath,
        reason: `no tags defined in frontmatter (every non-setup flow must declare at least one tag)`,
      });
      continue;
    }
    // If a registry is defined, validate every tag against it. If the registry
    // is empty (CONVENTIONS.md has no Tag Registry section yet) we still allow
    // the no-tags check to fire, but we skip per-tag validation so C7 doesn't
    // explode before Step 4 lands.
    if (inputs.registryTags.size === 0) continue;
    for (const tag of flow.tags) {
      if (!inputs.registryTags.has(tag)) {
        violations.push({
          file: flow.repoPath,
          reason: `unrecognised tag '${tag}' (not in CONVENTIONS.md Tag Registry)`,
        });
      }
    }
  }
  return {
    code: 'C7',
    title: 'Flow tags',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}
