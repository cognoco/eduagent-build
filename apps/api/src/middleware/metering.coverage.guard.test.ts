// ---------------------------------------------------------------------------
// [WI-132] Manifest-based coverage guard for LLM call sites
//
// Pragmatic alternative to a full AST walker:
//
//   1. Discovery completeness — scan apps/api/src for any production file
//      that imports/invokes routeAndCall or routeAndStream. The resulting
//      set must equal LLM_CALL_SITE_FILES ∪ LLM_CALL_SITE_EXEMPT. A new LLM
//      call site cannot land without being explicitly classified.
//
//   2. Manifest staleness — every entry currently in the two lists must
//      still contain an LLM provider invocation. If a file no longer calls
//      the LLM, it must be removed from the manifest in the same PR so
//      humans don't read it as still-protected.
//
//   3. No overlap — a file appears in at most one list.
//
// Excluded from the scan (with rationale):
//   - Test files (*.test.ts, *.test.tsx).
//   - Test utilities (any path matching /test-utils/).
//   - services/llm/* — the router implementation itself is the LLM
//     boundary; the call sites in router.ts are the inner machinery, not
//     the per-feature invocations that need quota gating.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import {
  GRANULAR_LLM_CONSENT_BOUNDARIES,
  LLM_CALL_SITE_FILES,
  LLM_CALL_SITE_EXEMPT,
  ROUTE_OWNED_LLM_CONSENT_BOUNDARIES,
} from './metering.coverage.manifest';

// Jest rootDir is the repo root. process.cwd() during jest execution may be
// either the repo root (CI) or a worktree (local). Both resolve "apps/api/src"
// the same way. We anchor at the repo root by walking up until we find
// pnpm-workspace.yaml.
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      statSync(join(dir, 'pnpm-workspace.yaml'));
      return dir;
    } catch {
      // continue walking up
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: best-effort.
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const SRC_ROOT = join(REPO_ROOT, 'apps/api/src');

const LLM_CALL_REGEX = /\b(?:routeAndCall|routeAndStream)\b/;

// Files to skip during scan. Keep in sync with the rationale comment above.
function shouldSkipFile(absolutePath: string): boolean {
  const rel = relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return true;
  if (rel.includes('/test-utils/')) return true;
  // services/llm/* is the LLM router implementation. Its internal call sites
  // are not feature-level invocations that need quota gating.
  if (rel.startsWith('apps/api/src/services/llm/')) return true;
  // Coverage manifest + guard themselves reference the regex tokens in
  // comments/string-literals — skip to avoid self-matching.
  if (rel === 'apps/api/src/middleware/metering.coverage.manifest.ts')
    return true;
  if (rel === 'apps/api/src/middleware/metering.coverage.guard.test.ts')
    return true;
  return false;
}

function walk(dir: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (!shouldSkipFile(full)) out.push(full);
    }
  }
}

function scanCallSites(): Set<string> {
  const allFiles: string[] = [];
  walk(SRC_ROOT, allFiles);
  const matches = new Set<string>();
  for (const file of allFiles) {
    const contents = readFileSync(file, 'utf8');
    if (LLM_CALL_REGEX.test(contents)) {
      matches.add(relative(REPO_ROOT, file).replace(/\\/g, '/'));
    }
  }
  return matches;
}

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function sliceBetweenTokens(
  source: string,
  startToken: string,
  endToken: string,
): string {
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Missing start token: ${startToken}`);
  if (!endToken) return source.slice(start);
  const end = source.indexOf(endToken, start + startToken.length);
  if (end < 0) throw new Error(`Missing end token: ${endToken}`);
  return source.slice(start, end);
}

function boundsBetweenTokens(
  source: string,
  startToken: string,
  endToken: string,
): { start: number; end: number } {
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Missing start token: ${startToken}`);
  if (!endToken) return { start, end: source.length };
  const end = source.indexOf(endToken, start + startToken.length);
  if (end < 0) throw new Error(`Missing end token: ${endToken}`);
  return { start, end };
}

interface RouteConsentAssertion {
  file: string;
  index: number;
}

function scanRouteConsentAssertions(): RouteConsentAssertion[] {
  const routeFiles: string[] = [];
  walk(join(SRC_ROOT, 'routes'), routeFiles);
  const assertions: RouteConsentAssertion[] = [];
  const assertionRegex = /\bawait\s+assertLlmConsent\s*\(/g;
  for (const absolutePath of routeFiles) {
    const source = readFileSync(absolutePath, 'utf8');
    for (const match of source.matchAll(assertionRegex)) {
      if (match.index === undefined) {
        throw new Error(
          `Consent assertion match had no index: ${absolutePath}`,
        );
      }
      assertions.push({
        file: relative(REPO_ROOT, absolutePath).replace(/\\/g, '/'),
        index: match.index,
      });
    }
  }
  return assertions;
}

describe('[WI-132] LLM call-site coverage manifest', () => {
  const discovered = scanCallSites();
  const covered = new Set(LLM_CALL_SITE_FILES);
  const exempt = new Set(LLM_CALL_SITE_EXEMPT);

  it('every discovered LLM call site is classified in one of the manifest lists', () => {
    const unclassified: string[] = [];
    for (const file of discovered) {
      if (!covered.has(file) && !exempt.has(file)) {
        unclassified.push(file);
      }
    }
    if (unclassified.length > 0) {
      const message = [
        'The following files invoke routeAndCall or routeAndStream but',
        'are not classified in apps/api/src/middleware/metering.coverage.manifest.ts.',
        'Add each path to either LLM_CALL_SITE_FILES (covered by the',
        'metering allowlist) or LLM_CALL_SITE_EXEMPT (background jobs, test',
        'seed routes, etc. — must include a justification comment).',
        '',
        ...unclassified.map((f) => `  - ${f}`),
      ].join('\n');
      throw new Error(message);
    }
  });

  it('every listed file in LLM_CALL_SITE_FILES still contains an LLM call (no stale entries)', () => {
    const stale: string[] = [];
    for (const file of LLM_CALL_SITE_FILES) {
      if (!discovered.has(file)) stale.push(file);
    }
    if (stale.length > 0) {
      throw new Error(
        [
          'The following files are listed in LLM_CALL_SITE_FILES but no longer',
          'contain a routeAndCall or routeAndStream invocation. Remove them',
          'from the manifest so reviewers do not read them as still-protected.',
          '',
          ...stale.map((f) => `  - ${f}`),
        ].join('\n'),
      );
    }
  });

  it('every listed file in LLM_CALL_SITE_EXEMPT still contains an LLM call (no stale entries)', () => {
    const stale: string[] = [];
    for (const file of LLM_CALL_SITE_EXEMPT) {
      if (!discovered.has(file)) stale.push(file);
    }
    if (stale.length > 0) {
      throw new Error(
        [
          'The following files are listed in LLM_CALL_SITE_EXEMPT but no longer',
          'contain a routeAndCall or routeAndStream invocation. Remove them',
          'from the manifest so the exempt list does not accumulate dead',
          'entries.',
          '',
          ...stale.map((f) => `  - ${f}`),
        ].join('\n'),
      );
    }
  });

  it('no file appears in both LLM_CALL_SITE_FILES and LLM_CALL_SITE_EXEMPT', () => {
    const overlap: string[] = [];
    for (const file of LLM_CALL_SITE_FILES) {
      if (exempt.has(file)) overlap.push(file);
    }
    expect(overlap).toEqual([]);
  });
});

describe('[WI-2543] mixed-route granular consent boundaries', () => {
  it('uses unique IDs across the request-time consent classification', () => {
    const ids = [
      ...ROUTE_OWNED_LLM_CONSENT_BOUNDARIES.map(({ id }) => id),
      ...GRANULAR_LLM_CONSENT_BOUNDARIES.map(({ id }) => id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('[WI-2989] classifies recall consent after deterministic cooldown and claim exits', () => {
    expect(
      ROUTE_OWNED_LLM_CONSENT_BOUNDARIES.find(
        ({ id }) => id === 'retention.recall-test',
      ),
    ).toBeUndefined();

    const routeBoundary = GRANULAR_LLM_CONSENT_BOUNDARIES.find(
      ({ id }) => id === 'retention.recall-test',
    );
    expect(routeBoundary).toBeDefined();
    if (!routeBoundary) return;

    expect(routeBoundary.routeServiceCallTokens).toContain(
      'processRecallTest(',
    );
    const serviceBoundary = routeBoundary.serviceBoundaries[0] as
      | ((typeof routeBoundary.serviceBoundaries)[number] & {
          preConsentBranchTokens?: readonly string[];
        })
      | undefined;
    expect(serviceBoundary).toBeDefined();
    if (!serviceBoundary) return;

    expect(serviceBoundary.preConsentBranchTokens).toEqual([
      'if (!canRetestTopic(state, lastTestAt)) {',
      "if (attemptMode !== 'dont_remember') {",
      'if (!claimed) {',
    ]);
    const serviceSource = sliceBetweenTokens(
      readRepoFile(serviceBoundary.serviceFile),
      serviceBoundary.serviceStartToken,
      serviceBoundary.serviceEndToken,
    );
    const gateIndex = serviceSource.indexOf(serviceBoundary.consentGateToken);
    for (const token of serviceBoundary.preConsentBranchTokens ?? []) {
      expect(serviceSource.indexOf(token)).toBeGreaterThanOrEqual(0);
      expect(serviceSource.indexOf(token)).toBeLessThan(gateIndex);
    }
  });

  it('[WI-2990] classifies quick-check consent after ownership hiding and before dispatch', () => {
    const routeBoundary = ROUTE_OWNED_LLM_CONSENT_BOUNDARIES.find(
      ({ id }) => id === 'assessments.quick-check',
    );
    expect(routeBoundary).toBeDefined();
    if (!routeBoundary) return;

    expect(routeBoundary.classification).toBe('route-owned');
    expect(routeBoundary.preConsentBranchTokens).toEqual([
      'const session = await getSession(',
      "if (!session) return notFound(c, 'Session not found');",
    ]);
    expect(routeBoundary.consentGateToken).toBe('await assertLlmConsent(');
    expect(routeBoundary.llmDispatchTokens).toEqual([
      'await evaluateQuickCheckAnswer(',
    ]);
    expect(routeBoundary.llmCallSiteFile).toBe(
      'apps/api/src/services/assessments.ts',
    );

    const routeSource = sliceBetweenTokens(
      readRepoFile(routeBoundary.routeFile),
      routeBoundary.routeStartToken,
      routeBoundary.routeEndToken,
    );
    const gateIndex = routeSource.indexOf(routeBoundary.consentGateToken ?? '');
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    for (const token of routeBoundary.preConsentBranchTokens ?? []) {
      expect(routeSource.indexOf(token)).toBeGreaterThanOrEqual(0);
      expect(routeSource.indexOf(token)).toBeLessThan(gateIndex);
    }
    for (const token of routeBoundary.llmDispatchTokens ?? []) {
      expect(routeSource.indexOf(token)).toBeGreaterThan(gateIndex);
    }
    expect(LLM_CALL_SITE_FILES).toContain(routeBoundary.llmCallSiteFile);
  });

  it('[WI-2987] classifies dictation review consent after deterministic rate and prompt-budget exits', () => {
    const boundary = ROUTE_OWNED_LLM_CONSENT_BOUNDARIES.find(
      ({ id }) => id === 'dictation.review',
    ) as
      | ((typeof ROUTE_OWNED_LLM_CONSENT_BOUNDARIES)[number] & {
          preConsentBranchTokens?: readonly string[];
          consentGateToken?: string;
          llmDispatchTokens?: readonly string[];
        })
      | undefined;
    expect(boundary).toBeDefined();
    if (!boundary) return;

    expect(boundary).toMatchObject({
      classification: 'route-owned',
      preConsentBranchTokens: [
        'const rateLimited = await checkAndLogRateLimit(',
        'if (rateLimited) {',
        'if (promptCharCount > DICTATION_REVIEW_MAX_PROMPT_CHARS) {',
      ],
      consentGateToken: 'await assertLlmConsent(',
      llmDispatchTokens: ['const result = await reviewDictation({'],
    });

    const routeSource = sliceBetweenTokens(
      readRepoFile(boundary.routeFile),
      boundary.routeStartToken,
      boundary.routeEndToken,
    );
    const gateIndex = routeSource.indexOf(boundary.consentGateToken ?? '');
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    for (const token of boundary.preConsentBranchTokens ?? []) {
      expect(routeSource.indexOf(token)).toBeGreaterThanOrEqual(0);
      expect(routeSource.indexOf(token)).toBeLessThan(gateIndex);
    }
    for (const token of boundary.llmDispatchTokens ?? []) {
      expect(routeSource.indexOf(token)).toBeGreaterThan(gateIndex);
    }
  });

  it('requires an explicit rationale for every remaining route-entry gate', () => {
    for (const boundary of ROUTE_OWNED_LLM_CONSENT_BOUNDARIES) {
      expect({
        id: boundary.id,
        classification: boundary.classification,
        hasRationale: boundary.rationale.trim().length > 0,
      }).toEqual({
        id: boundary.id,
        classification: expect.stringMatching(
          /^(route-owned|route-discriminant|independent-mixed-residue)$/,
        ),
        hasRationale: true,
      });
    }
  });

  it('classifies every production route-entry consent assertion exactly once', () => {
    const assertions = scanRouteConsentAssertions();
    const sources = new Map<string, string>();
    const segmentBounds = ROUTE_OWNED_LLM_CONSENT_BOUNDARIES.map((boundary) => {
      const source =
        sources.get(boundary.routeFile) ?? readRepoFile(boundary.routeFile);
      sources.set(boundary.routeFile, source);
      return {
        ...boundary,
        ...boundsBetweenTokens(
          source,
          boundary.routeStartToken,
          boundary.routeEndToken,
        ),
      };
    });

    const invalid = assertions.flatMap((assertion) => {
      const owners = segmentBounds.filter(
        (boundary) =>
          boundary.routeFile === assertion.file &&
          assertion.index >= boundary.start &&
          assertion.index < boundary.end,
      );
      return owners.length === 1
        ? []
        : [`${assertion.file}@${assertion.index}: owners=${owners.length}`];
    });
    expect(invalid).toEqual([]);

    for (const boundary of segmentBounds) {
      const ownedCount = assertions.filter(
        (assertion) =>
          assertion.file === boundary.routeFile &&
          assertion.index >= boundary.start &&
          assertion.index < boundary.end,
      ).length;
      expect({ id: boundary.id, ownedCount }).toEqual({
        id: boundary.id,
        ownedCount: 1,
      });
    }
  });

  it.each(GRANULAR_LLM_CONSENT_BOUNDARIES)(
    '$id delegates without an unconditional route-entry consent gate',
    (boundary) => {
      const routeSource = sliceBetweenTokens(
        readRepoFile(boundary.routeFile),
        boundary.routeStartToken,
        boundary.routeEndToken,
      );
      expect(routeSource).not.toContain('assertLlmConsent(');
      for (const callToken of boundary.routeServiceCallTokens) {
        expect(routeSource).toContain(callToken);
      }
    },
  );

  it.each(
    GRANULAR_LLM_CONSENT_BOUNDARIES.flatMap((routeBoundary) =>
      routeBoundary.serviceBoundaries.map((serviceBoundary) => ({
        id: routeBoundary.id,
        ...serviceBoundary,
      })),
    ),
  )(
    '$id gates before $llmDispatchToken and stays tied to the LLM manifest',
    (boundary) => {
      const serviceSource = sliceBetweenTokens(
        readRepoFile(boundary.serviceFile),
        boundary.serviceStartToken,
        boundary.serviceEndToken,
      );
      const gateIndex = serviceSource.indexOf(boundary.consentGateToken);
      const dispatchIndex = serviceSource.indexOf(boundary.llmDispatchToken);
      expect(gateIndex).toBeGreaterThanOrEqual(0);
      expect(dispatchIndex).toBeGreaterThan(gateIndex);
      expect(LLM_CALL_SITE_FILES).toContain(boundary.llmCallSiteFile);
    },
  );
});
