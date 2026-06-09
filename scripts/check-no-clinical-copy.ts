// No-clinical-copy ratchet — Phase 5 read-side hardening.
//
// Walks the English source locale (apps/mobile/src/i18n/locales/en.json) and
// fails CI on banned tone words in learner-visible strings. Banned set comes
// from AGENTS.md "feedback_positive_framing_no_struggle" and the Challenge
// Round prompt at services/challenge-round/prompts.ts:27 — never use
// "failed", "wrong", "incorrect", "struggle", "weak", "declining", etc.
//
// Ratchet model (mirrors the GC1 jest.mock pattern in
// scripts/check-gc1-pattern-a.ts):
//   - A baseline file scripts/no-clinical-copy-baseline.json grandfathers
//     existing violations so the ratchet can land without a sweep PR.
//   - New violations beyond the baseline fail the check.
//   - Removed/cleaned violations are reported so the developer can prune
//     the baseline. They do NOT fail, but warning surfaces drift.
//
// CLI usage:
//   pnpm exec tsx scripts/check-no-clinical-copy.ts          # check
//   pnpm exec tsx scripts/check-no-clinical-copy.ts --accept # rewrite baseline
//
// Exit codes: 0 clean, 1 new violations, 2 missing input file.

import * as fs from 'node:fs';
import * as path from 'node:path';

const EN_PATH = path.resolve(
  __dirname,
  '../apps/mobile/src/i18n/locales/en.json',
);
const BASELINE_PATH = path.resolve(__dirname, 'no-clinical-copy-baseline.json');

// Each entry: lowercase word, matched with case-insensitive \b…\b boundaries.
// Keep the set conservative — every addition that lands in en.json today
// becomes a baseline entry the next contributor must inherit.
const BANNED_TERMS = [
  'failed',
  'failure',
  'failing',
  'wrong',
  'incorrect',
  'mistake',
  'mistakes',
  'struggle',
  'struggling',
  'struggled',
  'weak',
  'weakness',
  'weakest',
  'declining',
  'decline',
  'trouble',
  'troubles',
] as const;

const BANNED_REGEX = new RegExp(`\\b(${BANNED_TERMS.join('|')})\\b`, 'gi');

export interface Violation {
  /** Dotted JSON path to the offending string (e.g. "errors.title"). */
  path: string;
  /** The banned term as it appeared (preserved casing). */
  term: string;
  /** The full string value, so the baseline file is self-describing. */
  value: string;
}

interface BaselineEntry {
  path: string;
  term: string;
}

export function walkStrings(
  node: unknown,
  prefix = '',
  out: Array<{ path: string; value: string }> = [],
): Array<{ path: string; value: string }> {
  if (typeof node === 'string') {
    out.push({ path: prefix, value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkStrings(child, `${prefix}[${i}]`, out));
    return out;
  }
  if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const next = prefix === '' ? k : `${prefix}.${k}`;
      walkStrings(v, next, out);
    }
  }
  return out;
}

export function findViolations(root: unknown): Violation[] {
  const violations: Violation[] = [];
  for (const { path: jp, value } of walkStrings(root)) {
    // Reset regex state — `g` flag has lastIndex carry-over.
    BANNED_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BANNED_REGEX.exec(value)) !== null) {
      violations.push({ path: jp, term: m[1].toLowerCase(), value });
    }
  }
  return violations;
}

interface DiffResult {
  newViolations: Violation[];
  cleanedBaselineEntries: BaselineEntry[];
}

export function diffAgainstBaseline(
  current: Violation[],
  baseline: BaselineEntry[],
): DiffResult {
  const baselineKey = (e: { path: string; term: string }) =>
    `${e.path}::${e.term.toLowerCase()}`;
  const baselineSet = new Set(baseline.map(baselineKey));
  const currentSet = new Set(current.map(baselineKey));

  const newViolations = current.filter((v) => !baselineSet.has(baselineKey(v)));
  const cleanedBaselineEntries = baseline.filter(
    (b) => !currentSet.has(baselineKey(b)),
  );
  return { newViolations, cleanedBaselineEntries };
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of {path, term} entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(violations: Violation[]): void {
  const sorted = [...violations]
    .map((v) => ({ path: v.path, term: v.term }))
    .sort((a, b) =>
      a.path === b.path
        ? a.term.localeCompare(b.term)
        : a.path.localeCompare(b.path),
    );
  // Dedupe — multiple matches in one string of the same term count once.
  const seen = new Set<string>();
  const dedup = sorted.filter((e) => {
    const k = `${e.path}::${e.term}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(dedup, null, 2)}\n`,
    'utf8',
  );
}

function main(): number {
  if (!fs.existsSync(EN_PATH)) {
    process.stderr.write(
      `no-clinical-copy: source locale not found at ${EN_PATH}\n`,
    );
    return 2;
  }

  const root = JSON.parse(fs.readFileSync(EN_PATH, 'utf8')) as unknown;
  const violations = findViolations(root);

  if (process.argv.includes('--accept')) {
    writeBaseline(violations);
    process.stdout.write(
      `no-clinical-copy: baseline written (${violations.length} grandfathered entries)\n`,
    );
    return 0;
  }

  const baseline = loadBaseline();
  const { newViolations, cleanedBaselineEntries } = diffAgainstBaseline(
    violations,
    baseline,
  );

  if (cleanedBaselineEntries.length > 0) {
    process.stdout.write(
      `no-clinical-copy: ${cleanedBaselineEntries.length} baseline entries no longer present (clean up with --accept):\n`,
    );
    for (const e of cleanedBaselineEntries) {
      process.stdout.write(`  - ${e.path} (${e.term})\n`);
    }
  }

  if (newViolations.length === 0) {
    process.stdout.write(
      `no-clinical-copy: clean (${violations.length} grandfathered, 0 new)\n`,
    );
    return 0;
  }

  process.stderr.write(
    `no-clinical-copy: ${newViolations.length} new violation(s) — every new learner-visible string must use positive framing.\n`,
  );
  process.stderr.write(`  Banned tone words: ${BANNED_TERMS.join(', ')}.\n`);
  process.stderr.write(
    `  Reframe in en.json (e.g. "Wrong" → "Not yet", "failed" → "didn't go through"), or — if this is unavoidable technical copy — re-run with --accept and justify in the commit message.\n`,
  );
  for (const v of newViolations) {
    process.stderr.write(
      `  ${v.path} (${v.term}): ${JSON.stringify(v.value)}\n`,
    );
  }
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
