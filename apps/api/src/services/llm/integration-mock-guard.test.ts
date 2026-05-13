import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

// [BUG-743 / T-1] Regression guard. Per CLAUDE.md "No Internal Mocks in
// Integration Tests": integration tests must not jest.mock internal modules
// (database, services, middleware) — only true external boundaries (Stripe,
// Sentry, Clerk JWKS, email providers, push notifications).
// Internal mocks hide real prompt drift, envelope contract drift, ownership,
// event-chain, and shape-of-response bugs.

const KNOWN_OFFENDERS = new Set<string>();
const ALLOWED_INTERNAL_BOUNDARY_MOCKS = [
  /(?:^|\/)services\/sentry$/,
  /(?:^|\/)services\/stripe$/,
];

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
    normalized === '@eduagent/database' ||
    normalized.startsWith('@eduagent/database/')
  );
}

function sourceInternalMockSpecifiers(source: string): string[] {
  const matches = source.matchAll(/jest\.mock\(\s*['"]([^'"]+)['"]/g);
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

describe('integration tests — BUG-743 internal mock guard', () => {
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
      sourceInternalMockSpecifiers(mockCallSnippet('../../inngest/client')),
    ).toEqual(['../../inngest/client']);
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
        `[BUG-743] New internal mock(s) found in integration tests:\n` +
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
