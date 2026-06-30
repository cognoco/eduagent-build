/**
 * Forward-only ratchet for *single-topic ownership joins*.
 *
 * A "single-topic ownership join" is an inline query that re-implements the
 * canonical `findOwnedCurriculumTopic` helper: it selects
 * `.from(curriculumTopics)`, joins to `subjects`, filters `subjects.profileId`,
 * and constrains a single `eq(curriculumTopics.id, …)` (NOT an `inArray(...)`
 * collection — those are listing joins, a different pattern that is out of
 * scope). Every such site should call `findOwnedCurriculumTopic` instead, so a
 * change to the ownership join (e.g. the dual curriculumBooks + curricula join
 * that makes it strictly correct) is made in exactly one place.
 *
 * This is NOT an empty-allowlist gate. A grep-equivalent of the pattern matches
 * ~9 sites today; the three migrated by the Bucket-1 consolidation
 * (evaluate-data, assessments.loadAssessmentTopicContext,
 * family-bridge.topicBelongsToProfile) no longer contain it. The remainder are
 * deferred siblings — functionally equivalent but with different return
 * shapes / verify-then-write / verify-then-throw semantics that would balloon a
 * focused PR. They are tracked as sweep **SWEEP-topic-ownership-join** and
 * enumerated in EXPECTED_COUNTS below, NOT treated as acceptable permanent
 * state (AGENTS.md "Sweep when you fix" → option (b): documented deferred sweep).
 *
 * Ratchet semantics (strict, count-based):
 *   - Any matched site in a file NOT in EXPECTED_COUNTS fails CI (a brand-new
 *     inline ownership join, or a reintroduction in a previously-clean file
 *     like evaluate-data.ts → catches a T3 regression).
 *   - Any allowlisted file whose match count EXCEEDS its expected value fails
 *     CI (a new inline join added beside a deferred sibling, OR a reintroduction
 *     of a migrated join in assessments.ts / family-bridge.ts → catches T4 / T5
 *     regressions without depending on line numbers).
 *   - Burning down a deferred sibling (migrating it to the helper) requires
 *     lowering its expected count here — the only sanctioned way the number
 *     moves is down.
 *
 * Mirrors the structure of `safe-non-core.guard.test.ts`.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

// __dirname = apps/api/src/services → repoRoot is 4 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

/**
 * Deferred single-topic ownership joins — SWEEP-topic-ownership-join.
 * Key: repo-relative file path. Value: number of matched sites currently in
 * that file. The only acceptable edit to a value is to DECREASE it (after
 * migrating a site to findOwnedCurriculumTopic). Increasing it, or adding a
 * new key, means a new inline ownership join slipped in — migrate it instead.
 */
const EXPECTED_COUNTS: Record<string, number> = {
  'apps/api/src/inngest/functions/session-completed.ts': 1, // loadTopicTitle (book-path)
  'apps/api/src/inngest/functions/topic-probe-extract.ts': 1,
  'apps/api/src/services/assessments.ts': 1, // createAssessment [BUG-460] verify-then-insert
  'apps/api/src/services/curriculum.ts': 1,
  'apps/api/src/services/family-bridge.ts': 0, // fully migrated; :546 topicBelongsToProfile → findOwnedCurriculumTopic (T5, WI-867 collapse)
  'apps/api/src/services/notes.ts': 0, // fully migrated to assertOwnedCurriculumTopic [WI-1071]
  'apps/api/src/services/recall-bridge.ts': 1,
  'apps/api/src/services/session/session-crud.ts': 2, // verify-then-use ×2 (subjectId-scoped)
};

interface MatchSite {
  file: string; // repo-relative, forward slashes
  line: number; // 1-based, start of the enclosing statement
  snippet: string;
}

function shouldScanFile(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (!rel.startsWith('apps/api/src/')) return false;
  if (!rel.endsWith('.ts')) return false;
  if (rel.endsWith('.test.ts')) return false;
  if (rel.endsWith('.d.ts')) return false;
  // The canonical helper itself is the sanctioned home of the pattern.
  if (rel.endsWith('apps/api/src/services/curriculum-topic-ownership.ts')) {
    return false;
  }
  if (rel.startsWith('apps/api/eval-llm/')) return false;
  return true;
}

function walkDir(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkDir(full, out);
    } else if (entry.isFile() && full.endsWith('.ts')) {
      if (shouldScanFile(full)) out.push(full);
    }
  }
}

function enclosingStatement(node: ts.Node): ts.Node {
  let cur: ts.Node = node;
  while (
    cur.parent &&
    !(
      ts.isVariableStatement(cur) ||
      ts.isExpressionStatement(cur) ||
      ts.isReturnStatement(cur)
    )
  ) {
    cur = cur.parent;
  }
  return cur;
}

/** Does the enclosing statement of a `.from(curriculumTopics)` call match the
 *  single-topic ownership-join shape? */
function isOwnershipJoin(statementText: string): boolean {
  const joinsSubjects =
    /\.innerJoin\(\s*subjects/.test(statementText) ||
    /\.leftJoin\(\s*subjects/.test(statementText);
  const ownsFilter = /subjects\.profileId/.test(statementText);
  const singleEq = /eq\(\s*curriculumTopics\.id\s*,/.test(statementText);
  const listingIn = /inArray\(\s*curriculumTopics\.id/.test(statementText);
  return joinsSubjects && ownsFilter && singleEq && !listingIn;
}

function scanFileText(absPath: string, text: string): MatchSite[] {
  const sourceFile = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
  const sites: MatchSite[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from' &&
      node.arguments.length > 0 &&
      ts.isIdentifier(node.arguments[0]!) &&
      (node.arguments[0] as ts.Identifier).text === 'curriculumTopics'
    ) {
      const stmt = enclosingStatement(node);
      const stmtText = stmt.getText(sourceFile);
      if (isOwnershipJoin(stmtText)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          stmt.getStart(sourceFile),
        );
        const lineStart = sourceFile.getLineStarts()[line] ?? 0;
        const nextLine =
          sourceFile.getLineStarts()[line + 1] ?? sourceFile.text.length;
        sites.push({
          file: path.relative(REPO_ROOT, absPath).replace(/\\/g, '/'),
          line: line + 1,
          snippet: sourceFile.text.slice(lineStart, nextLine).trimEnd(),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

function scanFile(absPath: string): MatchSite[] {
  return scanFileText(absPath, fs.readFileSync(absPath, 'utf8'));
}

describe('curriculum-topic-ownership ratchet', () => {
  const files: string[] = [];
  walkDir(API_SRC, files);

  const allSites: MatchSite[] = [];
  for (const f of files) allSites.push(...scanFile(f));

  it('scans a meaningful number of files (sanity check)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds the known deferred ownership joins (sanity check)', () => {
    // If this drops to 0 the scanner is broken — there are deferred siblings
    // on any non-trivial state of the tree until the sweep completes.
    expect(allSites.length).toBeGreaterThan(0);
  });

  it('no single-topic ownership join outside the deferred allowlist', () => {
    const offenders = allSites.filter(
      (s) => EXPECTED_COUNTS[s.file] === undefined,
    );
    if (offenders.length > 0) {
      const lines = offenders
        .map(
          (s) => `  ${s.file}:${s.line}  →  ${s.snippet.trim().slice(0, 90)}`,
        )
        .join('\n');
      throw new Error(
        `Found ${offenders.length} single-topic ownership join(s) not on the SWEEP-topic-ownership-join allowlist.\n` +
          `Replace each with findOwnedCurriculumTopic(db, { profileId, topicId }) ` +
          `(see services/curriculum-topic-ownership.ts).\n${lines}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it('allowlisted files have not grown new ownership joins (forward-only ratchet)', () => {
    const counts: Record<string, number> = {};
    for (const s of allSites) counts[s.file] = (counts[s.file] ?? 0) + 1;

    const violations: string[] = [];
    for (const [file, expected] of Object.entries(EXPECTED_COUNTS)) {
      const actual = counts[file] ?? 0;
      if (actual > expected) {
        violations.push(
          `  ${file}: expected ${expected}, found ${actual} — a new inline ownership join was added (migrate it to findOwnedCurriculumTopic).`,
        );
      }
      if (actual < expected) {
        violations.push(
          `  ${file}: expected ${expected}, found ${actual} — a deferred sibling was migrated; lower its EXPECTED_COUNTS value to ${actual} to advance the ratchet.`,
        );
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `SWEEP-topic-ownership-join ratchet mismatch:\n${violations.join('\n')}`,
      );
    }
    expect(violations).toEqual([]);
  });

  // Self-check: the detector flags a synthetic single-topic ownership join.
  it('self-check: detects a synthetic ownership join', () => {
    const synthetic = `
      const [topic] = await db
        .select({ title: curriculumTopics.title })
        .from(curriculumTopics)
        .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
        .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
        .where(and(eq(curriculumTopics.id, topicId), eq(subjects.profileId, profileId)))
        .limit(1);
    `;
    expect(scanFileText('synthetic.ts', synthetic)).toHaveLength(1);
  });

  // Self-check: a listing join (inArray over a collection) is NOT a match.
  it('self-check: ignores a listing join (inArray)', () => {
    const listing = `
      const rows = await db
        .select({ id: curriculumTopics.id })
        .from(curriculumTopics)
        .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
        .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
        .where(and(inArray(curriculumTopics.id, topicIds), eq(subjects.profileId, profileId)));
    `;
    expect(scanFileText('listing.ts', listing)).toHaveLength(0);
  });

  // Self-check: a topic select with no subjects join / ownership filter is NOT
  // a match (e.g. a plain title lookup already scoped some other way).
  it('self-check: ignores a non-ownership topic select', () => {
    const plain = `
      const [topic] = await db
        .select({ title: curriculumTopics.title })
        .from(curriculumTopics)
        .where(eq(curriculumTopics.id, topicId))
        .limit(1);
    `;
    expect(scanFileText('plain.ts', plain)).toHaveLength(0);
  });
});
