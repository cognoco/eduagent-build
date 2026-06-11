import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

// Integration-test internal-mock guard.
//
// Per AGENTS.md "No Internal Mocks in Integration Tests": integration tests
// must not jest.mock internal modules (database, services, middleware) — only
// true external boundaries. The set of internal module specifiers that are
// nonetheless treated as boundary stubs is `ALLOWED_INTERNAL_BOUNDARY_MOCKS`
// below; today that means Stripe, Sentry, and Inngest transport capture
// (`inngest/client` + `test-utils/inngest-transport-capture`).
//
// Other external boundaries — Clerk JWKS, LLM providers, email providers,
// push providers — are stubbed at the HTTP boundary (intercepting
// `globalThis.fetch`) or via bare-specifier package mocks, NOT by `jest.mock`
// on an internal `services/*` module. This guard therefore correctly flags
// internal service mocks such as `services/llm` as a violation even though the
// underlying provider call is "external" — the right escape hatch is to
// stub at the bare-specifier / fetch boundary, not in this allowlist.
//
// Internal mocks hide real prompt drift, envelope contract drift, ownership,
// event-chain, and shape-of-response bugs.
//
// Originally added as BUG-743 (LLM channel). Now scans every
// `*.integration.test.ts` file in `apps/api` and `tests/integration` for any
// internal jest.mock specifier and fails CI on non-allowlisted offenders.
// Forward-only: KNOWN_OFFENDERS is a shrinking punch list, never a permanent
// carve-out.

const KNOWN_OFFENDERS = new Set<string>();
// External-boundary mocks that integration tests MAY stub. Keep this in sync
// with the docstring above — the regexes are the operational contract; the
// docstring is documentation.
//
// BUG-307: the docstring promised Inngest transport capture as an allowed
// external boundary, but the regex list only carved out sentry+stripe. The
// Inngest client + transport-capture helper are now allowlisted so the
// promise the docstring makes is actually honored.
const ALLOWED_INTERNAL_BOUNDARY_MOCKS = [
  /(?:^|\/)services\/sentry$/,
  /(?:^|\/)services\/stripe$/,
  // Inngest transport capture — sanctioned sink for event dispatch in
  // integration tests that need to assert which downstream events fired.
  /(?:^|\/)inngest\/client$/,
  /(?:^|\/)test-utils\/inngest-transport-capture$/,
];

const REPO_ROOT = resolve(__dirname, '../../../..');
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

// Synchronous recursive directory walk over `apps/api` and `tests/integration`
// only — both are repo-owned source trees of bounded size (a few hundred
// `.integration.test.ts` files at most). `node:fs` `readdirSync` is acceptable
// here for three reasons:
//   1. The walk runs ONCE per Jest worker invocation of this guard test
//      (`describe` body, not per-`it`), so total syscall cost is amortised.
//   2. Bound: SKIPPED_DIRS excludes `node_modules`, `.git`, build outputs,
//      coverage — the directories that would otherwise dominate I/O.
//   3. Sync is required: Jest's `describe` block body is synchronous, and the
//      collected file list must be available before the `it` callbacks run
//      so each test can assert against the full inventory. Switching to
//      async fs would require restructuring the suite around `beforeAll`,
//      which buys nothing because the I/O is fast and not on a hot path.
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

function normalizeSpecifier(specifier: string): string {
  return normalizePath(specifier).replace(/\/index$/, '');
}

function isAllowedInternalBoundaryMock(specifier: string): boolean {
  const normalized = normalizeSpecifier(specifier);
  return ALLOWED_INTERNAL_BOUNDARY_MOCKS.some((pattern) =>
    pattern.test(normalized),
  );
}

function isInternalMockSpecifier(specifier: string): boolean {
  const normalized = normalizeSpecifier(specifier);
  if (isAllowedInternalBoundaryMock(normalized)) return false;

  return (
    normalized.startsWith('.') ||
    normalized.startsWith('@/') ||
    normalized.includes('/apps/api/src/') ||
    normalized.includes('apps/api/src/') ||
    // All @eduagent/* workspace packages are internal — mocking any of them in
    // an integration test hides real contract drift between the package and the
    // app code under test. Previously only @eduagent/database was listed; the
    // broader pattern catches @eduagent/schemas, @eduagent/api, etc.
    normalized.startsWith('@eduagent/')
  );
}

function sourceInternalMockSpecifiers(source: string): string[] {
  // BUG-306: jest.doMock has the same hoisting/scope risks as jest.mock for
  // internal modules — scan for both so the guard cannot be bypassed by
  // swapping `mock` for `doMock`.
  const matches = source.matchAll(
    /jest\.(?:mock|doMock)\(\s*['"]([^'"]+)['"]/g,
  );
  const specifiers: string[] = [];
  for (const match of matches) {
    const specifier = match[1];
    if (specifier && isInternalMockSpecifier(specifier)) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function fileInternalMockSpecifiers(absPath: string): string[] {
  return sourceInternalMockSpecifiers(readFileSync(absPath, 'utf-8'));
}

function mockCallSnippet(specifier: string): string {
  return `jest.${'mock'}('${specifier}', () => ({}));`;
}

function doMockCallSnippet(specifier: string): string {
  return `jest.${'doMock'}('${specifier}', () => ({}));`;
}

describe('integration tests — internal mock guard', () => {
  const files = listIntegrationTests();

  it('finds at least one integration test (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('detects internal mock specifiers without flagging allowed boundaries', () => {
    expect(sourceInternalMockSpecifiers(mockCallSnippet('./llm'))).toEqual([
      './llm',
    ]);
    expect(
      sourceInternalMockSpecifiers(
        mockCallSnippet('../../services/notifications'),
      ),
    ).toEqual(['../../services/notifications']);
    expect(
      sourceInternalMockSpecifiers(
        mockCallSnippet('../../services/llm/router'),
      ),
    ).toEqual(['../../services/llm/router']);
    expect(
      sourceInternalMockSpecifiers(mockCallSnippet('../../services/stripe')),
    ).toEqual([]);
    expect(
      sourceInternalMockSpecifiers(mockCallSnippet('../../services/sentry')),
    ).toEqual([]);
    expect(
      sourceInternalMockSpecifiers(mockCallSnippet('@eduagent/database')),
    ).toEqual(['@eduagent/database']);
    // All @eduagent/* workspace packages are internal — extend coverage beyond
    // the previously @eduagent/database-only check.
    expect(
      sourceInternalMockSpecifiers(mockCallSnippet('@eduagent/schemas')),
    ).toEqual(['@eduagent/schemas']);
    expect(
      sourceInternalMockSpecifiers(mockCallSnippet('@eduagent/api')),
    ).toEqual(['@eduagent/api']);
  });

  it('allows Inngest transport capture stubs (BUG-307)', () => {
    // The inngest client + transport-capture helper are the sanctioned sinks
    // for integration tests that need to assert which downstream events fired.
    expect(
      sourceInternalMockSpecifiers(mockCallSnippet('../../inngest/client')),
    ).toEqual([]);
    expect(
      sourceInternalMockSpecifiers(
        mockCallSnippet('../test-utils/inngest-transport-capture'),
      ),
    ).toEqual([]);
  });

  it('catches jest.doMock as well as jest.mock (BUG-306 break test)', () => {
    // Break test: pre-fix the regex only matched `jest.mock`, so swapping
    // in `jest.doMock` would silently bypass the guard. The expanded regex
    // catches both.
    expect(sourceInternalMockSpecifiers(doMockCallSnippet('./llm'))).toEqual([
      './llm',
    ]);
    expect(
      sourceInternalMockSpecifiers(
        doMockCallSnippet('../../services/notifications'),
      ),
    ).toEqual(['../../services/notifications']);
    // Allowed boundary still allowed under doMock.
    expect(
      sourceInternalMockSpecifiers(doMockCallSnippet('../../services/sentry')),
    ).toEqual([]);
  });

  it('does not introduce non-allowlisted internal jest.mock calls in integration tests', () => {
    const offenders = files.flatMap((f) =>
      fileInternalMockSpecifiers(resolve(REPO_ROOT, f)).map((specifier) => ({
        file: normalizePath(f),
        specifier,
      })),
    );
    const newOffenders = offenders.filter((o) => !KNOWN_OFFENDERS.has(o.file));
    if (newOffenders.length > 0) {
      throw new Error(
        `New internal mock(s) found in integration tests:\n` +
          newOffenders
            .map((o) => `  - ${o.file}: jest.mock('${o.specifier}')`)
            .join('\n') +
          `\n\nIntegration tests must mock at the HTTP boundary (intercept ` +
          `globalThis.fetch for provider URLs), the provider registry, or a ` +
          `documented transport sink — not jest.mock internal services.`,
      );
    }
  });

  it('shrinks the offender allowlist as files are migrated', () => {
    // The allowlist is a punch list, not an indefinite carve-out. If a listed
    // file no longer mocks internals, remove it from KNOWN_OFFENDERS — this
    // assertion enforces that.
    const stillOffending = Array.from(KNOWN_OFFENDERS).filter((f) =>
      files.some((g) => normalizePath(g) === f)
        ? fileInternalMockSpecifiers(resolve(REPO_ROOT, f)).length > 0
        : false,
    );
    expect(stillOffending.sort()).toEqual(Array.from(KNOWN_OFFENDERS).sort());
  });
});
