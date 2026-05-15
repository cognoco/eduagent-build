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

export type Violation = {
  file: string;
  line: number;
  content: string;
  reason: 'missing-pattern-a' | 'invalid-mock';
};

const MOCK_LINE = /jest\.(?:mock|doMock)\(\s*['"`](\.\.?\/[^'"`]+)['"`]/;
const GC1_ALLOW = /gc1-allow/i;

export function extractSpecifier(line: string): string | null {
  const m = line.match(MOCK_LINE);
  return m?.[1] ?? null;
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
  // Match `jest.requireActual('<spec>'` — leave the trailing `)` open so the
  // multi-line form `jest.requireActual(\n  '<spec>',\n) as typeof import(...)`
  // still matches (trailing comma + type cast wrap the call).
  const requireActualRe = new RegExp(
    `jest\\.requireActual\\(\\s*['"\`]${escapedSpec}['"\`]`,
  );
  if (!requireActualRe.test(window)) return false;

  if (
    new RegExp(
      `\\.\\.\\.\\s*jest\\.requireActual\\(\\s*['"\`]${escapedSpec}`,
    ).test(window)
  ) {
    return true;
  }

  const namedAssignRe = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*jest\\.requireActual\\(\\s*['"\`]${escapedSpec}`,
  );
  const m = window.match(namedAssignRe);
  if (m) {
    const name = m[1];
    const spreadRe = new RegExp(`\\.\\.\\.\\s*${name}\\b`);
    if (spreadRe.test(window)) return true;
  }

  return false;
}

export type StagedMockSite = { line: number; content: string };

// Parse a `git diff --cached --unified=0` patch (already filtered to one file)
// and return new-file line numbers of any added `jest.mock('./...')` lines.
export function findAddedMockLines(unifiedDiff: string): StagedMockSite[] {
  const lines = unifiedDiff.split('\n');
  const sites: StagedMockSite[] = [];
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
      const content = ln.slice(1);
      if (MOCK_LINE.test(content)) {
        sites.push({ line: cur, content });
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
  const sites = findAddedMockLines(unifiedDiff);
  if (sites.length === 0) return [];
  const lines = stagedSrc.split('\n');
  const violations: Violation[] = [];
  for (const { line, content } of sites) {
    if (GC1_ALLOW.test(content)) continue;
    const spec = extractSpecifier(content);
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
    '  1. Convert to Pattern A (preferred — see CLAUDE.md GC1 ratchet).',
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
