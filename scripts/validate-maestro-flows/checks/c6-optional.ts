import type {
  CheckResult,
  FlowFile,
  ValidatorInputs,
  Violation,
} from '../shared';

const OPTIONAL_TRUE_RE = /^(\s*)optional:\s*true\b(.*)$/;
const JUSTIFIED_INLINE_RE = /#\s*justified:/i;
const JUSTIFIED_PRECEDING_RE = /^\s*#\s*justified:/i;

function scanOptional(flow: FlowFile): {
  total: number;
  unjustified: Array<{ line: number }>;
} {
  const unjustified: Array<{ line: number }> = [];
  let total = 0;
  for (let i = 0; i < flow.lines.length; i++) {
    const m = flow.lines[i].match(OPTIONAL_TRUE_RE);
    if (!m) continue;
    total++;
    const trailing = m[2] || '';
    if (JUSTIFIED_INLINE_RE.test(trailing)) continue;
    if (i > 0 && JUSTIFIED_PRECEDING_RE.test(flow.lines[i - 1])) continue;
    unjustified.push({ line: i + 1 });
  }
  return { total, unjustified };
}

const GATED_TAGS = new Set(['pr-blocking', 'smoke']);

export function runC6(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const allowedFiles = new Set(
    inputs.optionalAllowlist.map((entry) =>
      entry.replace(/^apps\/mobile\/e2e\//, ''),
    ),
  );
  const all = [...inputs.flows, ...inputs.setupFlows];
  for (const flow of all) {
    const relPath = flow.repoPath.replace(/^apps\/mobile\/e2e\//, '');
    if (allowedFiles.has(relPath)) continue;
    if (!flow.tags.some((t) => GATED_TAGS.has(t))) continue;
    const { total, unjustified } = scanOptional(flow);
    checked += total;
    for (const { line } of unjustified) {
      violations.push({
        file: flow.repoPath,
        line,
        reason: `optional: true in ${flow.tags.filter((t) => GATED_TAGS.has(t)).join('/')} flow without # justified: annotation or allowlist match`,
      });
    }
  }
  return {
    code: 'C6',
    title: 'Unjustified optional: true',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}

export const _internals = { scanOptional };
