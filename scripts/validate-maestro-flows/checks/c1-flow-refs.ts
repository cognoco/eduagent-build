import { existsSync } from 'fs';
import { dirname, join, normalize, resolve } from 'path';
import type {
  CheckResult,
  FlowFile,
  ValidatorInputs,
  Violation,
} from '../shared';

const RUNFLOW_FILE_RE = /^\s*-?\s*runFlow:\s*([^\s#].*?)\s*(?:#.*)?$/;
const RUNFLOW_FILE_KEY_RE = /^\s*file:\s*([^\s#].*?)\s*(?:#.*)?$/;

function extractRunFlowTargets(
  flow: FlowFile,
): Array<{ target: string; line: number }> {
  const out: Array<{ target: string; line: number }> = [];
  for (let i = 0; i < flow.lines.length; i++) {
    const line = flow.lines[i];
    // Inline form: `runFlow: path/to.yaml` (no following `:` block)
    // We detect by checking the value doesn't start with `{` or end with `:` (block).
    const inline = line.match(/^\s*-?\s*runFlow:\s*(\S.+?)\s*(?:#.*)?$/);
    if (inline) {
      const value = inline[1].trim();
      if (
        value &&
        !value.endsWith(':') &&
        !value.startsWith('{') &&
        !value.startsWith('[') &&
        !value.startsWith('|') &&
        !value.startsWith('>')
      ) {
        // strip surrounding quotes
        const cleaned = value.replace(/^['"]|['"]$/g, '');
        if (cleaned.endsWith('.yaml') || cleaned.endsWith('.yml')) {
          out.push({ target: cleaned, line: i + 1 });
          continue;
        }
      }
    }
    // Block form: under `runFlow:` look for nested `file:` within a small window.
    if (/^\s*-?\s*runFlow:\s*(?:#.*)?$/.test(line)) {
      for (let j = i + 1; j < Math.min(flow.lines.length, i + 20); j++) {
        const inner = flow.lines[j];
        const fileMatch = inner.match(RUNFLOW_FILE_KEY_RE);
        if (fileMatch) {
          const cleaned = fileMatch[1].trim().replace(/^['"]|['"]$/g, '');
          if (cleaned.endsWith('.yaml') || cleaned.endsWith('.yml')) {
            out.push({ target: cleaned, line: j + 1 });
          }
          break;
        }
        // Stop scanning when we hit a sibling top-level command (a leading `- ` at the same indent).
        if (/^\s*-\s/.test(inner)) break;
        // Stop at blank line followed by another top-level item
        if (inner.trim() === '') continue;
      }
    }
  }
  return out;
}

export function runC1(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const all = [...inputs.flows, ...inputs.setupFlows];
  for (const flow of all) {
    const targets = extractRunFlowTargets(flow);
    for (const { target, line } of targets) {
      checked++;
      // Resolve target relative to flow file's directory.
      const baseDir = dirname(flow.absPath);
      const resolved = normalize(resolve(baseDir, target));
      if (!existsSync(resolved)) {
        violations.push({
          file: flow.repoPath,
          line,
          reason: `runFlow target '${target}' not found (resolved: ${resolved.replace(inputs.repoRoot + '/', '')})`,
        });
      }
    }
  }
  return {
    code: 'C1',
    title: 'Flow file references',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}

// Exported for tests
export const _internals = { extractRunFlowTargets };
