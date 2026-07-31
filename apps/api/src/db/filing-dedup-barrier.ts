/**
 * Filing dedup barrier guard [WI-2639]
 *
 * resolveFilingResult() (apps/api/src/services/filing.ts) relies on three
 * DB-level unique indexes as the ONLY durable barrier against concurrent
 * duplicate shelf/book/topic creation — neon-serverless does not give the
 * service layer a usable `.for('update')` row lock in interactive
 * transactions, so the in-process SELECT-then-INSERT dedup checks are
 * race-prone without them:
 *
 *   - subjects_profile_name_lower_active_uq   (migration 0044)
 *   - curriculum_books_subject_title_lower_uq (migration 0044)
 *   - curriculum_topics_book_title_lower_uq   (migration 0043)
 *
 * All three are expression and/or partial indexes (`lower(name)`,
 * `WHERE status = 'active'`) that drizzle-kit push cannot express — see the
 * comments on `subjects` / `curriculumBooks` / `curriculumTopics` in
 * packages/database/src/schema/subjects.ts. A database provisioned via
 * `drizzle-kit push` (dev Neon; see AGENTS.md "Schema And Deploy Safety")
 * never receives them, even though the schema files point at them. A
 * database provisioned via `drizzle-kit migrate` against the committed
 * migration chain (CI's api:integration-api lane) always has them.
 *
 * Running the filing concurrency tests against a database missing this
 * barrier does not deterministically fail — it races, and can pass or fail
 * depending on timing. assertFilingDedupBarrierPresent() fails fast with an
 * actionable diagnostic instead of letting that happen silently.
 */
import { sql } from 'drizzle-orm';
import type { Database } from '@eduagent/database';

export interface FilingDedupBarrierIndex {
  readonly name: string;
  readonly schema: string;
  readonly table: string;
  readonly keyDefinitions: readonly string[];
  readonly predicate: string | null;
  readonly migration: string;
}

export const FILING_DEDUP_BARRIER_INDEXES: readonly FilingDedupBarrierIndex[] =
  [
    {
      name: 'subjects_profile_name_lower_active_uq',
      schema: 'public',
      table: 'subjects',
      keyDefinitions: ['profile_id', 'lower(name)'],
      predicate: "status = 'active'::subject_status",
      migration: '0044_shelf_book_dedup_unique_indexes.sql',
    },
    {
      name: 'curriculum_books_subject_title_lower_uq',
      schema: 'public',
      table: 'curriculum_books',
      keyDefinitions: ['subject_id', 'lower(title)'],
      predicate: null,
      migration: '0044_shelf_book_dedup_unique_indexes.sql',
    },
    {
      name: 'curriculum_topics_book_title_lower_uq',
      schema: 'public',
      table: 'curriculum_topics',
      keyDefinitions: ['book_id', 'lower(title)'],
      predicate: null,
      migration: '0043_topic_dedup_unique_index.sql',
    },
  ];

interface FilingDedupBarrierCatalogRow extends Record<string, unknown> {
  index_name: string;
  index_schema: string;
  table_name: string;
  table_schema: string;
  is_unique: boolean;
  is_valid: boolean;
  key_definitions: string[];
  predicate: string | null;
}

function normalizeCatalogExpression(expression: string): string {
  return expression.replace(/[\s"()]/g, '');
}

function matchesBarrierContract(
  row: FilingDedupBarrierCatalogRow | undefined,
  expected: FilingDedupBarrierIndex,
): boolean {
  if (!row) return false;

  return (
    row.index_schema === expected.schema &&
    row.table_schema === expected.schema &&
    row.table_name === expected.table &&
    row.is_unique &&
    row.is_valid &&
    row.key_definitions.length === expected.keyDefinitions.length &&
    row.key_definitions.every(
      (definition, position) =>
        normalizeCatalogExpression(definition) ===
        normalizeCatalogExpression(expected.keyDefinitions[position] ?? ''),
    ) &&
    (row.predicate === null
      ? expected.predicate === null
      : expected.predicate !== null &&
        normalizeCatalogExpression(row.predicate) ===
          normalizeCatalogExpression(expected.predicate))
  );
}

/** Thrown by assertFilingDedupBarrierPresent() when the barrier is absent. */
export class FilingDedupBarrierMissingError extends Error {
  constructor(public readonly missing: readonly FilingDedupBarrierIndex[]) {
    super(FilingDedupBarrierMissingError.buildMessage(missing));
    this.name = 'FilingDedupBarrierMissingError';
  }

  private static buildMessage(
    missing: readonly FilingDedupBarrierIndex[],
  ): string {
    const list = missing
      .map(
        (idx) =>
          `  - ${idx.name} on "${idx.table}" (migration ${idx.migration})`,
      )
      .join('\n');
    return (
      `[WI-2639] Filing dedup barrier missing, invalid, or mismatched on this database:\n${list}\n\n` +
      'resolveFilingResult() (apps/api/src/services/filing.ts) relies on these ' +
      'DB-level unique indexes as the ONLY durable barrier against concurrent ' +
      'duplicate shelf/book/topic creation. They are expression/partial indexes ' +
      "(lower(name), WHERE status = 'active') that `drizzle-kit push` cannot " +
      'express — a push-managed database (e.g. dev Neon; see AGENTS.md "Schema ' +
      'And Deploy Safety") never receives them. Run the filing concurrency ' +
      'integration tests only against a database built via `drizzle-kit migrate` ' +
      "(CI's api:integration-api lane does this), or apply the migrations listed " +
      'above directly to a disposable scratch database. Refusing to run the ' +
      'filing integration suite unprotected against an unenforced barrier.'
    );
  }
}

/**
 * Fails fast with an actionable diagnostic if the connected database is
 * missing any of the filing dedup barrier indexes. Call this from a
 * top-level `beforeAll` in any integration suite that exercises
 * resolveFilingResult()'s concurrent-write paths.
 */
export async function assertFilingDedupBarrierPresent(
  db: Database,
): Promise<void> {
  const names = FILING_DEDUP_BARRIER_INDEXES.map((idx) => idx.name);
  // drizzle's sql tag already parenthesizes an interpolated array as
  // `($1, $2, $3)` for an `IN` list — wrapping it in another `(...)` here
  // (or casting it as `ANY(${names}::text[])`) double-wraps it into a single
  // Postgres row/record value and Postgres rejects the comparison.
  const result = await db.execute<FilingDedupBarrierCatalogRow>(
    sql`SELECT
      index_class.relname AS index_name,
      index_namespace.nspname AS index_schema,
      table_class.relname AS table_name,
      table_namespace.nspname AS table_schema,
      index_meta.indisunique AS is_unique,
      index_meta.indisvalid AS is_valid,
      ARRAY(
        SELECT pg_get_indexdef(index_meta.indexrelid, key_position.position, true)
        FROM generate_series(1, index_meta.indnkeyatts) AS key_position(position)
        ORDER BY key_position.position
      ) AS key_definitions,
      pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate
    FROM pg_index index_meta
    JOIN pg_class index_class ON index_class.oid = index_meta.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_class table_class ON table_class.oid = index_meta.indrelid
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    WHERE index_class.relname IN ${names} AND index_class.relkind = 'i'`,
  );
  const catalogRows = result.rows as FilingDedupBarrierCatalogRow[];
  const byName = new Map<string, FilingDedupBarrierCatalogRow>(
    catalogRows.map((row) => [row.index_name, row]),
  );
  const missing = FILING_DEDUP_BARRIER_INDEXES.filter(
    (idx) => !matchesBarrierContract(byName.get(idx.name), idx),
  );
  if (missing.length > 0) {
    throw new FilingDedupBarrierMissingError(missing);
  }
}
