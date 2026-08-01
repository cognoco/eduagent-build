// Teen self-consent claim ratchet — WI-2535.
//
// Walks the launch/roadmap markdown surface (docs/plans/2026-07-10-mvp-roadmap
// and _wip/mvp-roadmap) and fails CI when a document asserts the *blanket*
// claim that a 13+ learner self-consents.
//
// Why this is wrong, and why a guard is warranted:
//   Consent authority is not a function of age alone. Canon resolves it from
//   age × residence jurisdiction (docs/canon/identity/ontology.md ->
//   resolveConsentRequirement), and guardian consent may be required through
//   age 16 in several target markets (DE 16; DK/FR 15; NO/SE/EE/UK 13).
//   `docs/canon/identity/prd.md:451-465` scopes join-my-family v1 to the
//   *consent-capable* teen and explicitly defers the below-consent-age
//   variant. The blanket phrasing collapses "has an own login" (account tier)
//   into "holds legal consent authority" — two of the six orthogonal facts the
//   corrected launch docs now keep apart. Shipped code makes the same point
//   from the other direction: `services/consent.ts` gates a flat `age <= 16 ->
//   consent required`, so a 13-16 learner is already consent-required in
//   production.
//
// Ratchet model (mirrors scripts/check-decision-adr-link.ts,
// check-no-clinical-copy.ts and the GC1 pattern in check-gc1-pattern-a.ts):
//   - Forward-only. A baseline file scripts/teen-consent-claims-baseline.json
//     grandfathers anything already present, so the gate can land without a
//     sweep PR and cannot red-light other lanes' in-flight work.
//   - A blanket claim not present in the baseline fails the check.
//   - Baseline entries that no longer match are reported (not failed) so the
//     baseline can be pruned with --accept.
//
// Detection is deliberately narrow — the CONJUNCTION, not the word:
//   - A bare "self-consent" is legitimate and common (adult self-consent, the
//     jurisdiction-aware canon phrasing in CONTEXT.md, WI titles). Never flagged.
//   - A bare "13+" is legitimate (age rating, store declarations, the launch
//     floor itself). Never flagged.
//   - Only a 13+ token and a self-consent token within ADJACENCY_WORDS of each
//     other — i.e. the "13+ self-consenting teens" / "self-consenting 13+"
//     shape — is a blanket claim.
//   - A negated window ("13+ is not a grant of self-consent") is a CORRECTION,
//     not a claim, and is skipped.
//
// Scope: markdown only. The generated Cosmo snapshots in _wip/mvp-roadmap
// (roadmap-data.js, dashboard.html, *-dependency-graph.html) are pulled from
// Notion by gen-app-data.py and carry Work Item *titles* verbatim — including
// this WI's own title. They are not hand-authored prose and are excluded by
// construction.
//
// Escape hatch: a line that must quote the banned phrase (to name it as
// banned) carries `<!-- teen-consent-allow: <reason> -->` on the line itself
// or the line immediately above. Mirrors the repo's `gc1-allow` /
// `i18n-allow-multi-var` convention. It is for citing the phrase, not for
// asserting it.
//
// CLI usage:
//   pnpm exec tsx scripts/check-teen-consent-claims.ts          # check
//   pnpm exec tsx scripts/check-teen-consent-claims.ts --accept # rewrite baseline
//
// Exit codes: 0 clean, 1 new violations, 2 scan roots missing.

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['docs/plans/2026-07-10-mvp-roadmap', '_wip/mvp-roadmap'];
const BASELINE_PATH = path.resolve(
  __dirname,
  'teen-consent-claims-baseline.json',
);

/** "13+", "13 +", "13-plus", "13 plus". */
const AGE_TOKEN = /\b13\s*\+|\b13[-\s]plus\b/gi;

/** "self-consent", "self-consenting", "self-consents", "self consented". */
const SELF_CONSENT_TOKEN = /\bself[-\s]consent(?:s|ed|ing)?\b/gi;

/**
 * Maximum intervening words between the two tokens for the pair to read as a
 * single blanket assertion. The defect shape is adjacency ("13+ self-consenting
 * teens"); prose that discusses the two ideas separately runs longer.
 */
const ADJACENCY_WORDS = 3;

/**
 * Grammatical negation only, and only within the matched tokens' own clause
 * (see CLAUSE_BOUNDARY). A negated clause is a correction of the claim rather
 * than an assertion of it.
 *
 * Deliberately narrow. An earlier revision matched a ±60-char window and a
 * much broader vocabulary (`ban`, `banned`, `wrong`, `incorrect`, `beyond`,
 * `without`, `rather than`, `instead of`). Both were wrong in the direction
 * that matters for a ratchet — a FALSE NEGATIVE, which fails silently and
 * looks clean:
 *   - The window let an unrelated negation in a neighbouring clause suppress a
 *     real assertion: "13+ is not the only launch floor; however all 13+
 *     learners are self-consenting teens" matched nothing, because `not` sat
 *     within 60 chars of the later blanket claim.
 *   - The vocabulary suppressed genuine assertions that merely contained a
 *     topical word — "13+ learners self-consent without guardian approval" is
 *     a blanket claim, not a correction of one.
 * Only sentential negation of the claim itself belongs here.
 */
const NEGATION = /\b(not|never|no longer|cannot|nor)\b|n't\b/i;

/**
 * Clause separators. Negation is judged within the clause holding the match,
 * so contrasting prose ("A is not X; however B is Y") cannot walk a real claim
 * past the gate. The em dash is included because this repo's docs lean on it
 * heavily as a clause break.
 */
const CLAUSE_BOUNDARY = /[.;:!?]+|—|--/g;

/** Same-line or preceding-line escape annotation. */
const ALLOW_ANNOTATION = /teen-consent-allow:/;

export interface Violation {
  /** Repo-relative file path. */
  file: string;
  /** The matched blanket-claim window, whitespace-normalized. */
  text: string;
}

interface BaselineEntry {
  file: string;
  text: string;
}

interface Match {
  index: number;
  end: number;
}

function collect(re: RegExp, line: string): Match[] {
  const out: Match[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push({ index: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/** Word count of the text strictly between two token spans. */
function interveningWords(line: string, a: Match, b: Match): number {
  const [first, second] = a.index <= b.index ? [a, b] : [b, a];
  const between = line.slice(first.end, second.index);
  const words = between.split(/\s+/).filter((w) => /\w/.test(w));
  return words.length;
}

/**
 * The clause containing offset `at` — the text between the surrounding clause
 * boundaries. Exported for tests.
 */
export function clauseAt(line: string, at: number): string {
  const bounds: number[] = [];
  CLAUSE_BOUNDARY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_BOUNDARY.exec(line)) !== null) {
    bounds.push(m.index, m.index + m[0].length);
    if (m.index === CLAUSE_BOUNDARY.lastIndex) CLAUSE_BOUNDARY.lastIndex++;
  }
  let start = 0;
  let end = line.length;
  for (let i = 0; i < bounds.length; i += 2) {
    const bStart = bounds[i];
    const bEnd = bounds[i + 1];
    if (bEnd <= at) start = bEnd;
    else if (bStart > at) {
      end = bStart;
      break;
    }
  }
  return line.slice(start, end);
}

/**
 * Blanket-claim windows on a single line. A window is the span covering both
 * tokens; it is a violation when the tokens are adjacent enough to read as one
 * assertion and the clause holding them is not negated.
 */
export function findBlanketClaims(line: string): string[] {
  const ages = collect(AGE_TOKEN, line);
  if (ages.length === 0) return [];
  const consents = collect(SELF_CONSENT_TOKEN, line);
  if (consents.length === 0) return [];

  const out: string[] = [];
  for (const age of ages) {
    for (const consent of consents) {
      if (interveningWords(line, age, consent) > ADJACENCY_WORDS) continue;
      const start = Math.min(age.index, consent.index);
      const end = Math.max(age.end, consent.end);
      const window = line.slice(start, end).replace(/\s+/g, ' ').trim();
      // Negation is judged ONLY within the clause holding the match, so a
      // negation in a neighbouring clause cannot suppress a real assertion.
      if (NEGATION.test(clauseAt(line, start))) continue;
      out.push(window);
    }
  }
  return out;
}

/** Every blanket claim in a markdown body, honouring the escape annotation. */
export function findFileViolations(relFile: string, body: string): Violation[] {
  const lines = body.split('\n');
  const out: Violation[] = [];
  lines.forEach((line, i) => {
    const prev = i > 0 ? lines[i - 1] : '';
    if (ALLOW_ANNOTATION.test(line) || ALLOW_ANNOTATION.test(prev)) return;
    for (const text of findBlanketClaims(line)) {
      out.push({ file: relFile, text });
    }
  });
  return out;
}

interface DiffResult {
  newViolations: Violation[];
  cleanedBaselineEntries: BaselineEntry[];
}

export function diffAgainstBaseline(
  current: Violation[],
  baseline: BaselineEntry[],
): DiffResult {
  const key = (e: { file: string; text: string }) => `${e.file}::${e.text}`;
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
  for (const rel of SCAN_ROOTS) {
    for (const file of walkMarkdown(path.resolve(REPO_ROOT, rel))) {
      const relFile = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      violations.push(
        ...findFileViolations(relFile, fs.readFileSync(file, 'utf8')),
      );
    }
  }
  return violations.sort((a, b) =>
    a.file === b.file
      ? a.text.localeCompare(b.text)
      : a.file.localeCompare(b.file),
  );
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of {file, text} entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(violations: Violation[]): void {
  const seen = new Set<string>();
  const dedup = violations.filter((v) => {
    const k = `${v.file}::${v.text}`;
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
  if (!SCAN_ROOTS.some((r) => fs.existsSync(path.resolve(REPO_ROOT, r)))) {
    process.stderr.write(
      `teen-consent-claims: no scan roots found (${SCAN_ROOTS.join(', ')})\n`,
    );
    return 2;
  }

  const violations = collectViolations();

  if (process.argv.includes('--accept')) {
    writeBaseline(violations);
    process.stdout.write(
      `teen-consent-claims: baseline written (${violations.length} grandfathered blanket claims)\n`,
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
      `teen-consent-claims: ${cleanedBaselineEntries.length} baseline entries no longer present (prune with --accept):\n`,
    );
    for (const e of cleanedBaselineEntries) {
      process.stdout.write(`  - ${e.file}: ${e.text}\n`);
    }
  }

  if (newViolations.length === 0) {
    process.stdout.write(
      `teen-consent-claims: clean (${violations.length} grandfathered, 0 new)\n`,
    );
    return 0;
  }

  process.stderr.write(
    `teen-consent-claims: ${newViolations.length} NEW blanket 13+ self-consent claim(s).\n\n` +
      `Consent authority resolves from age x residence jurisdiction, not age alone\n` +
      `(docs/canon/identity/ontology.md -> resolveConsentRequirement; prd.md:451-465).\n` +
      `A 13+ learner has an own login (account tier); that is not a grant of legal\n` +
      `consent authority, and guardian consent may be required through 16.\n\n` +
      `Write "credentialed 13+ learner" and state the jurisdiction-resolved consent\n` +
      `branch separately. To CITE the banned phrase rather than assert it, annotate\n` +
      `the line with <!-- teen-consent-allow: <reason> -->.\n\n`,
  );
  for (const v of newViolations) {
    process.stderr.write(`  - ${v.file}: "${v.text}"\n`);
  }
  process.stderr.write(
    `\nIf a match is a genuine false positive, re-run with --accept to grandfather\n` +
      `it and justify in the commit message.\n`,
  );
  return 1;
}

if (require.main === module) {
  process.exit(main());
}
