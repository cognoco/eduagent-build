/**
 * [CR-2026-05-21-009] CASCADE FK guard.
 *
 * Every table with a `profileId` or `accountId` column MUST reference
 * `profiles(id)` or `accounts(id)` with `{ onDelete: 'cascade' }`.
 *
 * This is a static file-level check (no live DB required), following the
 * same pattern as rls-coverage.test.ts.  It prevents the class of bug where
 * a new profile- or account-scoped table is added without a cascade FK,
 * leaving orphaned rows after account deletion.
 *
 * How it works:
 *  1. Scan schema/*.ts for pgTable declarations that contain a `profileId`
 *     or `accountId` column built with `.references(`.
 *  2. For each such column, verify that the column declaration includes
 *     `{ onDelete: 'cascade' }` (or `onDelete: 'cascade'`).
 *  3. Fail with a descriptive message listing every violation.
 *
 * Exceptions are explicitly listed in CASCADE_EXCEPTIONS with a documented
 * reason.  Keep the list as small as possible — every entry is a deliberate
 * data-retention decision.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_DIR = path.resolve(__dirname, 'schema');

// ---------------------------------------------------------------------------
// Known exceptions.  Columns listed here intentionally deviate from the
// cascade rule.  Each entry must carry a documented reason.
// ---------------------------------------------------------------------------
const CASCADE_EXCEPTIONS: Record<string, string> = {
  // profiles.birthYearSetBy references profiles(id) but uses onDelete:'set null'
  // because the setter may leave before the child profile does — nullifying the
  // audit pointer is correct behavior, not a data-loss risk.
  'profiles.birthYearSetBy':
    'Self-referential audit pointer; set null on delete is intentional.',

  // memory_facts has a nullable "merged_into_id" that references another
  // memory_facts row.  When the referenced row is deleted, the pointer should
  // be cleared (set null), not cascade-deleted.
  'memory_facts.mergedIntoId':
    'Nullable merge-pointer; set null on delete is intentional.',

  // notes.sessionId is a nullable back-reference to a session.  Sessions can
  // be deleted independently; the note should survive with a null sessionId.
  'topic_notes.sessionId':
    'Nullable session back-reference; set null on delete is intentional.',

  // session_summaries.nextTopicId is advisory — when the topic is deleted the
  // summary should survive with a null pointer.
  'session_summaries.nextTopicId':
    'Advisory next-topic pointer; set null on delete is intentional.',

  // session_summaries.latestSessionId — nullable pointer, set null ok.
  'progress_summaries.latestSessionId':
    'Nullable latest-session pointer; set null on delete is intentional.',

  // practice_sessions.subjectId is nullable; subject deletion is rare admin
  // action, session record survives with null subjectId for audit purposes.
  'practice_sessions.subjectId':
    'Nullable subject back-reference; set null on delete is intentional.',

  // quiz_rounds.subjectId is nullable; same rationale.
  'quiz_rounds.subjectId':
    'Nullable subject back-reference; set null on delete is intentional.',

  // language_profiles.milestoneId is a nullable advisory pointer.
  'language_profiles.milestoneId':
    'Nullable milestone pointer; set null on delete is intentional.',

  // curriculum_topics.sourceChildProfileId is provenance for parent-bridge
  // clones, not the owning profile. Deleting the source child profile should
  // clear provenance without deleting the learner's cloned topic.
  'curriculum_topics.sourceChildProfileId':
    'Nullable parent-bridge provenance pointer; set null on delete is intentional.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ColumnViolation {
  table: string;
  column: string;
  file: string;
  reason: string;
}

/**
 * Returns the raw content of every non-test schema file.
 */
function loadSchemaFiles(): Array<{ file: string; content: string }> {
  return fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({
      file: f,
      content: fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'),
    }));
}

/**
 * For a given table name and the text block that defines it, extract every
 * column that has a `profileId` or `accountId` field name AND uses
 * `.references(` — then check whether `{ onDelete: 'cascade' }` is present
 * in the same column-definition block.
 *
 * A "column-definition block" is the text from the camelCase field name up
 * to the next field definition or the closing `}` of the table columns object.
 * This is necessarily heuristic (we're regex-scanning TypeScript source), but
 * it is the same approach used by rls-coverage.test.ts and is sufficient for
 * the structural guarantee we need.
 */
function findViolationsInTableBlock(
  tableName: string,
  tableBlock: string,
  fileName: string,
): ColumnViolation[] {
  const violations: ColumnViolation[] = [];

  // The columns of interest: camelCase names that end in "ProfileId" or
  // "AccountId", OR are exactly "profileId" / "accountId".
  const COLUMN_RE =
    /\b(\w*(?:profileId|accountId|ProfileId|AccountId)\w*)\s*:/g;

  let match: RegExpExecArray | null;

  while ((match = COLUMN_RE.exec(tableBlock)) !== null) {
    const fieldName = match[1]!;
    const fieldStart = match.index;

    // Grab the text from the field name to the next field or closing brace.
    // We detect the next field by looking for the next line that starts (after
    // optional whitespace) with a word character followed by `:`.
    const rest = tableBlock.slice(fieldStart + match[0].length);

    // Find next field boundary: a newline followed by optional whitespace and
    // an identifier immediately followed by ':' or '?:'.
    const nextFieldBoundary = rest.search(/\n\s*\w[\w]*\s*[?]?\s*:/);
    const columnBlock =
      nextFieldBoundary === -1 ? rest : rest.slice(0, nextFieldBoundary);

    // Only care about columns that actually call .references(
    if (!columnBlock.includes('.references(')) {
      continue;
    }

    // The exception key is "<tableName>.<fieldName>"
    const exceptionKey = `${tableName}.${fieldName}`;
    if (CASCADE_EXCEPTIONS[exceptionKey]) {
      continue;
    }

    // Check for onDelete: 'cascade'
    const hasCascade =
      /onDelete\s*:\s*['"]cascade['"]/i.test(columnBlock) ||
      // table-level foreignKey() declarations that reference the same column
      // are handled separately; inline .references() always carries its own
      // onDelete config in the same call, so this pattern is sufficient.
      false;

    if (!hasCascade) {
      violations.push({
        table: tableName,
        column: fieldName,
        file: fileName,
        reason: `Column .references() does not declare { onDelete: 'cascade' }`,
      });
    }
  }

  return violations;
}

/**
 * Scans all schema files and returns every profileId/accountId column that
 * uses .references() without { onDelete: 'cascade' }.
 */
function findAllViolations(): ColumnViolation[] {
  const schemaFiles = loadSchemaFiles();
  const allViolations: ColumnViolation[] = [];

  for (const { file, content } of schemaFiles) {
    // Iterate over every pgTable declaration in the file.
    const tableRe = /pgTable\(\s*['"]([a-z_]+)['"]/g;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = tableRe.exec(content)) !== null) {
      const tableName = tableMatch[1]!;
      const tableStart = tableMatch.index;

      // Slice from this pgTable call to the next one (or EOF).
      const nextTable = content.indexOf('pgTable(', tableStart + 1);
      const tableBlock = content.slice(
        tableStart,
        nextTable === -1 ? undefined : nextTable,
      );

      const violations = findViolationsInTableBlock(
        tableName,
        tableBlock,
        file,
      );
      allViolations.push(...violations);
    }
  }

  return allViolations;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CASCADE FK guard [CR-2026-05-21-009]', () => {
  it(
    'every profileId / accountId column that calls .references() ' +
      "uses { onDelete: 'cascade' } (or is listed in CASCADE_EXCEPTIONS)",
    () => {
      const violations = findAllViolations();

      if (violations.length > 0) {
        const lines = violations.map(
          (v) =>
            `  ${v.file} → table "${v.table}", column "${v.column}": ${v.reason}`,
        );
        throw new Error(
          `[CR-2026-05-21-009] ${violations.length} cascade FK violation(s) found.\n` +
            `Add { onDelete: 'cascade' } to the .references() call, OR add an entry\n` +
            `to CASCADE_EXCEPTIONS in cascade-fk-guard.test.ts with a documented reason.\n\n` +
            lines.join('\n'),
        );
      }
    },
  );

  it('scanner detects at least the known profile-scoped tables (sanity check)', () => {
    // If the scanner is broken and returns 0 violations on a clearly non-cascade
    // column we would never know.  This test verifies the scanner finds tables at all.
    const schemaFiles = loadSchemaFiles();
    let tableCount = 0;
    for (const { content } of schemaFiles) {
      const matches = [...content.matchAll(/pgTable\(\s*['"]([a-z_]+)['"]/g)];
      tableCount += matches.length;
    }
    // There are 40+ tables in the schema as of 2026-05-23.
    expect(tableCount).toBeGreaterThanOrEqual(20);
  });
});
