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
// WI-2198 bounce-3 (AC-7, second finding): axis 2 above only checked flag-name
// *spelling*, not whether a row's declared shell state actually matches what
// the navigation contract resolves — a row could name a real flag while
// asserting the wrong tabs and still pass. Bounded to the "Navigation shell
// matrix" table (the one place in the doc that makes machine-checkable
// tab-shape claims via a cited constant name), not the 288 flow rows' free
// prose (that would be a full semantic-diff harness, out of scope per the
// AC's own refinement note):
//   4. Nav-shell-matrix tab shapes: every cell in the matrix that both cites
//      a known tab-set constant (`LEARNER_TABS`, `V2_TABS`, ...) AND spells
//      out the tab names it claims (many cells use "same"/count-only
//      shorthand and make no independently-checkable claim — those are
//      skipped, not failed) must match that constant's actual `new Set([...])`
//      literal in navigation-contract.ts / legacy-navigation-contract.ts /
//      use-navigation-contract.ts. A cited constant whose Set literal can't be
//      resolved (non-literal declaration) is reported as a failure, never
//      silently skipped — an unresolvable symbol is a real gap, not a pass.
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

// ── Nav-shell-matrix tab-shape check (AC-7 axis 4) ─────────────────────

// The tab-set constants the "Navigation shell matrix" table cites, and the
// one source file each is literally declared in. Deliberately a closed,
// hardcoded list (mirrors FLAG_TOKEN_RE's own hardcoded flag shape) — this
// check only ever verifies claims about these specific constants; it does
// not go looking for new ones.
const TAB_SET_SOURCE_FILES = {
  LEARNER_TABS: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
  GUARDIAN_TABS: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
  PARENT_PROXY_TABS: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
  FAMILY_MODE_TABS: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
  STUDY_MODE_TABS: 'apps/mobile/src/lib/legacy-navigation-contract.ts',
  STUDY_TABS: 'apps/mobile/src/lib/navigation-contract.ts',
  FAMILY_TABS: 'apps/mobile/src/lib/navigation-contract.ts',
  PROXY_TABS: 'apps/mobile/src/lib/navigation-contract.ts',
  V2_TABS: 'apps/mobile/src/hooks/use-navigation-contract.ts',
} as const;
type TabSetSymbol = keyof typeof TAB_SET_SOURCE_FILES;
const TAB_SET_SYMBOLS = new Set(Object.keys(TAB_SET_SOURCE_FILES));

// The doc's tab vocabulary (TabKey in navigation-contract.ts) — the only
// words this check will ever read out of a cell's prose as a "claimed tab".
const KNOWN_TAB_NAMES = [
  'mentor',
  'subjects',
  'journal',
  'home',
  'own-learning',
  'library',
  'recaps',
  'progress',
  'more',
];
const TAB_NAME_RE = new RegExp(`\\b(?:${KNOWN_TAB_NAMES.join('|')})\\b`, 'g');

const TAB_SET_SYMBOL_RE = /`([A-Z][A-Z0-9_]*)`/g;

/** Pure: extracts the string-literal contents of
 * `const SYMBOL: ReadonlySet<...> = new Set([...])` from source text.
 * Returns `null` if `symbol` isn't declared in that literal shape at all
 * (spread, function call, conditional, renamed export, or removed) — the
 * caller must treat `null` as a loud failure, never a silent skip, since an
 * unresolvable symbol is a real gap in what this check can verify. */
export function extractTabSetLiteral(
  source: string,
  symbol: string,
): Set<string> | null {
  const declRe = new RegExp(
    `\\b${symbol}\\s*:\\s*ReadonlySet<[^>]*>\\s*=\\s*new Set\\(`,
  );
  const declMatch = declRe.exec(source);
  if (!declMatch) return null;
  const openParenIndex = declMatch.index + declMatch[0].length - 1;
  let depth = 0;
  let closeParenIndex = -1;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) {
        closeParenIndex = i;
        break;
      }
    }
  }
  if (closeParenIndex === -1) return null;
  const inner = source.slice(openParenIndex + 1, closeParenIndex);
  // Must be a literal array `[...]` — not a spread, identifier, or call —
  // so a future refactor to something non-literal is caught, not misread.
  const arrayMatch = inner.match(/^\s*\[([\s\S]*)\]\s*$/);
  if (!arrayMatch) return null;
  const items = [...arrayMatch[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(
    (m) => m[1] ?? m[2],
  );
  return new Set(items);
}

/** Pure: returns the [start, end] (inclusive) index pairs of every
 * TOP-LEVEL parenthesized group in `text` — a group's own nested parens
 * (e.g. a citation like `` `(app)/_layout.tsx:827` ``) don't split it into
 * two groups, they stay nested inside the one enclosing group. */
function findTopLevelParenGroups(text: string): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === ')') {
      depth--;
      if (depth === 0 && start !== -1) {
        groups.push([start, i]);
        start = -1;
      }
    }
  }
  return groups;
}

/** Pure: locates the "Navigation shell matrix" section's audience x
 * flag-combo table specifically — that section has two tables, and the
 * build-profile one above starts "| Build profile |", not "| Audience |". */
function extractNavShellMatrixTable(docBody: string): string | null {
  const sectionMatch = docBody.match(
    /## Navigation shell matrix\n([\s\S]*?)(?=\n## )/,
  );
  if (!sectionMatch) return null;
  const section = sectionMatch[1];
  const lines = section.split('\n');
  const headerIndex = lines.findIndex((l) => l.startsWith('| Audience |'));
  if (headerIndex === -1) return null;
  const tableLines: string[] = [];
  for (let i = headerIndex; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) break;
    tableLines.push(lines[i]);
  }
  return tableLines.join('\n');
}

export interface NavShellTabShapeFailure {
  symbol: string;
  reason: string;
}

/** Pure given the real contract sources: for every cell in the doc's
 * Navigation shell matrix that both cites a known tab-set constant AND
 * spells out the tab names it claims (in the span between the previous
 * parenthetical group and the one containing the citation — so trailing
 * commentary after the citation, e.g. "— More tab removed entirely", is
 * never read as part of the claim), compares that claimed set against the
 * constant's real `new Set([...])` literal. Cells that only cite a symbol
 * via shorthand ("same", "4 (`STUDY_TABS`)") with no tab names in their span
 * make no independently-checkable claim and are skipped, not failed. A cited
 * symbol whose literal can't be resolved from source is always a failure
 * (see `extractTabSetLiteral`), never a skip. */
export function checkNavShellMatrixTabShapes(
  docBody: string,
  contractSources: Readonly<Record<string, string>>,
): NavShellTabShapeFailure[] {
  const failures: NavShellTabShapeFailure[] = [];
  const table = extractNavShellMatrixTable(docBody);
  if (!table) return failures;

  const literalCache = new Map<string, Set<string> | null>();
  const resolveLiteral = (symbol: TabSetSymbol): Set<string> | null => {
    if (literalCache.has(symbol)) return literalCache.get(symbol) ?? null;
    const source = contractSources[TAB_SET_SOURCE_FILES[symbol]] ?? '';
    const literal = extractTabSetLiteral(source, symbol);
    literalCache.set(symbol, literal);
    return literal;
  };

  // Row lines only (skip the header and the "|---|" separator).
  const rows = table
    .split('\n')
    .slice(2)
    .filter((l) => l.trim().length > 0);

  for (const row of rows) {
    // Drop the leading/trailing empty entries a "|a|b|" split produces.
    const cells = row.split('|').slice(1, -1);
    // Column 0 is the audience label — the environment columns start at 1.
    for (const cell of cells.slice(1)) {
      for (const clause of cell.split(';')) {
        const groups = findTopLevelParenGroups(clause);
        for (const symbolMatch of clause.matchAll(TAB_SET_SYMBOL_RE)) {
          const symbol = symbolMatch[1];
          if (!TAB_SET_SYMBOLS.has(symbol)) continue;
          const symbolPos = symbolMatch.index ?? -1;
          const groupIdx = groups.findIndex(
            ([s, e]) => symbolPos >= s && symbolPos <= e,
          );
          if (groupIdx === -1) continue; // malformed — nothing to anchor to
          const claimStart = groupIdx === 0 ? 0 : groups[groupIdx - 1][1] + 1;
          const claimText = clause.slice(claimStart, groups[groupIdx][0]);
          const claimedTabs = new Set(
            [...claimText.matchAll(TAB_NAME_RE)].map((m) => m[0]),
          );
          if (claimedTabs.size === 0) continue; // shorthand cell, no claim to check

          const actualTabs = resolveLiteral(symbol as TabSetSymbol);
          if (actualTabs === null) {
            failures.push({
              symbol,
              reason: `cited in the Navigation shell matrix but its Set literal could not be resolved from ${TAB_SET_SOURCE_FILES[symbol as TabSetSymbol]} (expected "const ${symbol}: ReadonlySet<...> = new Set([...])")`,
            });
            continue;
          }
          const claimedSorted = [...claimedTabs].sort();
          const actualSorted = [...actualTabs].sort();
          const same =
            claimedSorted.length === actualSorted.length &&
            claimedSorted.every((t, i) => t === actualSorted[i]);
          if (!same) {
            failures.push({
              symbol,
              reason: `doc claims {${claimedSorted.join(', ')}} but ${symbol} resolves to {${actualSorted.join(', ')}} in ${TAB_SET_SOURCE_FILES[symbol as TabSetSymbol]}`,
            });
          }
        }
      }
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

  const contractSources: Record<string, string> = {};
  for (const file of new Set(Object.values(TAB_SET_SOURCE_FILES))) {
    const filePath = path.join(REPO_ROOT, file);
    contractSources[file] = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8')
      : '';
  }
  const navShellTabShapeFailures = checkNavShellMatrixTabShapes(
    docBody,
    contractSources,
  );

  const totalFailures =
    failures.length +
    rowIdFailures.length +
    flagTokenFailures.length +
    legacyTagFailures.length +
    navShellTabShapeFailures.length;

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
    for (const f of navShellTabShapeFailures) {
      process.stderr.write(`  [nav-shell-tabs] ${f.symbol} — ${f.reason}\n`);
    }
    return 1;
  }

  process.stdout.write(
    `flow-inventory-cite-rot: clean (${citations.length} citations, ${extractDefinedRowIds(docBody).size} row IDs, row-id links, flag tokens, legacy tags, and nav-shell-matrix tab shapes all resolve).\n`,
  );
  return 0;
}

if (require.main === module) {
  process.exit(main());
}
