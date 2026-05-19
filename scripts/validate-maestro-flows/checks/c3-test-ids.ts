import type {
  CheckResult,
  FlowFile,
  ValidatorInputs,
  Violation,
} from '../shared';

// Match `id:` values in Maestro YAML (used by tapOn, assertVisible, extendedWaitUntil, etc.)
const ID_LINE_RE = /^\s*id:\s*([^\s#].*?)\s*(?:#.*)?$/;

function extractIds(flow: FlowFile): Array<{ id: string; line: number }> {
  const out: Array<{ id: string; line: number }> = [];
  for (let i = 0; i < flow.lines.length; i++) {
    const m = flow.lines[i].match(ID_LINE_RE);
    if (m) {
      const raw = m[1].replace(/^['"]|['"]$/g, '').trim();
      if (raw) out.push({ id: raw, line: i + 1 });
    }
  }
  return out;
}

function matchesAppId(flowId: string, inputs: ValidatorInputs): boolean {
  // Direct hit.
  if (inputs.appTestIds.has(flowId)) return true;
  // Allowlist hit (exact).
  if (inputs.testIdAllowlist.has(flowId)) return true;
  // Convert any ${VAR} segments in the flow id to a wildcard regex and test
  // against exact app ids. This handles flow patterns like
  // `shelf-row-header-${SUBJECT_ID}` matching app testIDs of the same shape
  // even when the app captured the literal portion only.
  if (flowId.includes('${')) {
    const pattern =
      '^' +
      flowId
        .replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
        .replace(/\\\$\\\{[^}]+\\\}/g, '.+') +
      '$';
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return false;
    }
    for (const candidate of inputs.appTestIds) {
      if (re.test(candidate)) return true;
    }
  }
  // Compare against template wildcards extracted from the app source.
  for (const wildcard of inputs.appTestIdWildcards) {
    if (wildcard.test(flowId)) return true;
  }
  // Allowlist may also contain template-style patterns; treat ${...} entries as wildcards.
  for (const allowEntry of inputs.testIdAllowlist) {
    if (!allowEntry.includes('${')) continue;
    const pattern =
      '^' +
      allowEntry
        .replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
        .replace(/\\\$\\\{[^}]+\\\}/g, '.+') +
      '$';
    try {
      if (new RegExp(pattern).test(flowId)) return true;
    } catch {
      // skip
    }
  }
  return false;
}

export function runC3(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const all = [...inputs.flows, ...inputs.setupFlows];
  for (const flow of all) {
    const ids = extractIds(flow);
    for (const { id, line } of ids) {
      checked++;
      if (!matchesAppId(id, inputs)) {
        violations.push({
          file: flow.repoPath,
          line,
          reason: `testID '${id}' not found in source AND not in allowlist AND no wildcard match`,
        });
      }
    }
  }
  return {
    code: 'C3',
    title: 'TestID references',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}

export const _internals = { extractIds, matchesAppId };
