// scripts/check-flow-inventory-cite-rot.ts
//
// Cite-rot guard for docs/flows/mobile-app-flow-inventory.md (WI-2198 AC-7).
// The inventory's ~290 rows cite source files (with or without `:line` /
// `:start-end`), Playwright specs, Maestro flow yamls, and eas.json — every
// citation is backtick-quoted. This is the "consistency check" the AC's
// preamble calls for: it flags rows whose declared shell/flag state cites a
// file or line that no longer exists, i.e. exactly the "stale referenced test
// files/routes" clause.
//
// WI-2198 rework (AC-7): the original pass only checked file/line existence
// — a citation-existence axis. The rejected review found that insufficient:
// the AC also requires flagging "inventory rows whose declared flag/shell
// state no longer matches the canonical navigation contract." Three more
// mechanical (still cite-rot-style, not a new harness — the AC's own
// refinement note) checks cover that axis:
//   1. Row-ID cross-links: a bare (non-backtick) token shaped like a row ID
//      referenced from another row's prose (e.g. "(V2-05)") must resolve to
//      a real defined row or an explicitly-removed one (## Removed in this
//      refresh). This is the exact class of bug a prior pass introduced —
//      the V2 section intro cited a nonexistent "V2-05" instead of the real
//      V2-SCOPE-01/02 rows.
//   2. Flag tokens: every `MODE_NAV_V\d_ENABLED` / `EXPO_PUBLIC_ENABLE_MODE_NAV*`
//      token cited must be a real symbol in feature-flags.ts — catches a
//      flag name drifting out of sync with the doc's own nav-shell claims.
//   3. Legacy tags: every `**legacy-xxx**` inline tag must be one of the
//      three tags the Status legend defines (legacy-current /
//      -superseded / -historical) — catches a typo'd tag silently reading
//      as prose instead of a real classification.
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

// ── Row-ID cross-link check (AC-7 axis 1) ──────────────────────────────

const ID_LINE_START_RE = /^\|\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{1,3})\s*\|/;
// Any bare (non-backtick) ID-shaped token appearing anywhere in the doc —
// deliberately broad; the prefix allowlist below (built from real defined
// IDs) is what keeps this from matching unrelated things like BUG-236 or
// WI-2198, whose prefixes ("BUG", "WI") never appear as a real row-ID
// family, so they're never even considered.
const ID_TOKEN_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{1,3})\b/g;
const REMOVED_SECTION_RE = /## Removed in this refresh\n([\s\S]*?)(?=\n## |$)/;

/** Pure: every row ID defined at the start of a table row, e.g. "HOME-03". */
export function extractDefinedRowIds(docBody: string): Set<string> {
  const ids = new Set<string>();
  for (const line of docBody.split('\n')) {
    const m = line.match(ID_LINE_START_RE);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** Pure: IDs the doc explicitly documents as removed (e.g. "SUBJECT-16" in
 * "## Removed in this refresh") — a reference to one of these is a
 * deliberate historical pointer, not a stale cross-link. */
export function extractRemovedRowIds(docBody: string): Set<string> {
  const section = docBody.match(REMOVED_SECTION_RE)?.[1] ?? '';
  const ids = new Set<string>();
  for (const m of section.matchAll(/\*\*([A-Z][A-Z0-9-]+)\*\*/g)) {
    ids.add(m[1]);
  }
  return ids;
}

/** Pure: the family-prefix of a row ID — "HOME-03" -> "HOME",
 * "V2-CHROME-01" -> "V2-CHROME". Only the part before the trailing numeric
 * segment. */
function idFamily(id: string): string {
  return id.replace(/-\d{1,3}$/, '');
}

export interface RowIdLinkFailure {
  token: string;
  reason: string;
}

/** Pure: scans the doc body for bare ID-shaped tokens and flags any whose
 * family matches a real row-ID family (defined or explicitly-removed) but
 * whose full token does not resolve to either set — plus the special case
 * of a bare "V2-NN" token, which is never a real ID shape (real V2-shell
 * rows are always three-part: V2-CHROME-01, V2-SCOPE-01, ...). */
export function checkRowIdCrossLinks(docBody: string): RowIdLinkFailure[] {
  const defined = extractDefinedRowIds(docBody);
  const removed = extractRemovedRowIds(docBody);
  const knownFamilies = new Set<string>();
  for (const id of defined) knownFamilies.add(idFamily(id));
  for (const id of removed) knownFamilies.add(idFamily(id));

  const failures: RowIdLinkFailure[] = [];
  const seen = new Set<string>();
  for (const m of docBody.matchAll(ID_TOKEN_RE)) {
    const token = m[1];
    if (seen.has(token)) continue;
    seen.add(token);
    if (defined.has(token) || removed.has(token)) continue;

    if (/^V2-\d{1,3}$/.test(token)) {
      failures.push({
        token,
        reason:
          'looks like a V2-shell row reference but real V2 rows are three-part IDs (V2-CHROME-01, V2-SCOPE-01, ...) — this bare form never resolves',
      });
      continue;
    }

    const family = idFamily(token);
    if (knownFamilies.has(family)) {
      failures.push({
        token,
        reason: `no row is defined with this ID, and it is not in "## Removed in this refresh"`,
      });
    }
  }
  return failures;
}

// ── Flag-token check (AC-7 axis 2) ─────────────────────────────────────

const FLAG_TOKEN_RE =
  /\b(MODE_NAV_V\d_ENABLED|EXPO_PUBLIC_ENABLE_MODE_NAV(?:_V\d)?)\b/g;

export interface FlagTokenFailure {
  token: string;
  reason: string;
}

/** Pure given feature-flags.ts source: every `MODE_NAV_V*_ENABLED` /
 * `EXPO_PUBLIC_ENABLE_MODE_NAV*` token cited in the doc must appear as a
 * real symbol in the flags file — catches a flag name drifting out of sync
 * with the doc's own nav-shell claims. */
export function checkFlagTokens(
  docBody: string,
  featureFlagsSource: string,
): FlagTokenFailure[] {
  const failures: FlagTokenFailure[] = [];
  const seen = new Set<string>();
  for (const m of docBody.matchAll(FLAG_TOKEN_RE)) {
    const token = m[1];
    if (seen.has(token)) continue;
    seen.add(token);
    if (!featureFlagsSource.includes(token)) {
      failures.push({
        token,
        reason: `not found in apps/mobile/src/lib/feature-flags.ts`,
      });
    }
  }
  return failures;
}

// ── Legacy-tag validity check (AC-7 axis 3) ────────────────────────────

const VALID_LEGACY_TAGS = new Set([
  'legacy-current',
  'legacy-superseded',
  'legacy-historical',
]);
const LEGACY_TAG_RE = /\*\*(legacy-[a-zA-Z0-9-]+)\*\*/g;

export interface LegacyTagFailure {
  token: string;
  reason: string;
}

/** Pure: every `**legacy-xxx**` inline tag must be one of the three tags
 * the Status legend defines — catches a typo silently reading as prose. */
export function checkLegacyTags(docBody: string): LegacyTagFailure[] {
  const failures: LegacyTagFailure[] = [];
  const seen = new Set<string>();
  for (const m of docBody.matchAll(LEGACY_TAG_RE)) {
    const token = m[1];
    if (seen.has(token)) continue;
    seen.add(token);
    if (!VALID_LEGACY_TAGS.has(token)) {
      failures.push({
        token,
        reason: `not one of the defined V0/V1 legacy-insurance tags (${[...VALID_LEGACY_TAGS].join(', ')})`,
      });
    }
  }
  return failures;
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

  const featureFlagsPath = path.join(
    REPO_ROOT,
    'apps/mobile/src/lib/feature-flags.ts',
  );
  const featureFlagsSource = fs.existsSync(featureFlagsPath)
    ? fs.readFileSync(featureFlagsPath, 'utf8')
    : '';
  const rowIdFailures = checkRowIdCrossLinks(docBody);
  const flagTokenFailures = checkFlagTokens(docBody, featureFlagsSource);
  const legacyTagFailures = checkLegacyTags(docBody);

  const totalFailures =
    failures.length +
    rowIdFailures.length +
    flagTokenFailures.length +
    legacyTagFailures.length;

  if (totalFailures > 0) {
    process.stderr.write(
      `flow-inventory-cite-rot: ${totalFailures} problem(s) in ${path.relative(REPO_ROOT, DOC_PATH)}:\n`,
    );
    for (const f of failures) {
      process.stderr.write(`  [citation] ${f.citation} — ${f.reason}\n`);
    }
    for (const f of rowIdFailures) {
      process.stderr.write(`  [row-id] ${f.token} — ${f.reason}\n`);
    }
    for (const f of flagTokenFailures) {
      process.stderr.write(`  [flag] ${f.token} — ${f.reason}\n`);
    }
    for (const f of legacyTagFailures) {
      process.stderr.write(`  [legacy-tag] ${f.token} — ${f.reason}\n`);
    }
    return 1;
  }

  process.stdout.write(
    `flow-inventory-cite-rot: clean (${citations.length} citations, ${extractDefinedRowIds(docBody).size} row IDs, row-id links, flag tokens, and legacy tags all resolve).\n`,
  );
  return 0;
}

if (require.main === module) {
  process.exit(main());
}
