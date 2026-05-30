/**
 * Ratchet test for `jest.mock(...)` of the internal LLM router/index/envelope
 * in `*.integration.test.ts` files under `apps/api/src/`.
 *
 * Background (BUG-743 / T-1): Two integration tests previously did
 * `jest.mock('./llm')` / `jest.mock('../quiz/...')` which silenced the one
 * subsystem most likely to reveal prompt-schema drift, malformed envelope
 * parsing, or provider-fallback failures. Both sites have been migrated to the
 * HTTP-boundary mock pattern (intercept the provider SDK / `globalThis.fetch`
 * — never the internal `routeAndCall` router function).
 *
 * This guard is forward-only: any NEW `jest.mock('...llm/router')`,
 * `jest.mock('...llm/index')`, `jest.mock('...llm/envelope')`,
 * `jest.mock('...llm')` (bare relative), or `jest.mock('...routeAndCall...')`
 * line inside an apps/api/src integration test file fails CI.
 *
 * External-boundary mocks (the provider SDK packages like
 * `@anthropic-ai/sdk`, `@google/generative-ai`, bare-specifier `node-fetch`,
 * or whole-module `jest.mock('...llm/providers/...')`) remain allowed —
 * intercepting at the HTTP/SDK boundary is the canonical pattern (see
 * `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts`
 * for the `globalThis.fetch` interception variant).
 *
 * KNOWN_OFFENDERS (allowlist): empty. If a deferred migration ever needs to
 * land while a router mock still exists, add the repo-relative path here with
 * a citation explaining why migration is deferred and the tracking ticket.
 * The third assertion in this suite then enforces that listed files actually
 * still contain a router mock — so the allowlist shrinks automatically as
 * files are migrated.
 *
 * Canonical real-router pattern: `apps/api/eval-llm/` exercises the live
 * router and parses the envelope end-to-end; mirror that approach for any
 * new integration test that needs LLM behaviour.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/services/llm  →  repoRoot is 5 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

/**
 * Repo-relative paths (POSIX separators) of integration tests permitted to
 * keep an internal LLM-router `jest.mock`. Empty — both historical offenders
 * have been migrated. New entries require a citation + tracking ticket in the
 * comment header above.
 */
const KNOWN_OFFENDERS: ReadonlySet<string> = new Set<string>();

interface RouterMockSite {
  file: string; // repo-relative POSIX
  line: number; // 1-based
  spec: string; // the literal inside jest.mock('…')
}

/**
 * Match a `jest.mock(...)` first-argument string literal that targets the
 * internal LLM router/index/envelope/extract-json/stream-envelope modules.
 *
 * Hits:
 *   './llm'                ./llm/router          ./llm/index
 *   ../services/llm        ../../services/llm/router
 *   ../llm/envelope        ./routeAndCall (legacy convenience re-export)
 *
 * Does NOT hit:
 *   './llm/providers/anthropic'   (HTTP-boundary provider — allowed)
 *   '@anthropic-ai/sdk'           (external SDK — allowed)
 *   './llm/conversation-language' (pure data helper — allowed; not the router)
 */
function isInternalLlmRouterSpec(spec: string): boolean {
  // Strip surrounding quotes if any leaked through (defensive).
  const s = spec.replace(/^['"]|['"]$/g, '');
  // Only consider relative specifiers — bare specifiers are external by def.
  if (!s.startsWith('.')) return false;

  // Provider sub-paths are the HTTP boundary; allow them.
  if (/\/llm\/providers(\/|$)/.test(s)) return false;
  // Data-only helpers in the llm/ dir that are not the router are allowed.
  // The router-class modules:
  const ROUTER_MODULES = [
    /(^|\/)llm$/, //                 …/llm
    /(^|\/)llm\/router$/, //         …/llm/router
    /(^|\/)llm\/index$/, //          …/llm/index
    /(^|\/)llm\/envelope$/, //       …/llm/envelope
    /(^|\/)llm\/extract-json$/, //   …/llm/extract-json
    /(^|\/)llm\/stream-envelope$/, // …/llm/stream-envelope
    /(^|\/)routeAndCall$/, //        legacy convenience re-export
  ];
  return ROUTER_MODULES.some((rx) => rx.test(s));
}

function scanFile(absPath: string): RouterMockSite[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
  const sites: RouterMockSite[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'jest' &&
      node.expression.name.text === 'mock' &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]!)
    ) {
      const spec = (node.arguments[0] as ts.StringLiteralLike).text;
      if (isInternalLlmRouterSpec(spec)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        sites.push({
          file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
          line: line + 1,
          spec,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

function walkIntegrationTests(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkIntegrationTests(full, out);
    } else if (entry.isFile() && full.endsWith('.integration.test.ts')) {
      out.push(full);
    }
  }
}

describe('BUG-743 integration-mock router guard', () => {
  const files: string[] = [];
  walkIntegrationTests(API_SRC, files);

  const allSites: RouterMockSite[] = [];
  for (const f of files) allSites.push(...scanFile(f));

  it('scans at least one integration test file (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no internal LLM-router jest.mock() in any integration test (outside allowlist)', () => {
    const violations = allSites.filter((s) => !KNOWN_OFFENDERS.has(s.file));
    if (violations.length > 0) {
      const lines = violations
        .map((s) => `  ${s.file}:${s.line}  →  jest.mock('${s.spec}')`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} internal LLM-router jest.mock() call(s) in integration tests. ` +
          `Mocking the internal router hides prompt/envelope drift. ` +
          `Mock at the HTTP boundary instead (provider SDK or globalThis.fetch); ` +
          `see apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts ` +
          `and apps/api/eval-llm/ for the canonical real-router pattern.\n${lines}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it('allowlist shrinks as files are migrated — every allowlisted file still mocks', () => {
    // Forward-only ratchet: if an allowlisted file no longer contains a
    // router mock, it MUST be removed from KNOWN_OFFENDERS so the next
    // contributor cannot re-introduce a mock under that grandfather.
    const stillMocked = new Set(allSites.map((s) => s.file));
    const stale: string[] = [];
    for (const offender of KNOWN_OFFENDERS) {
      if (!stillMocked.has(offender)) stale.push(offender);
    }
    if (stale.length > 0) {
      throw new Error(
        `KNOWN_OFFENDERS contains files that no longer mock the router — remove them from the allowlist:\n` +
          stale.map((f) => `  ${f}`).join('\n'),
      );
    }
    expect(stale).toEqual([]);
  });

  // --- Self-checks: prove the scanner detects/ignores the right things. ---

  it('self-check: detects jest.mock("./llm")', () => {
    const synthetic = `
      jest.mock('./llm');
      describe('x', () => { it('y', () => { expect(1).toBe(1); }); });
    `;
    const sf = ts.createSourceFile(
      'synth-llm.integration.test.ts',
      synthetic,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let hits = 0;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'jest' &&
        node.expression.name.text === 'mock' &&
        node.arguments.length >= 1 &&
        ts.isStringLiteralLike(node.arguments[0]!) &&
        isInternalLlmRouterSpec(
          (node.arguments[0] as ts.StringLiteralLike).text,
        )
      ) {
        hits += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(hits).toBe(1);
  });

  it('self-check: detects jest.mock("../../services/llm/router")', () => {
    expect(isInternalLlmRouterSpec('../../services/llm/router')).toBe(true);
    expect(isInternalLlmRouterSpec('./llm/envelope')).toBe(true);
    expect(isInternalLlmRouterSpec('../llm')).toBe(true);
    expect(isInternalLlmRouterSpec('./routeAndCall')).toBe(true);
  });

  it('self-check: ignores external SDKs and provider sub-paths', () => {
    // External SDKs — bare specifiers, the HTTP boundary.
    expect(isInternalLlmRouterSpec('@anthropic-ai/sdk')).toBe(false);
    expect(isInternalLlmRouterSpec('@google/generative-ai')).toBe(false);
    expect(isInternalLlmRouterSpec('openai')).toBe(false);
    // Provider sub-paths — also the HTTP boundary.
    expect(isInternalLlmRouterSpec('./llm/providers/anthropic')).toBe(false);
    expect(isInternalLlmRouterSpec('../../services/llm/providers/gemini')).toBe(
      false,
    );
    // Unrelated relative paths.
    expect(isInternalLlmRouterSpec('./quiz/vocabulary')).toBe(false);
    expect(isInternalLlmRouterSpec('./session-summary')).toBe(false);
    expect(isInternalLlmRouterSpec('./llm/conversation-language')).toBe(false);
  });
});
