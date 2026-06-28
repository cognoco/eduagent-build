/**
 * profile-scoped-tables.ts
 *
 * Schema scanner utilities shared by both rls-coverage test suites
 * (packages/database and apps/api). Exported via the package barrel so
 * apps/api can import via @eduagent/database without violating module
 * boundaries.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_DIR = path.resolve(__dirname, 'schema');

/**
 * Tables that declare a profile-like column but are NOT actually
 * profile-scoped ownership tables. Annotate each with a reason.
 * Single source of truth — both rls-coverage suites import this.
 */
export const PROFILE_SCOPED_SCAN_EXCEPTIONS: Record<string, string> = {
  // curriculum_topics has no owner profile_id column; ownership remains
  // transitive through curriculum_topics.book_id → curriculum_books →
  // subjects.profile_id. The source_child_profile_id column is nullable
  // parent-bridge provenance and cannot drive row-level security.
  curriculum_topics:
    'Parent-bridge source_child_profile_id is provenance, not ownership; ' +
    'topic ownership remains topics→books→subjects.profile_id',
};

/**
 * Scans Drizzle schema files to find tables whose pgTable block declares a
 * real profile-column builder. Catches profile_id, owner_profile_id,
 * parent_profile_id, child_profile_id — but NOT comment text or post-cutover
 * person_id columns.
 *
 * Person-model RLS is manifest-owned in apps/api/src/services/database-rls-coverage.ts
 * because person_id is not uniformly an ownership/RLS column.
 */
export function getProfileScopedTables(): string[] {
  const schemaFiles = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  const tables: string[] = [];

  for (const file of schemaFiles) {
    const content = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');

    const tableMatches = content.matchAll(/pgTable\(\s*['"]([a-z_]+)['"]/g);

    for (const match of tableMatches) {
      const tableName = match[1]!;
      const tableStart = match.index!;
      const nextTableMatch = content.indexOf('pgTable(', tableStart + 1);
      const tableBlock = content.slice(
        tableStart,
        nextTableMatch === -1 ? undefined : nextTableMatch,
      );

      if (declaresProfileColumn(tableBlock)) {
        tables.push(tableName);
      }
    }
  }

  return tables;
}

function declaresProfileColumn(tableBlock: string): boolean {
  return /\b[A-Za-z_$][\w$]*\s*:\s*(?:uuid|text)\(\s*['"](?:[a-z_]+_)?profile_id['"]/m.test(
    tableBlock,
  );
}
