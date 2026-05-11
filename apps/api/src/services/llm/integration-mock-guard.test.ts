import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// [BUG-743 / T-1] Regression guard. Per CLAUDE.md "No Internal Mocks in
// Integration Tests": integration tests must not jest.mock internal modules
// (database, services, middleware) — only true external boundaries (Stripe,
// Clerk JWKS, email providers, push notifications). Internal mocks hide real
// prompt drift, envelope contract drift, and shape-of-response bugs.
//
// This guard fails if ANY new *.integration.test.ts file adds a jest.mock for
// the internal LLM router (`./llm`, `../llm`, `services/llm`). All former
// offenders have been migrated to the provider-registry pattern (registerProvider
// with a mock chat fn — see vocabulary.integration.test.ts for the pattern).

const KNOWN_OFFENDERS = new Set<string>([]);

function listIntegrationTests(): string[] {
  const repoRoot = resolve(__dirname, '../../../../..');
  // git ls-files is stable + fast and respects .gitignore.
  const out = execSync('git ls-files "apps/api/**/*.integration.test.ts"', {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  return out.split('\n').filter((line) => line.trim().length > 0);
}

function fileMocksInternalLlm(absPath: string): boolean {
  const source = readFileSync(absPath, 'utf-8');
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

describe('integration tests — BUG-743 internal LLM mock guard', () => {
  const repoRoot = resolve(__dirname, '../../../../..');
  const files = listIntegrationTests();

  it('finds at least one integration test (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not introduce NEW jest.mock(...llm) calls outside the known offender allowlist', () => {
    const offenders = files.filter((f) =>
      fileMocksInternalLlm(resolve(repoRoot, f)),
    );
    // Normalize separators so the test passes on Windows + POSIX.
    const offendersNormalized = offenders.map((f) => f.replace(/\\/g, '/'));
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
      files.some((g) => g.replace(/\\/g, '/') === f)
        ? fileMocksInternalLlm(resolve(repoRoot, f))
        : false,
    );
    expect(stillOffending.sort()).toEqual(Array.from(KNOWN_OFFENDERS).sort());
  });
});
