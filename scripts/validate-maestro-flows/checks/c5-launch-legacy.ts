import type {
  CheckResult,
  FlowFile,
  ValidatorInputs,
  Violation,
} from '../shared';

const LAUNCH_APP_RE = /^\s*-?\s*launchApp(?::|\s|$)/;
const LAUNCH_DEVCLIENT_RE = /_setup\/launch-devclient\.yaml/;

function hasLegacyLaunch(flow: FlowFile): { hit: boolean; line: number } {
  for (let i = 0; i < flow.lines.length; i++) {
    if (
      LAUNCH_APP_RE.test(flow.lines[i]) ||
      LAUNCH_DEVCLIENT_RE.test(flow.lines[i])
    ) {
      return { hit: true, line: i + 1 };
    }
  }
  return { hit: false, line: -1 };
}

export function runC5(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const all = [...inputs.flows, ...inputs.setupFlows];
  // Allowlist paths are stored without the `apps/mobile/e2e/` prefix
  // (matches the existing launch-legacy-allowlist.txt format).
  const allowed = new Set<string>();
  for (const entry of inputs.launchLegacyAllowlist) {
    allowed.add(entry.replace(/^apps\/mobile\/e2e\//, ''));
  }
  for (const flow of all) {
    const { hit, line } = hasLegacyLaunch(flow);
    if (!hit) continue;
    checked++;
    const relPath = flow.repoPath.replace(/^apps\/mobile\/e2e\//, '');
    if (!allowed.has(relPath)) {
      violations.push({
        file: flow.repoPath,
        line,
        reason: `uses launchApp/launch-devclient outside legacy allowlist`,
      });
    }
  }
  return {
    code: 'C5',
    title: 'Legacy launch usage',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}

export const _internals = { hasLegacyLaunch };
