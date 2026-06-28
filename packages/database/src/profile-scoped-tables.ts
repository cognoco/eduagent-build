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
 * Tables that match the `profile_id` substring scan but are NOT actually
 * profile-scoped (scanner false positives). Annotate each with a reason.
 * Single source of truth — both rls-coverage suites import this.
 */
export const PROFILE_SCOPED_SCAN_EXCEPTIONS: Record<string, string> = {
  // topic_connections has NO profile_id column and no RLS policy.
  // Scanned as profile-scoped because the BUG-226 comment block (describing
  // the deferred RLS migration) sits inside its pgTable scan window.
  // Ownership is enforced TRANSITIVELY: topic_a_id / topic_b_id →
  //   curriculum_topics → curriculum_books → subjects → subjects.profile_id.
  topic_connections:
    'BUG-226 (P3): transitive ownership via topics→books→subjects; ' +
    'dedicated migration required for direct profile_id + RLS',

  // curriculum_topics has no owner profile_id column; ownership remains
  // transitive through curriculum_topics.book_id → curriculum_books →
  // subjects.profile_id. The source_child_profile_id column is nullable
  // parent-bridge provenance and cannot drive row-level security.
  curriculum_topics:
    'Parent-bridge source_child_profile_id is provenance, not ownership; ' +
    'topic ownership remains topics→books→subjects.profile_id',
};

/**
 * Scans Drizzle schema files to find all tables whose pgTable block contains
 * the substring `profile_id`. Catches profile_id, owner_profile_id,
 * parent_profile_id, child_profile_id — but NOT charge_person_id.
 *
 * Known false positives are documented in PROFILE_SCOPED_SCAN_EXCEPTIONS.
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

      if (/profile_id/.test(tableBlock)) {
        tables.push(tableName);
      }
    }
  }

  return tables;
}
