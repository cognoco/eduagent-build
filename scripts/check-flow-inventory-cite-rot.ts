// scripts/check-flow-inventory-cite-rot.ts
//
// Cite-rot guard for docs/flows/mobile-app-flow-inventory.md (WI-2198 AC-7).
// The inventory's ~280 rows cite source files (with or without `:line` /
// `:start-end`), Playwright specs, Maestro flow yamls, and eas.json — every
// citation is backtick-quoted. This is the "consistency check" the AC's
// preamble calls for: it flags rows whose declared shell/flag state cites a
// file or line that no longer exists, i.e. exactly the "stale referenced test
// files/routes" clause.
//
// Resolution model — deliberately basename-based, not exact-path:
//   The doc's own citation convention is inconsistent about directory
//   prefixes (a Coverage cell often reads `auth/sign-in.yaml`, `-devclient.yaml`
//   listing siblings by suffix, or a bare `session-exchange.ts:556` with no
//   path at all). Requiring an exact relative path would either reject the
//   doc's own shorthand or need a second, fragile parser for it. Instead:
//   resolve each citation's basename against every file in the repo under
//   SEARCH_ROOTS, and pass if ANY candidate satisfies the (optional) line
//   count. This is permissive on directory ambiguity but strict on the
//   failure mode that actually matters here — a deleted/renamed file, or a
//   line range past current EOF.
//
// Two token shapes are intentionally NOT resolved as standalone citations:
//   - Suffix shorthand (`-phone.yaml` following a full sibling path in the
//     same list, e.g. `sso-in-mfa-email-code.yaml`, `-phone.yaml`, ...) — not
//     a real filename, a doc-authoring convention for "same prefix, different
//     suffix". Skipped (token startsWith('-')).
//   - Glob-style citations (`retention/topic-detail*.yaml`) are resolved by
//     matching the `*` against real basenames rather than requiring an exact
//     file, since the doc uses `*` to mean "one of several concrete files".
//
// Usage:
//   pnpm tsx scripts/check-flow-inventory-cite-rot.ts
//
// Exit codes:
//   0 — every citation resolves
//   1 — at least one citation is stale (missing file / line past EOF / no
//       basename matches a glob)

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
export const DOC_PATH = path.resolve(
  REPO_ROOT,
  'docs/flows/mobile-app-flow-inventory.md',
);

// Citations in this doc only ever point into these trees (code, tests, e2e
// manifests, the eas.json build-flag file, the CI workflow that sets
// build-time nav flags for the OTA env, and repo-root guard scripts like this
// one's own siblings) — never into docs/ itself or other tooling config, so
// the index stays small and the walk stays fast.
const SEARCH_ROOTS = [
  'apps/mobile',
  'apps/api',
  'packages',
  '.github',
  'scripts',
];
const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.expo',
  '.turbo',
  'dist',
  'build',
  'coverage',
]);

const RESOLVABLE_EXT_RE = /\.(tsx?|ya?ml|json)$/;
// Matches a trailing `:N`, `:N-M`, or a comma-separated run of either
// (`:67,77`, `:793-798,828-861`) — the doc cites several disjoint spots in
// one file this way (e.g. multiple call sites of the same function).
const LINE_SUFFIX_RE = /:([\d,-]+)$/;

export interface Citation {
  raw: string;
  filePath: string;
  isGlob: boolean;
  startLine?: number;
  endLine?: number;
}

/** Pure: classify one backtick token, or return null if it isn't a
 * resolvable file citation (shorthand suffix, prose, a bare route/flag name,
 * an unresolvable extension). */
export function classifyToken(token: string): Citation | null {
  if (token.startsWith('-')) return null; // suffix shorthand, not standalone
  if (/\s/.test(token)) return null; // prose slipped into backticks
  const lineMatch = token.match(LINE_SUFFIX_RE);
  const filePath = lineMatch ? token.slice(0, lineMatch.index) : token;
  if (!RESOLVABLE_EXT_RE.test(filePath)) return null;
  // A citation may name several line numbers/ranges in one file; the only
  // thing that matters for "does this citation still resolve" is whether the
  // file has at least as many lines as the HIGHEST one named (we don't
  // verify which symbol sits at which line, just that nothing points past
  // current EOF) — so startLine is the first number (cosmetic, for
  // reporting) and endLine is the max (the actual bound checked).
  const lineNumbers = lineMatch
    ? lineMatch[1].match(/\d+/g)?.map(Number)
    : undefined;
  return {
    raw: token,
    filePath,
    isGlob: filePath.includes('*'),
    startLine: lineNumbers?.[0],
    endLine: lineNumbers ? Math.max(...lineNumbers) : undefined,
  };
}

/** Pure: every backtick-quoted token in the doc body, in document order,
 * deduplicated. */
export function extractBacktickTokens(docBody: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of docBody.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1];
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export interface FileIndex {
  byBasename: Map<string, string[]>;
}

function walk(dir: string, relRoot: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.join(relRoot, entry.name);
    if (entry.isDirectory()) {
      walk(abs, rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

/** Builds the basename → relPath[] index once, from SEARCH_ROOTS plus
 * apps/mobile/eas.json (a single file the matrix cites directly, outside the
 * recursive walk roots' natural reach — it IS inside apps/mobile, so this is
 * just documenting that it's covered, not a special case). */
export function buildFileIndex(repoRoot: string): FileIndex {
  const relPaths: string[] = [];
  for (const root of SEARCH_ROOTS) {
    walk(path.join(repoRoot, root), root, relPaths);
  }
  const byBasename = new Map<string, string[]>();
  for (const relPath of relPaths) {
    const base = path.basename(relPath);
    const list = byBasename.get(base);
    if (list) list.push(relPath);
    else byBasename.set(base, [relPath]);
  }
  return { byBasename };
}

export interface Failure {
  citation: string;
  reason: string;
}

/** Pure given a line-count lookup — resolves one citation against the index.
 * `getLineCount` is injected so tests can avoid touching the real filesystem. */
export function resolveCitation(
  citation: Citation,
  index: FileIndex,
  getLineCount: (relPath: string) => number,
): Failure | null {
  if (citation.isGlob) {
    const re = globToRegExp(path.basename(citation.filePath));
    const anyMatch = [...index.byBasename.keys()].some((base) => re.test(base));
    if (!anyMatch) {
      return {
        citation: citation.raw,
        reason: `no file matches glob pattern "${path.basename(citation.filePath)}"`,
      };
    }
    return null;
  }

  const basename = path.basename(citation.filePath);
  const candidates = index.byBasename.get(basename) ?? [];
  if (candidates.length === 0) {
    return {
      citation: citation.raw,
      reason: `no file named "${basename}" found under ${SEARCH_ROOTS.join(', ')}`,
    };
  }
  if (citation.startLine == null) return null; // existence-only citation

  const maxLine = citation.endLine ?? citation.startLine;
  const anyFits = candidates.some(
    (relPath) => getLineCount(relPath) >= maxLine,
  );
  if (!anyFits) {
    return {
      citation: citation.raw,
      reason: `no candidate for "${basename}" has ${maxLine}+ lines (checked: ${candidates.join(', ')})`,
    };
  }
  return null;
}

function main(): number {
  if (!fs.existsSync(DOC_PATH)) {
    process.stderr.write(
      `flow-inventory-cite-rot: doc not found at ${DOC_PATH}\n`,
    );
    return 1;
  }
  const docBody = fs.readFileSync(DOC_PATH, 'utf8');
  const tokens = extractBacktickTokens(docBody);
  const citations = tokens
    .map(classifyToken)
    .filter((c): c is Citation => c !== null);

  const index = buildFileIndex(REPO_ROOT);
  const lineCountCache = new Map<string, number>();
  const getLineCount = (relPath: string): number => {
    const cached = lineCountCache.get(relPath);
    if (cached != null) return cached;
    const count = fs
      .readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
      .split('\n').length;
    lineCountCache.set(relPath, count);
    return count;
  };

  const failures: Failure[] = [];
  for (const citation of citations) {
    const failure = resolveCitation(citation, index, getLineCount);
    if (failure) failures.push(failure);
  }

  if (failures.length > 0) {
    process.stderr.write(
      `flow-inventory-cite-rot: ${failures.length} of ${citations.length} citation(s) in ${path.relative(REPO_ROOT, DOC_PATH)} are stale:\n`,
    );
    for (const f of failures) {
      process.stderr.write(`  ${f.citation} — ${f.reason}\n`);
    }
    return 1;
  }

  process.stdout.write(
    `flow-inventory-cite-rot: clean (${citations.length} citations resolved).\n`,
  );
  return 0;
}

if (require.main === module) {
  process.exit(main());
}
