import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

// [BUG-743 / T-1] Regression guard. Per CLAUDE.md "No Internal Mocks in
// Integration Tests": integration tests must not jest.mock internal modules
// (database, services, middleware) — only true external boundaries (Stripe,
// Clerk JWKS, email providers, push notifications). Internal mocks hide real
// prompt drift, envelope contract drift, and shape-of-response bugs.
//
// This guard fails if ANY new *.integration.test.ts file adds a jest.mock for
// the internal LLM router (`./llm`, `../llm`, `services/llm`). The right
// pattern is to intercept globalThis.fetch for HTTP SDKs, or register a
// provider in the LLM provider registry when the service boundary is the router.

const KNOWN_OFFENDERS = new Set<string>([
  // PR #211: book-suggestion generation mocks `./llm` to stub routeAndCall.
  // The inline `gc1-allow` annotation exempts it from the GC1 ratchet but not
  // BUG-743 — that's deliberate; BUG-743's invariant is HTTP-boundary mocking
  // specifically. Convert in a follow-up PR.
  'apps/api/src/services/book-suggestion-generation.integration.test.ts',
]);

const REPO_ROOT = resolve(__dirname, '../../../../..');
const INTEGRATION_TEST_ROOTS = ['apps/api', 'tests/integration'];
const SKIPPED_DIRS = new Set([
  '.git',
  '.nx',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function collectIntegrationTests(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        collectIntegrationTests(resolve(dir, entry.name), files);
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.integration.test.ts')) {
      files.push(normalizePath(relative(REPO_ROOT, resolve(dir, entry.name))));
    }
  }
}

function listIntegrationTests(): string[] {
  const files: string[] = [];
  for (const root of INTEGRATION_TEST_ROOTS) {
    const absRoot = resolve(REPO_ROOT, root);
    if (existsSync(absRoot)) {
      collectIntegrationTests(absRoot, files);
    }
  }
  return files.sort();
}

function sourceMocksInternalLlm(source: string): boolean {
  // Catches all internal-LLM mock forms:
  //   jest.mock('./llm', ...)
  //   jest.mock('../../services/llm/router', ...)
  //   jest.mock('@eduagent/llm-router', ...)        ← package name
  //   jest.mock('@/services/llm', ...)              ← TS path alias
  // A specifier is internal-LLM if any '/'-separated segment is `llm` or
  // contains `llm` as a hyphen-or-edge token (`llm-router`, `eval-llm`).
  const matches = source.matchAll(/jest\.mock\(\s*['"]([^'"]+)['"]/g);
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier) continue;
    const segments = specifier.split('/');
    if (segments.some((seg) => /(?:^|-)llm(?:-|$)/.test(seg))) {
      return true;
    }
  }
  return false;
}

function fileMocksInternalLlm(absPath: string): boolean {
  return sourceMocksInternalLlm(readFileSync(absPath, 'utf-8'));
}

function mockCallSnippet(specifier: string): string {
  return `jest.${'mock'}('${specifier}', () => ({}));`;
}

describe('integration tests — BUG-743 internal LLM mock guard', () => {
  const files = listIntegrationTests();

  it('finds at least one integration test (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('detects internal LLM mock specifiers without flagging external mocks', () => {
    expect(sourceMocksInternalLlm(mockCallSnippet('./llm'))).toBe(true);
    expect(
      sourceMocksInternalLlm(mockCallSnippet('../../services/llm/router')),
    ).toBe(true);
    expect(
      sourceMocksInternalLlm(mockCallSnippet('../../services/stripe')),
    ).toBe(false);
  });

  it('does not introduce NEW jest.mock(...llm) calls outside the known offender allowlist', () => {
    const offenders = files.filter((f) =>
      fileMocksInternalLlm(resolve(REPO_ROOT, f)),
    );
    // Normalize separators so the test passes on Windows + POSIX.
    const offendersNormalized = offenders.map(normalizePath);
    const newOffenders = offendersNormalized.filter(
      (f) => !KNOWN_OFFENDERS.has(f),
    );
    if (newOffenders.length > 0) {
      throw new Error(
        `[BUG-743] New internal LLM mock(s) found in integration tests:\n` +
          newOffenders.map((f) => `  - ${f}`).join('\n') +
          `\n\nIntegration tests must mock at the HTTP boundary (intercept ` +
          `globalThis.fetch for provider URLs) — not jest.mock internal ` +
          `services. See weekly-progress-push.integration.test.ts for the ` +
          `right pattern.`,
      );
    }
  });

  it('shrinks the offender allowlist as files are migrated', () => {
    // The allowlist is a punch list, not an indefinite carve-out. If a listed
    // file no longer mocks LLM internals (it was migrated to HTTP-boundary
    // mocking), remove it from KNOWN_OFFENDERS — this assertion enforces that.
    const stillOffending = Array.from(KNOWN_OFFENDERS).filter((f) =>
      files.some((g) => normalizePath(g) === f)
        ? fileMocksInternalLlm(resolve(REPO_ROOT, f))
        : false,
    );
    expect(stillOffending.sort()).toEqual(Array.from(KNOWN_OFFENDERS).sort());
  });
});
