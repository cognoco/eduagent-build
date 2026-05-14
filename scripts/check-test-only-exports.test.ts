/**
 * Forward-only ratchet (D-TTL-6).
 *
 * Test-only exports — symbols whose name ends in `ForTesting` or starts with
 * `__test` — must not be imported from production code. The dev-only Expo
 * Router screen at `apps/mobile/src/app/dev-only/seed-pending-redirect.tsx` and
 * co-located `*.test.{ts,tsx}` files are the only allowed call sites.
 *
 * Mirrors GC1's structure: scan source for forbidden patterns, fail CI if any
 * new violation appears. Existing allowlist sites are explicitly enumerated.
 */

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { sync as globSync } from 'glob';

const REPO_ROOT = join(__dirname, '..');
const MOBILE_SRC = join(REPO_ROOT, 'apps', 'mobile', 'src');

const TEST_ONLY_IMPORT_RE =
  /import\s+[^;]*?(?:\b__test\w+|\b\w+ForTesting)\b[^;]*?from/gs;

/** Files allowed to import test-only symbols, relative to the repo root. */
const ALLOWLIST = new Set([
  // The dev-only Expo Router screen registers the seed route. EXPO_PUBLIC_E2E
  // gates the call site at runtime; this list documents the build-time gate.
  [
    'apps',
    'mobile',
    'src',
    'app',
    'dev-only',
    'seed-pending-redirect.tsx',
  ].join(sep),
]);

function isAllowed(relPath: string): boolean {
  // Co-located tests can always import test-only symbols.
  if (/\.test\.(ts|tsx)$/.test(relPath)) return true;
  return ALLOWLIST.has(relPath);
}

describe('test-only exports ratchet (D-TTL-6)', () => {
  it('production source files do not import __test* / *ForTesting symbols', () => {
    const files = globSync('**/*.{ts,tsx}', {
      cwd: MOBILE_SRC,
      absolute: true,
      ignore: ['**/node_modules/**'],
    });

    const violations: { file: string; line: number; snippet: string }[] = [];

    for (const absPath of files) {
      const relPath = relative(REPO_ROOT, absPath);
      if (isAllowed(relPath)) continue;

      const content = readFileSync(absPath, 'utf8');
      TEST_ONLY_IMPORT_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TEST_ONLY_IMPORT_RE.exec(content)) !== null) {
        const before = content.slice(0, match.index);
        const line = before.split('\n').length;
        violations.push({
          file: relPath,
          line,
          snippet: match[0].replace(/\s+/g, ' ').slice(0, 120),
        });
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.snippet}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} forbidden test-only import(s) in production code:\n${msg}\n\n` +
          `If you need to add a new allowed site, edit scripts/check-test-only-exports.test.ts ALLOWLIST.`,
      );
    }

    expect(violations).toEqual([]);
  });

  it('detects an artificial violation (self-test of the regex)', () => {
    const sample = `import { seedPendingAuthRedirectForTesting } from '../lib/pending-auth-redirect';`;
    TEST_ONLY_IMPORT_RE.lastIndex = 0;
    expect(TEST_ONLY_IMPORT_RE.exec(sample)).not.toBeNull();
  });

  it('does not flag unrelated imports', () => {
    const sample = `import { peekPendingAuthRedirect } from '../lib/pending-auth-redirect';`;
    TEST_ONLY_IMPORT_RE.lastIndex = 0;
    expect(TEST_ONLY_IMPORT_RE.exec(sample)).toBeNull();
  });
});
