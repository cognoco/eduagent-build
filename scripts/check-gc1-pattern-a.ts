// GC1 ratchet — structural check for new internal `jest.mock()` calls.
//
// Replaces the textual-only grep in `.husky/pre-commit` which accepted any
// `// gc1-allow` sticker on the same line, regardless of whether the mock
// was actually compliant. After the 2026-05 mock-drain spike, that grep
// would have normalised gc1-allow as a magic-word bypass (BUG-1051).
//
// A staged `jest.mock('./...')` / `jest.doMock('../...')` line passes if:
//   (a) Pattern A: factory body (next ~30 lines) spreads `jest.requireActual(<same path>)`,
//       inline (`...jest.requireActual('./foo')`) or via a named local
//       (`const actual = jest.requireActual('./foo'); ...; ...actual`), OR
//   (b) the line carries an on-line `gc1-allow: <reason>` escape hatch.
//
// Both forms are observed in the codebase — see
//   apps/api/src/routes/dashboard.test.ts:63   (inline spread)
//   apps/api/src/services/billing/family.test.ts:3   (named-local spread)
//   apps/api/src/routes/quiz.test.ts:66   (gc1-allow external boundary)
//
// CLI usage:
//   Pre-commit (default): scans the staged index.
//     pnpm exec tsx scripts/check-gc1-pattern-a.ts
//   CI (PR mode):         scans HEAD vs. origin/<base>. Triggered by setting
//     GITHUB_BASE_REF. Reads files from HEAD (not the index).
// Exit codes: 0 clean, 1 violations.

import { spawnSync } from 'node:child_process';
import * as ts from 'typescript';

export type Violation = {
  file: string;
  line: number;
  content: string;
  reason: 'missing-pattern-a' | 'invalid-mock';
};

const MOCK_LINE = /jest\.(?:mock|doMock)\(\s*['"`](\.\.?\/[^'"`]+)['"`]/;
// Detects a jest.mock( call that ends the physical line without a specifier —
// the specifier sits on a subsequent line (multiline call form).
const MOCK_OPEN = /jest\.(?:mock|doMock)\s*\(/;
// Matches a leading specifier argument on its own line: `  './foo',` or `"../bar"`.
const SPECIFIER_LINE = /^\s*['"`](\.\.?\/[^'"`]+)['"`]/;
const GC1_ALLOW = /gc1-allow/i;

export function extractSpecifier(line: string): string | null {
  // Single-line form: jest.mock('./foo', ...) on one physical line.
  const m = line.match(MOCK_LINE);
  if (m) return m[1];
  // Multiline form: content is "jest.mock(\n  './foo'," — check each part.
  for (const part of line.split('\n')) {
    const ms = part.match(SPECIFIER_LINE);
    if (ms) return ms[1];
  }
  return null;
}

// Look at the factory body that follows `jest.mock(...)` (next ~30 lines).
// Accepts two real-world Pattern A shapes:
//   1. Inline: `...jest.requireActual('<spec>')`
//   2. Named local: `const actual = jest.requireActual('<spec>')` + later `...actual`
export function isPatternA(
  stagedLines: string[],
  startLine: number,
  specifier: string,
): boolean {
  const end = Math.min(stagedLines.length, startLine + 30);
  const window = stagedLines.slice(startLine - 1, end).join('\n');

  const escapedSpec = specifier.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&');
  const requireActualWithSpecifier = String.raw`jest\.requireActual\s*(?:<\s*typeof\s+import\s*\(\s*['"\`]${escapedSpec}['"\`]\s*\)\s*>\s*)?\(\s*['"\`]${escapedSpec}['"\`]`;
  // Match `jest.requireActual('<spec>'` — leave the trailing `)` open so the
  // multi-line form `jest.requireActual(\n  '<spec>',\n) as typeof import(...)`
  // still matches (trailing comma + type cast wrap the call). Also allow the
  // TypeScript generic form `jest.requireActual<typeof import(...)>('<spec>')`.
  const requireActualRe = new RegExp(requireActualWithSpecifier);
  if (!requireActualRe.test(window)) return false;

  if (new RegExp(`\\.\\.\\.\\s*${requireActualWithSpecifier}`).test(window)) {
    return true;
  }

  const namedAssignRe = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*${requireActualWithSpecifier}`,
  );
  const m = window.match(namedAssignRe);
  if (m) {
    const name = m[1];
    const spreadRe = new RegExp(`\\.\\.\\.\\s*${name}\\b`);
    if (spreadRe.test(window)) return true;
  }

  return false;
}

export type StagedMockSite = {
  line: number;
  content: string;
  specifier?: string;
};

function collectAddedNewFileLines(unifiedDiff: string): Set<number> {
  const addedLines = new Set<number>();
  const lines = unifiedDiff.split('\n');
  let cur = 0;
  let inHunk = false;

  for (const ln of lines) {
    if (ln.startsWith('+++') || ln.startsWith('---')) continue;
    const hunk = ln.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      cur = parseInt(hunk[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (ln.startsWith('+')) {
      addedLines.add(cur);
      cur++;
    } else if (ln.startsWith('-')) {
      // deletion — does not consume a new-file line
    } else {
      // context line — only present at unified > 0
      cur++;
    }
  }

  return addedLines;
}

function getLineNumber(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function getJestMockName(call: ts.CallExpression): 'mock' | 'doMock' | null {
  const expression = call.expression;
  if (!ts.isPropertyAccessExpression(expression)) return null;
  if (!ts.isIdentifier(expression.expression)) return null;
  if (expression.expression.text !== 'jest') return null;
  if (expression.name.text !== 'mock' && expression.name.text !== 'doMock') {
    return null;
  }
  return expression.name.text;
}

function getStringLiteralText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
    return (node as ts.NoSubstitutionTemplateLiteral).text;
  }
  return null;
}

function findAddedMockCallsFromSource(
  unifiedDiff: string,
  stagedSrc: string,
  file: string,
): StagedMockSite[] {
  const addedLines = collectAddedNewFileLines(unifiedDiff);
  if (addedLines.size === 0) return [];

  const sourceFile = ts.createSourceFile(
    file,
    stagedSrc,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const sites: StagedMockSite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && getJestMockName(node)) {
      const start = node.getStart(sourceFile);
      const line = getLineNumber(sourceFile, start);
      if (addedLines.has(line)) {
        const firstArg = node.arguments[0];
        const specifier = firstArg ? getStringLiteralText(firstArg) : null;
        if (specifier?.startsWith('./') || specifier?.startsWith('../')) {
          let end = firstArg ? firstArg.getEnd() : node.getEnd();
          // Preserve the existing same-line escape hatch:
          // `jest.mock('./foo', () => ({})); // gc1-allow: reason`.
          if (getLineNumber(sourceFile, node.getEnd()) === line) {
            const lineEnd = stagedSrc.indexOf('\n', node.getEnd());
            end = lineEnd === -1 ? stagedSrc.length : lineEnd;
          }
          sites.push({
            line,
            content: stagedSrc.slice(start, end),
            specifier,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}

// Parse a `git diff --cached --unified=0` patch (already filtered to one file)
// and return new-file line numbers of any added `jest.mock('./...')` lines.
//
// Handles both single-line and multiline call forms:
//   Single:    jest.mock('./foo', () => ({}));
//   Multiline: jest.mock(        ← detected here
//                './foo',        ← specifier found by look-ahead
//                () => ({})
//              );
export function findAddedMockLines(
  unifiedDiff: string,
  stagedSrc?: string,
  file = 'staged.test.ts',
): StagedMockSite[] {
  if (stagedSrc !== undefined) {
    return findAddedMockCallsFromSource(unifiedDiff, stagedSrc, file);
  }

  const lines = unifiedDiff.split('\n');
  const sites: StagedMockSite[] = [];
  let cur = 0;
  let inHunk = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('+++') || ln.startsWith('---')) continue;
    const hunk = ln.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      cur = parseInt(hunk[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (ln.startsWith('+')) {
      const content = ln.slice(1);
      if (MOCK_LINE.test(content)) {
        // Single-line form: jest.mock('./foo', ...) — specifier on the same line.
        sites.push({ line: cur, content });
      } else if (MOCK_OPEN.test(content)) {
        // Multiline form: jest.mock( with no specifier on this line. The
        // specifier (first argument) appears on a later line; blank and
        // comment-only lines are valid JS trivia between the open paren and
        // the first argument and must be skipped — a multi-line `// gc1-allow`
        // rationale block legitimately sits here (see
        // tests/integration/stripe-webhook.integration.test.ts).
        //
        // Accumulate the jest.mock( line plus every scanned line into the
        // emitted content so (a) extractSpecifier finds the specifier and
        // (b) GC1_ALLOW.test() still sees a gc1-allow comment placed anywhere
        // between the paren and the specifier. The window is generous (15
        // lines) so a long rationale block doesn't hide the specifier.
        const mockLine = cur;
        const accumulated: string[] = [content];
        let scanned = 0;
        for (let j = i + 1; j < lines.length && scanned < 15; j++) {
          const ahead = lines[j];
          // Skip deletion lines — they don't appear in the new file and don't
          // consume a look-ahead slot.
          if (ahead.startsWith('-')) continue;
          const aheadContent = ahead.startsWith('+') ? ahead.slice(1) : ahead;
          scanned++;
          accumulated.push(aheadContent);
          // Blank or comment-only lines are trivia — keep scanning.
          const trimmed = aheadContent.trim();
          if (
            trimmed === '' ||
            trimmed.startsWith('//') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*')
          ) {
            continue;
          }
          if (SPECIFIER_LINE.test(aheadContent)) {
            // Emit a site whose content carries the full span from jest.mock(
            // through the specifier line. extractSpecifier reads the specifier;
            // GC1_ALLOW.test reads any gc1-allow comment in the span.
            sites.push({ line: mockLine, content: accumulated.join('\n') });
          }
          // First non-trivia line decides: specifier → flagged above; anything
          // else (e.g. a variable specifier) → not a string-literal mock.
          // Either way, stop scanning.
          break;
        }
      }
      cur++;
    } else if (ln.startsWith('-')) {
      // deletion — does not consume a new-file line
    } else {
      // context line — only present at unified > 0
      cur++;
    }
  }
  return sites;
}

export function checkFile(
  file: string,
  unifiedDiff: string,
  stagedSrc: string,
): Violation[] {
  const sites = findAddedMockLines(unifiedDiff, stagedSrc, file);
  if (sites.length === 0) return [];
  const lines = stagedSrc.split('\n');
  const violations: Violation[] = [];
  for (const { line, content, specifier } of sites) {
    if (GC1_ALLOW.test(content)) continue;
    const spec = specifier ?? extractSpecifier(content);
    if (!spec) {
      violations.push({ file, line, content, reason: 'invalid-mock' });
      continue;
    }
    if (!isPatternA(lines, line, spec)) {
      violations.push({ file, line, content, reason: 'missing-pattern-a' });
    }
  }
  return violations;
}

type DiffSource = {
  // git-diff range args: e.g. `['--cached']` for the index or
  // `['origin/main...HEAD']` for a CI base-vs-HEAD comparison.
  rangeArgs: string[];
  // `git show <ref>:<file>` ref: `:` reads the index, `HEAD` reads the tip.
  showRef: string;
  // Human label for error messages.
  mode: 'pre-commit' | 'ci';
};

function resolveDiffSource(): DiffSource {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef && baseRef.trim().length > 0) {
    return {
      rangeArgs: [`origin/${baseRef}...HEAD`],
      showRef: 'HEAD',
      mode: 'ci',
    };
  }
  return { rangeArgs: ['--cached'], showRef: ':', mode: 'pre-commit' };
}

function runCli(): void {
  const src = resolveDiffSource();

  const nameOnly = spawnSync(
    'git',
    [
      'diff',
      ...src.rangeArgs,
      '--name-only',
      '--diff-filter=d',
      '--',
      '*.test.ts',
      '*.test.tsx',
    ],
    { encoding: 'utf8' },
  );
  if (nameOnly.status !== 0) {
    process.exit(0);
  }
  const stagedFiles = nameOnly.stdout.trim().split('\n').filter(Boolean);

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const all: Violation[] = [];
  for (const f of stagedFiles) {
    let diff: string;
    let staged: string;
    try {
      const diffResult = spawnSync(
        'git',
        ['diff', ...src.rangeArgs, '--unified=0', '--', f],
        {
          encoding: 'utf8',
        },
      );
      const stagedResult = spawnSync('git', ['show', `${src.showRef}:${f}`], {
        encoding: 'utf8',
      });
      if (diffResult.status !== 0 || stagedResult.status !== 0) {
        continue;
      }
      diff = diffResult.stdout;
      staged = stagedResult.stdout;
    } catch {
      continue;
    }
    all.push(...checkFile(f, diff, staged));
  }

  if (all.length === 0) {
    process.exit(0);
  }

  console.error('');
  console.error(
    `${src.mode === 'ci' ? 'CI' : 'pre-commit'}: GC1 — new internal jest.mock() must be Pattern A or carry gc1-allow.`,
  );
  console.error('');
  console.error('Offending added lines:');
  for (const v of all) {
    console.error(`  ${v.file}:${v.line}  ${v.content.trim()}`);
  }
  console.error('');
  console.error(
    'Pattern A: factory must spread jest.requireActual(<same path>):',
  );
  console.error("  jest.mock('./services/foo', () => ({");
  console.error("    ...jest.requireActual('./services/foo'),");
  console.error('    someExport: jest.fn(),');
  console.error('  }));');
  console.error('');
  console.error('Or the two-step form:');
  console.error("  jest.mock('./services/foo', () => {");
  console.error("    const actual = jest.requireActual('./services/foo');");
  console.error('    return { ...actual, someExport: jest.fn() };');
  console.error('  });');
  console.error('');
  console.error('Fix one of three ways:');
  console.error(
    '  1. Convert to Pattern A (preferred — see AGENTS.md GC1 ratchet).',
  );
  console.error("  2. Use a bare specifier if it's a true external boundary.");
  console.error('  3. If you genuinely need a full mock, add');
  console.error(
    '     `// gc1-allow: <reason>` on the SAME line as jest.mock(.',
  );
  console.error('     A comment on the line BELOW does NOT satisfy the check.');
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] &&
  /check-gc1-pattern-a(\.ts)?$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  runCli();
}
