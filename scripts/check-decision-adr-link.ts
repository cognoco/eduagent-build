// Decision→ADR link ratchet — MMT-ADR-0000 (the documentation-layer pivot).
//
// Walks docs/specs/**.md and docs/plans/**.md and fails CI when a file
// contains an ADR-class *decision block* (a heading like "Key design
// decisions", "Technical Decisions", "Alternatives considered", "Trade-offs")
// but does NOT link a decision record (no `MMT-ADR-NNNN` reference anywhere in
// the file). The goal is forward-only: new contested decisions must be
// recorded as an MMT-ADR and linked, instead of being buried inline in a spec
// or plan. See `docs/adr/MMT-ADR-0000-*.md` §II.1/§II.5.
//
// Ratchet model (mirrors scripts/check-no-clinical-copy.ts and the GC1
// jest.mock pattern in scripts/check-gc1-pattern-a.ts):
//   - A baseline file scripts/decision-adr-link-baseline.json grandfathers the
//     ~64 decision blocks already embedded in today's specs/plans, so the
//     ratchet lands WITHOUT a sweep PR (the backfill is deferred).
//   - A decision heading not present in the baseline, in a file with no
//     MMT-ADR link, fails the check.
//   - Baseline entries that no longer match are reported (not failed) so the
//     baseline can be pruned with --accept as the backfill drains them.
//
// Deliberate simplification: linkage is checked at FILE granularity (any
// `MMT-ADR-NNNN` reference in the file satisfies all its decision headings).
// Per-block attribution would be more precise but is over-engineering for a
// forward ratchet — a spec that spawns an ADR will cite it. Refine later if a
// file with mixed linked/unlinked decisions becomes a real gap.
//
// False positives (a heading that matches but is not an ADR-class decision)
// are handled the same way as no-clinical-copy: re-run with --accept to
// grandfather it, and justify in the commit message.
//
// CLI usage:
//   pnpm exec tsx scripts/check-decision-adr-link.ts          # check
//   pnpm exec tsx scripts/check-decision-adr-link.ts --accept # rewrite baseline
//
// Exit codes: 0 clean, 1 new violations, 2 docs roots missing.

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['docs/specs', 'docs/plans'].map((p) =>
  path.resolve(REPO_ROOT, p),
);
const BASELINE_PATH = path.resolve(
  __dirname,
  'decision-adr-link-baseline.json',
);

// A markdown heading whose text signals a structured, ADR-class decision block.
// Heading-only (not prose) keeps the false-positive rate low — a heading is a
// strong signal of an authored decision section. Conservative by design; new
// matches are cheap to grandfather.
const DECISION_HEADING =
  /\b((key |technical |product |design |architectural )?decisions?|alternatives(\s+considered)?|trade[-\s]?offs?)\b/i;

// Any reference to a decision record in the file satisfies linkage.
const ADR_LINK = /MMT-ADR-\d{4}/;

const HEADING_LINE = /^#{1,6}\s+(.+?)\s*$/;

export interface Violation {
  /** Repo-relative file path. */
  file: string;
  /** The offending decision heading text (without leading #'s). */
  heading: string;
}

interface BaselineEntry {
  file: string;
  heading: string;
}

/** Collect every decision-signalling heading in a markdown body. */
export function findDecisionHeadings(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const m = HEADING_LINE.exec(line);
    if (m && DECISION_HEADING.test(m[1])) out.push(m[1].trim());
  }
  return out;
}

/** A file's decision headings are violations iff the file has no ADR link. */
export function findFileViolations(relFile: string, body: string): Violation[] {
  if (ADR_LINK.test(body)) return [];
  return findDecisionHeadings(body).map((heading) => ({
    file: relFile,
    heading,
  }));
}

interface DiffResult {
  newViolations: Violation[];
  cleanedBaselineEntries: BaselineEntry[];
}

export function diffAgainstBaseline(
  current: Violation[],
  baseline: BaselineEntry[],
): DiffResult {
  const key = (e: { file: string; heading: string }) =>
    `${e.file}::${e.heading}`;
  const baselineSet = new Set(baseline.map(key));
  const currentSet = new Set(current.map(key));
  return {
    newViolations: current.filter((v) => !baselineSet.has(key(v))),
    cleanedBaselineEntries: baseline.filter((b) => !currentSet.has(key(b))),
  };
}

function walkMarkdown(root: string, out: string[] = []): string[] {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function collectViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const rootDir of SCAN_ROOTS) {
    for (const file of walkMarkdown(rootDir)) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      const body = fs.readFileSync(file, 'utf8');
      violations.push(...findFileViolations(rel, body));
    }
  }
  return violations.sort((a, b) =>
    a.file === b.file
      ? a.heading.localeCompare(b.heading)
      : a.file.localeCompare(b.file),
  );
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of {file, heading} entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(violations: Violation[]): void {
  const seen = new Set<string>();
  const dedup = violations.filter((v) => {
    const k = `${v.file}::${v.heading}`;
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
  if (!SCAN_ROOTS.some((r) => fs.existsSync(r))) {
    process.stderr.write(
      `decision-adr-link: no docs roots found (${SCAN_ROOTS.join(', ')})\n`,
    );
    return 2;
  }

  const violations = collectViolations();

  if (process.argv.includes('--accept')) {
    writeBaseline(violations);
    process.stdout.write(
      `decision-adr-link: baseline written (${violations.length} grandfathered decision blocks)\n`,
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
      `decision-adr-link: ${cleanedBaselineEntries.length} baseline entries no longer present (prune with --accept):\n`,
    );
    for (const e of cleanedBaselineEntries) {
      process.stdout.write(`  - ${e.file}: ${e.heading}\n`);
    }
  }

  if (newViolations.length === 0) {
    process.stdout.write(
      `decision-adr-link: clean (${violations.length} grandfathered, 0 new)\n`,
    );
    return 0;
  }

  process.stderr.write(
    `decision-adr-link: ${newViolations.length} new decision block(s) without an MMT-ADR link.\n`,
  );
  process.stderr.write(
    `  A significant decision (deviates from a documented principle, constrains others, moves an\n` +
      `  NFR, or is structural/cross-cutting) belongs in an MMT-ADR, not buried in a spec/plan. See docs/adr/README.md.\n` +
      `  Fix: write the MMT-ADR and reference its ID in this file. If this heading is NOT an\n` +
      `  ADR-class decision, re-run with --accept and justify in the commit message.\n`,
  );
  for (const v of newViolations) {
    process.stderr.write(`  ${v.file}: ${v.heading}\n`);
  }
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
