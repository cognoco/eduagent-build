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
  LLM_CALL_SITE_FILES,
  LLM_CALL_SITE_EXEMPT,
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
  const rel = relative(REPO_ROOT, absolutePath);
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
