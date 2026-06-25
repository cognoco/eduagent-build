// Forward-only Gemini-runtime ratchet (Gemini-retirement Phase A / T-A1).
//
// Gemini/Vertex is an excluded vendor for this product (GCP Service Specific
// Terms §20(d) under-18 prohibition; see docs/registers/llm-models/master.md).
// A Gemini-free V2 routing matrix already exists behind LLM_ROUTING_V2_ENABLED;
// this guard stops *new* Gemini coupling from creeping into runtime code while
// the cutover is staged, and Phase B shrinks the baseline to the allowlist as
// the legacy path is deleted.
//
// Scope: apps/api/src/** (incl. *.test.ts) and scripts/** — the runtime + tooling
// surfaces. Docs (docs/registers/llm-models/master.md, docs/_archive/**) are out
// of scope by construction (this guard never walks docs/), so the register may
// keep naming Gemini as the excluded vendor without tripping the ratchet.
//
// Ratchet model (mirrors scripts/check-i18n-jsx-literals.ts):
//   - scripts/no-gemini-runtime-baseline.json grandfathers existing occurrences,
//     keyed on { file, token } — NOT line number — so reformatting and unrelated
//     edits never churn the baseline.
//   - A { file, token } pair absent from the baseline FAILS the check: a new file
//     gaining any Gemini token, or an existing file gaining a Gemini token class
//     it did not have before, is a regression.
//   - Baseline entries no longer present are reported (not failed) so the baseline
//     can be pruned (Phase B uses --accept to shrink it).
//
// Hard allowlist (never counted, never baselined): the FALLBACK_FORBIDDEN
// definition in router.ts is the enforcement that *keeps* Gemini/Vertex
// unselectable, so a line mentioning FALLBACK_FORBIDDEN is exempt even if a
// future token overlaps it. This guard file itself is also excluded (its source
// necessarily lists every token).
//
// CLI usage:
//   pnpm exec tsx scripts/check-no-gemini-runtime.ts          # check
//   pnpm exec tsx scripts/check-no-gemini-runtime.ts --accept # rewrite baseline
//
// Exit codes: 0 clean, 1 new occurrences, 2 missing source dirs.

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = [
  path.resolve(REPO_ROOT, 'apps/api/src'),
  path.resolve(REPO_ROOT, 'scripts'),
];
const BASELINE_PATH = path.resolve(
  __dirname,
  'no-gemini-runtime-baseline.json',
);
// This guard's own source and its test fixtures list every token verbatim as
// scaffolding (not runtime coupling) — never scan them.
const SELF_PATHS = new Set([
  path.resolve(__dirname, 'check-no-gemini-runtime.ts'),
  path.resolve(__dirname, 'check-no-gemini-runtime.test.ts'),
]);

// Each rule maps a stable token label (stored in the baseline) to the pattern
// that detects it. Patterns are deliberately specific — e.g. `provider: 'gemini'`
// rather than a bare `'gemini'` — so the FALLBACK_FORBIDDEN Set definition
// (`new Set(['gemini', 'vertex'])`) is not matched by construction.
export interface TokenRule {
  token: string;
  pattern: RegExp;
}

export const TOKEN_RULES: readonly TokenRule[] = [
  { token: 'provider:gemini', pattern: /\bprovider:\s*['"]gemini['"]/ },
  {
    token: 'preferredProvider:gemini',
    pattern: /\bpreferredProvider:\s*['"]gemini['"]/,
  },
  { token: 'gemini_only', pattern: /['"]gemini_only['"]/ },
  { token: 'gemini-2.5', pattern: /gemini-2\.5/ },
  { token: 'createGeminiProvider', pattern: /createGeminiProvider/ },
  { token: 'GEMINI_API_KEY', pattern: /GEMINI_API_KEY/ },
  { token: 'providers/gemini', pattern: /providers\/gemini/ },
];

export interface Occurrence {
  /** Repo-relative POSIX path (stable across OS). */
  file: string;
  /** 1-based line — informational only, not part of identity. */
  line: number;
  token: string;
}

export interface BaselineEntry {
  file: string;
  token: string;
}

function toPosixRelative(absFile: string): string {
  return path.relative(REPO_ROOT, absFile).split(path.sep).join('/');
}

// A line carrying the FALLBACK_FORBIDDEN enforcement is exempt — it is the code
// that keeps Gemini/Vertex out, and must be allowed to name them.
function isAllowlistedLine(line: string): boolean {
  return line.includes('FALLBACK_FORBIDDEN');
}

/**
 * Scan a single file's text for Gemini tokens. One Occurrence per (token, line)
 * match; the caller dedupes to { file, token } identity.
 */
export function scanContent(file: string, content: string): Occurrence[] {
  const out: Occurrence[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (isAllowlistedLine(line)) continue;
    for (const rule of TOKEN_RULES) {
      if (rule.pattern.test(line)) {
        out.push({ file, line: i + 1, token: rule.token });
      }
    }
  }
  return out;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !SELF_PATHS.has(path.resolve(full))
    ) {
      out.push(full);
    }
  }
  return out;
}

const entryKey = (e: { file: string; token: string }) =>
  `${e.file}::${e.token}`;

export interface DiffResult {
  newOccurrences: Occurrence[];
  cleanedBaselineEntries: BaselineEntry[];
}

export function diffAgainstBaseline(
  current: Occurrence[],
  baseline: BaselineEntry[],
): DiffResult {
  const baselineSet = new Set(baseline.map(entryKey));
  const currentSet = new Set(current.map(entryKey));

  const seenNew = new Set<string>();
  const newOccurrences: Occurrence[] = [];
  for (const occ of current) {
    const k = entryKey(occ);
    if (baselineSet.has(k) || seenNew.has(k)) continue;
    seenNew.add(k);
    newOccurrences.push(occ);
  }

  const cleanedBaselineEntries = baseline.filter(
    (b) => !currentSet.has(entryKey(b)),
  );
  return { newOccurrences, cleanedBaselineEntries };
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of {file, token} entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(occurrences: Occurrence[]): void {
  const seen = new Set<string>();
  const dedup: BaselineEntry[] = [];
  for (const occ of occurrences) {
    const k = entryKey(occ);
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push({ file: occ.file, token: occ.token });
  }
  dedup.sort((a, b) =>
    a.file !== b.file
      ? a.file.localeCompare(b.file)
      : a.token.localeCompare(b.token),
  );
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(dedup, null, 2)}\n`,
    'utf8',
  );
}

export function collectOccurrences(): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const dir of SCAN_DIRS) {
    for (const abs of walkSourceFiles(dir)) {
      const content = fs.readFileSync(abs, 'utf8');
      occurrences.push(...scanContent(toPosixRelative(abs), content));
    }
  }
  return occurrences;
}

function main(): number {
  const missing = SCAN_DIRS.filter((d) => !fs.existsSync(d));
  if (missing.length === SCAN_DIRS.length) {
    process.stderr.write(
      `no-gemini-runtime: no scan dirs found (${SCAN_DIRS.join(', ')})\n`,
    );
    return 2;
  }

  const occurrences = collectOccurrences();

  if (process.argv.includes('--accept')) {
    writeBaseline(occurrences);
    const unique = new Set(occurrences.map(entryKey)).size;
    process.stdout.write(
      `no-gemini-runtime: baseline written (${unique} grandfathered {file,token} entries)\n`,
    );
    return 0;
  }

  const baseline = loadBaseline();
  const { newOccurrences, cleanedBaselineEntries } = diffAgainstBaseline(
    occurrences,
    baseline,
  );

  if (cleanedBaselineEntries.length > 0) {
    process.stdout.write(
      `no-gemini-runtime: ${cleanedBaselineEntries.length} baseline entries no longer present (shrink with --accept):\n`,
    );
    for (const e of cleanedBaselineEntries) {
      process.stdout.write(`  - ${e.file} (${e.token})\n`);
    }
  }

  if (newOccurrences.length === 0) {
    process.stdout.write(
      `no-gemini-runtime: clean (${baseline.length} grandfathered, 0 new)\n`,
    );
    return 0;
  }

  process.stderr.write(
    `no-gemini-runtime: ${newOccurrences.length} new Gemini runtime coupling(s) — Gemini/Vertex is an excluded vendor (docs/registers/llm-models/master.md).\n`,
  );
  process.stderr.write(
    `  Route the role through an approved provider (Cerebras/Mistral/OpenAI/Anthropic). If this is genuinely part of removing Gemini (Phase B), re-run with --accept to shrink the baseline and justify in the commit message.\n`,
  );
  for (const occ of newOccurrences) {
    process.stderr.write(`  ${occ.file}:${occ.line} (${occ.token})\n`);
  }
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
