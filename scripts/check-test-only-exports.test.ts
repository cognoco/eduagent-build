/**
 * Forward-only ratchet (D-TTL-6).
 *
 * Test-only exports — symbols whose name ends in `ForTesting` or starts with
 * `__test` — must not be imported from production code. The dev-only Expo
 * Router screens under `apps/mobile/src/app/dev-only/seed-*.tsx` and
 * co-located `*.test.{ts,tsx}` files are the only allowed call sites.
 *
 * Mirrors GC1's structure: scan source for forbidden patterns, fail CI if any
 * new violation appears. Existing allowlist sites are explicitly enumerated.
 *
 * Scans every production source root — mobile, api, and each shared package
 * (apps/mobile/src, apps/api/src, packages/<name>/src) — so a test-only
 * import slipped into API or shared-package code is caught the same as one
 * in mobile. (Notion bug #806: previously scanned mobile only.)
 */

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { sync as globSync } from 'glob';

const REPO_ROOT = join(__dirname, '..');

// Production source roots scanned for forbidden test-only imports. Covers
// mobile, API, and every shared package — anything that can ship to a runtime
// needs to be guarded. Co-located test files are excluded by `isAllowed`;
// `packages/*/src` is enumerated via glob so a newly added package is picked
// up automatically without editing this file.
const PRODUCTION_ROOTS: string[] = [
  join(REPO_ROOT, 'apps', 'mobile', 'src'),
  join(REPO_ROOT, 'apps', 'api', 'src'),
  ...globSync('packages/*/src', { cwd: REPO_ROOT, absolute: true }),
];

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
  // Same runtime gate pattern as the pending redirect seeder, but for preview
  // onboarding TTL scenarios.
  ['apps', 'mobile', 'src', 'app', 'dev-only', 'seed-preview-state.tsx'].join(
    sep,
  ),
  // LLM test-support module (BUG-900): re-exports the LLM test helpers
  // (incl. `_setOpenAIAdvancedModelForTesting`) so tests import from one place
  // instead of the production `services/llm` barrel. Only `*.test.ts` files
  // import it — no production code does — so it is tree-shaken out of the
  // shipped Worker; it is test scaffolding, not a runtime call site.
  ['apps', 'api', 'src', 'services', 'llm', 'test-utils.ts'].join(sep),
  // The Maestro-only API worker registers a deterministic email transport so
  // hosted native flows can assert email receipts without contacting a vendor.
  // It is imported only by test-utils/maestro-e2e-worker.ts, never by the
  // production worker entry point.
  ['apps', 'api', 'src', 'test-utils', 'maestro-e2e-email-provider.ts'].join(
    sep,
  ),
]);

function isAllowed(relPath: string): boolean {
  // Co-located tests can always import test-only symbols.
  if (/\.test\.(ts|tsx)$/.test(relPath)) return true;
  return ALLOWLIST.has(relPath);
}

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

function scanRoots(roots: string[], repoRoot: string): Violation[] {
  const violations: Violation[] = [];
  for (const root of roots) {
    const files = globSync('**/*.{ts,tsx}', {
      cwd: root,
      absolute: true,
      ignore: ['**/node_modules/**'],
    });

    for (const absPath of files) {
      const relPath = relative(repoRoot, absPath);
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
  }
  return violations;
}

describe('test-only exports ratchet (D-TTL-6)', () => {
  it('production source files do not import __test* / *ForTesting symbols', () => {
    const violations = scanRoots(PRODUCTION_ROOTS, REPO_ROOT);

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

  it('regex matches an API-style import of a *ForTesting symbol', () => {
    // Confirms the regex (not just the file walk) flags the exact import
    // pattern that would appear in API production code, e.g. a route handler
    // pulling `_setOpenAIAdvancedModelForTesting` from the LLM router. The
    // scan-the-tree assertion above relies on this same regex against every
    // file in PRODUCTION_ROOTS, which now includes `apps/api/src`.
    const sample = `import { _setOpenAIAdvancedModelForTesting } from '../services/llm/router';`;
    TEST_ONLY_IMPORT_RE.lastIndex = 0;
    expect(TEST_ONLY_IMPORT_RE.exec(sample)).not.toBeNull();
  });

  it('regex matches a __test prefixed import (alternative naming)', () => {
    const sample = `import { __testResetCircuits } from '@eduagent/api/llm';`;
    TEST_ONLY_IMPORT_RE.lastIndex = 0;
    expect(TEST_ONLY_IMPORT_RE.exec(sample)).not.toBeNull();
  });

  it('PRODUCTION_ROOTS covers mobile, api, and packages', () => {
    // Proves the scanner is wired to all the right roots — guards against a
    // future refactor silently dropping API or packages coverage (the original
    // Notion bug #806 was exactly that: mobile-only scan).
    const rels = PRODUCTION_ROOTS.map((r) => relative(REPO_ROOT, r));
    expect(rels).toEqual(
      expect.arrayContaining([
        join('apps', 'mobile', 'src'),
        join('apps', 'api', 'src'),
      ]),
    );
    expect(rels.some((r) => r.startsWith(`packages${sep}`))).toBe(true);
  });
});
