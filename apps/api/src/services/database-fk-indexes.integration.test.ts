/**
 * Integration: database-fk-indexes (BUG-393 / BUG-396 ratchet)
 *
 * Verifies that every FK column covered by migration
 * `0086_bug393_fk_indexes.sql` and the BUG-393 schema additions has a
 * B-tree index whose LEADING column is the FK column.
 *
 * Background: Postgres does not automatically index FK columns. Without
 * explicit indexes, ON DELETE CASCADE from `profiles` (or other referenced
 * parents) performs a sequential scan on every FK-bearing child table — O(N)
 * delete time as row counts grow. The same applies to hot-path reads filtered
 * by FK column (e.g. `curriculum_adaptations.topic_id` in cascade deletes,
 * `topic_connections.topic_a_id` / `topic_b_id` in the curriculum graph
 * resolution path at `services/curriculum.ts`).
 *
 * Forward-only ratchet: if a new FK column is added to any of the covered
 * tables without a matching leading-column index, the "all FK columns are
 * indexed" test below fails CI, surfacing the gap before it reaches prod.
 *
 * External boundaries: Postgres (via createIntegrationDb). No mocks.
 */

import { sql } from 'drizzle-orm';
import { createIntegrationDb } from '../../../../tests/integration/helpers';

// ---------------------------------------------------------------------------
// Explicit index assertions (migration 0086 + BUG-393 schema additions)
// ---------------------------------------------------------------------------

/**
 * Each entry is { table, column, indexName } exactly as created by
 * migration 0086_bug393_fk_indexes.sql (profile_id group) and by the
 * BUG-393 schema-level index() declarations in subjects.ts / sessions.ts.
 *
 * The assertion checks that indexName exists in pg_indexes AND that its
 * indexdef contains the column as the leftmost column.
 */
const EXPECTED_INDEXES: Array<{
  table: string;
  column: string;
  indexName: string;
}> = [
  // --- migration 0086_bug393_fk_indexes.sql: profile_id FK indexes ---
  {
    table: 'session_summaries',
    column: 'profile_id',
    indexName: 'session_summaries_profile_id_idx',
  },
  {
    table: 'session_events',
    column: 'profile_id',
    indexName: 'session_events_profile_id_idx',
  },
  {
    table: 'parking_lot_items',
    column: 'profile_id',
    indexName: 'parking_lot_items_profile_id_idx',
  },
  {
    table: 'session_embeddings',
    column: 'profile_id',
    indexName: 'session_embeddings_profile_id_idx',
  },
  {
    table: 'curriculum_adaptations',
    column: 'profile_id',
    indexName: 'curriculum_adaptations_profile_id_idx',
  },
  {
    table: 'assessments',
    column: 'profile_id',
    indexName: 'assessments_profile_id_idx',
  },
  {
    table: 'retention_cards',
    column: 'profile_id',
    indexName: 'retention_cards_profile_id_idx',
  },
  {
    table: 'needs_deepening_topics',
    column: 'profile_id',
    indexName: 'needs_deepening_topics_profile_id_idx',
  },
  {
    table: 'teaching_preferences',
    column: 'profile_id',
    indexName: 'teaching_preferences_profile_id_idx',
  },
  {
    table: 'topic_notes',
    column: 'profile_id',
    indexName: 'topic_notes_profile_id_idx',
  },
  {
    table: 'bookmarks',
    column: 'profile_id',
    indexName: 'bookmarks_profile_id_idx',
  },

  // --- BUG-393 schema additions: curriculum_adaptations FK indexes ---
  // subject_id and topic_id fire cascade deletes when a subject / topic is
  // removed; without indexes each probe is a full table scan.
  {
    table: 'curriculum_adaptations',
    column: 'subject_id',
    indexName: 'curriculum_adaptations_subject_id_idx',
  },
  {
    table: 'curriculum_adaptations',
    column: 'topic_id',
    indexName: 'curriculum_adaptations_topic_id_idx',
  },

  // --- BUG-393 schema additions: topic_connections FK indexes ---
  // Both sides of the graph edge are queried via inArray in the hot-path
  // curriculum resolution; both need independent indexes.
  {
    table: 'topic_connections',
    column: 'topic_a_id',
    indexName: 'topic_connections_topic_a_id_idx',
  },
  {
    table: 'topic_connections',
    column: 'topic_b_id',
    indexName: 'topic_connections_topic_b_id_idx',
  },

  // --- BUG-393 schema additions: onboarding_drafts FK index ---
  {
    table: 'onboarding_drafts',
    column: 'profile_id',
    indexName: 'onboarding_drafts_profile_id_idx',
  },
];

// ---------------------------------------------------------------------------
// Tables included in the forward-only FK-coverage ratchet.
// Every FK constraint on these tables must have a leading-column index.
// When you add a new FK to one of these tables, either add the index in the
// migration (and it passes automatically) or add the index name to
// EXPECTED_INDEXES above so the "explicit" test catches it too.
// ---------------------------------------------------------------------------
const RATCHET_TABLES = [
  'session_summaries',
  'session_events',
  'parking_lot_items',
  'session_embeddings',
  'curriculum_adaptations',
  'assessments',
  'retention_cards',
  'needs_deepening_topics',
  'teaching_preferences',
  'topic_notes',
  'bookmarks',
  'topic_connections',
  'onboarding_drafts',
  // WI-1002: person-keyed supporter/visibility tables (migrations 0120/0121)
  // joined the ratchet so their FK columns can never regress unindexed.
  'supporter_encouragement_chips',
  'supporter_feed_surface_state',
  'support_visibility_contracts',
  'support_visibility_notices',
  'support_visibility_audit_events',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `indexdef` (the pg_indexes.indexdef text) has `column` as
 * its leftmost column.  The indexdef looks like:
 *   CREATE INDEX foo ON public.tbl USING btree (col1, col2)
 * or for a unique index:
 *   CREATE UNIQUE INDEX foo ON public.tbl USING btree (col1, col2)
 *
 * We extract the column list from the first set of parentheses after "btree"
 * (or after "ON ... USING") and check that the first entry equals `column`.
 */
function isLeadingColumn(indexdef: string, column: string): boolean {
  // Capture content inside the first (...) after "USING btree" or just the
  // last (...) in the definition (covers hash/gist etc. too).
  const match = indexdef.match(/\(([^)]+)\)/);
  if (!match) return false;
  const cols = match[1]
    .split(',')
    .map((c) => c.trim().replace(/^"(.+)"$/, '$1')); // strip surrounding quotes
  return cols[0] === column;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: FK index coverage (BUG-393 / BUG-396 ratchet)', () => {
  it('every explicitly named BUG-393 index exists in pg_indexes with the correct leading column', async () => {
    const db = createIntegrationDb();

    const tableNames = [...new Set(EXPECTED_INDEXES.map((e) => e.table))];
    // Build "IN ('t1','t2',...)" using sql.raw. All values are hardcoded
    // internal table names — not user input — so there is no injection risk.
    const tableList = tableNames.map((t) => `'${t}'`).join(', ');

    const rows = await db.execute<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(
      sql.raw(`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (${tableList})
        ORDER BY tablename, indexname
      `),
    );

    const indexMap = new Map<
      string,
      { indexname: string; indexdef: string }[]
    >();
    for (const row of rows.rows) {
      const existing = indexMap.get(row.tablename) ?? [];
      existing.push({ indexname: row.indexname, indexdef: row.indexdef });
      indexMap.set(row.tablename, existing);
    }

    for (const entry of EXPECTED_INDEXES) {
      const tableIndexes = indexMap.get(entry.table) ?? [];

      // 1. The named index must exist.
      const namedIndex = tableIndexes.find(
        (i) => i.indexname === entry.indexName,
      );
      expect({
        table: entry.table,
        column: entry.column,
        indexName: entry.indexName,
        exists: namedIndex !== undefined,
      }).toEqual({
        table: entry.table,
        column: entry.column,
        indexName: entry.indexName,
        exists: true,
      });

      if (!namedIndex) continue; // avoid cascading failures; exists-assertion already failed

      // 2. The named index must have the target column as its leading column.
      expect({
        table: entry.table,
        indexName: entry.indexName,
        leadingColumn: entry.column,
        isLeading: isLeadingColumn(namedIndex.indexdef, entry.column),
        indexdef: namedIndex.indexdef,
      }).toMatchObject({
        table: entry.table,
        indexName: entry.indexName,
        leadingColumn: entry.column,
        isLeading: true,
      });
    }
  });

  it('forward-only ratchet: every FK column on covered tables has a leading-column index', async () => {
    /**
     * Strategy:
     *   1. Enumerate all FK constraints on RATCHET_TABLES via pg_constraint
     *      joined with pg_attribute to get the FK column name.
     *   2. For each FK column, look up pg_indexes and verify at least ONE
     *      index on that table has this column as its leading (leftmost) entry.
     *
     * This catches any new FK added without a corresponding index — the test
     * fails, forcing the contributor to add the index (or consciously justify
     * exclusion by adding the table/column to the excluded set below).
     *
     * Intentionally excluded from the ratchet (pre-existing known gaps, each
     * requiring a dedicated future migration to address properly):
     *
     *   - assessments.session_id — nullable FK to learning_sessions. Cascade
     *     deletes are rare (sessions are soft-closed, not hard-deleted). The
     *     hot read path filters by (profile_id, topic_id) via
     *     assessments_profile_topic_idx, not by session_id. Adding an index
     *     is a deferred follow-up (track in a dedicated BUG ticket).
     *
     *   - assessments.subject_id — FK to subjects. The query path for
     *     assessments reads via topic_id (assessments_topic_id_idx) or
     *     (profile_id, topic_id) (assessments_profile_topic_idx). Cascade
     *     delete on subject_id fires when a subject is deleted — infrequent,
     *     but still a sequential scan risk at scale. Deferred follow-up.
     *
     * Intentionally excluded from RATCHET_TABLES (already covered):
     *   - family_links.parent_profile_id — leftmost prefix of compound unique
     *     index family_links_parent_child_unique; no standalone index needed.
     *   - family_links.child_profile_id  — family_links_child_profile_id_idx.
     *
     * Note: topic_connections has no profile_id FK (ownership is transitive
     * via the parent chain; see the [BUG-226] comment in subjects.ts).
     * Its FK columns (topic_a_id, topic_b_id) ARE indexed.
     */

    // Known pre-existing FK gaps excluded from the ratchet.
    // These gaps existed before migration 0086 and were NOT addressed in BUG-393
    // because the cascade or hot-path read risk was judged lower-priority or
    // because coverage exists via a composite index on a different leading column.
    //
    // Rules for this set:
    //   • DO NOT add new entries without filing a follow-up BUG ticket.
    //   • DO NOT remove an entry unless you've added the corresponding index.
    //   • Any FK column on a RATCHET_TABLE not in this set MUST be indexed.
    //
    // Format: '<tablename>::<column_name>'
    const KNOWN_UNINDEXED_FK_COLUMNS = new Set([
      // assessments —————————————————————————————————————————————————————————
      // session_id: nullable FK; cascade is rare (sessions are soft-closed).
      // Hot reads filter by (profile_id, topic_id) via assessments_profile_topic_idx.
      'assessments::session_id',
      // subject_id: cascade fires on subject deletion (infrequent). Deferred.
      'assessments::subject_id',

      // bookmarks ————————————————————————————————————————————————————————————
      // subject_id, topic_id: bookmark reads are profile-scoped; FK cascade
      // fires on subject/topic deletion. Deferred follow-up.
      'bookmarks::subject_id',
      'bookmarks::topic_id',

      // needs_deepening_topics ———————————————————————————————————————————————
      // subject_id: cascade fires on subject deletion. Deferred.
      'needs_deepening_topics::subject_id',

      // onboarding_drafts ————————————————————————————————————————————————————
      // subject_id: cascade fires on subject deletion (admin-only). Deferred.
      'onboarding_drafts::subject_id',

      // parking_lot_items ————————————————————————————————————————————————————
      // session_id: optional FK; hot read is profile-scoped (profile_id indexed
      // by migration 0086). Deferred.
      'parking_lot_items::session_id',
      // topic_id: FK cascade fires on topic deletion. Deferred.
      'parking_lot_items::topic_id',

      // retention_cards ——————————————————————————————————————————————————————
      // topic_id: hot read uses profile_id (indexed by 0086). Deferred.
      'retention_cards::topic_id',

      // session_embeddings ———————————————————————————————————————————————————
      // topic_id: FK cascade; hot read filters by profile_id (indexed by 0086).
      'session_embeddings::topic_id',

      // session_events ———————————————————————————————————————————————————————
      // subject_id: FK cascade on subject deletion; reads are profile-scoped.
      'session_events::subject_id',
      // topic_id: FK cascade on topic deletion; reads are profile-scoped.
      'session_events::topic_id',

      // session_summaries ————————————————————————————————————————————————————
      // next_topic_id: optional FK; advance-queue look-ahead reads go through
      // the session itself, not directly by topic. Deferred.
      'session_summaries::next_topic_id',
      // topic_id: FK cascade; reads are profile-scoped (profile_id indexed by 0086).
      'session_summaries::topic_id',

      // teaching_preferences —————————————————————————————————————————————————
      // subject_id: FK cascade; hot read is profile-scoped (profile_id indexed
      // by 0086). Deferred.
      'teaching_preferences::subject_id',
    ]);

    const db = createIntegrationDb();

    // Build IN-list literals from hardcoded internal names — no injection risk.
    const ratchetList = RATCHET_TABLES.map((t) => `'${t}'`).join(', ');

    // Fetch all FK columns for the ratchet tables.
    const fkRows = await db.execute<{
      table_name: string;
      column_name: string;
    }>(
      sql.raw(`
        SELECT
          c.relname   AS table_name,
          a.attname   AS column_name
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a
          ON a.attrelid = con.conrelid
         AND a.attnum = ANY(con.conkey)
        WHERE con.contype = 'f'
          AND n.nspname = 'public'
          AND c.relname IN (${ratchetList})
        ORDER BY table_name, column_name
      `),
    );

    if (fkRows.rows.length === 0) {
      // If we cannot find ANY FK constraints on the ratchet tables, the query
      // is broken or the schema has changed drastically.  Fail loudly.
      throw new Error(
        'FK constraint query returned zero rows for ratchet tables — ' +
          'either the schema has changed unexpectedly or the pg_constraint ' +
          'query is incorrect. Fix the test before continuing.',
      );
    }

    // Fetch all indexes on the ratchet tables.
    const idxRows = await db.execute<{
      tablename: string;
      indexname: string;
      indexdef: string;
    }>(
      sql.raw(`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN (${ratchetList})
        ORDER BY tablename, indexname
      `),
    );

    // Build a quick lookup: table → list of { indexname, indexdef }.
    const indexesByTable = new Map<
      string,
      Array<{ indexname: string; indexdef: string }>
    >();
    for (const row of idxRows.rows) {
      const list = indexesByTable.get(row.tablename) ?? [];
      list.push({ indexname: row.indexname, indexdef: row.indexdef });
      indexesByTable.set(row.tablename, list);
    }

    for (const { table_name, column_name } of fkRows.rows) {
      const key = `${table_name}::${column_name}`;
      if (KNOWN_UNINDEXED_FK_COLUMNS.has(key)) {
        // Pre-existing known gap — skip but leave the exclusion set visible
        // so reviewers are aware and can track toward a future fix.
        continue;
      }

      const tableIndexes = indexesByTable.get(table_name) ?? [];
      const covered = tableIndexes.some((idx) =>
        isLeadingColumn(idx.indexdef, column_name),
      );

      expect({
        table: table_name,
        fkColumn: column_name,
        hasLeadingColumnIndex: covered,
      }).toEqual({
        table: table_name,
        fkColumn: column_name,
        hasLeadingColumnIndex: true,
      });
    }
  });

  // [WI-1002] The absorbed WI-1003 AC requires the two supporter-visibility
  // contract_id FK indexes to be PARTIAL (WHERE contract_id IS NOT NULL) —
  // contract_id is nullable and lookups always filter contract_id = $1, so the
  // NULL rows are excluded. Assert the partial predicate is present, not just a
  // leading-column index (a full index would also satisfy the ratchet above).
  it('supporter-visibility contract_id FK indexes are partial (WHERE contract_id IS NOT NULL)', async () => {
    const db = createIntegrationDb();

    const partialIndexes = [
      {
        table: 'support_visibility_audit_events',
        indexName: 'support_visibility_audit_events_contract_idx',
      },
      {
        table: 'support_visibility_notices',
        indexName: 'support_visibility_notices_contract_idx',
      },
    ];

    const rows = await db.execute<{ indexname: string; indexdef: string }>(
      sql.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (${partialIndexes.map((p) => `'${p.indexName}'`).join(', ')})
      `),
    );

    const defByName = new Map(rows.rows.map((r) => [r.indexname, r.indexdef]));

    for (const entry of partialIndexes) {
      const indexdef = defByName.get(entry.indexName);
      // Normalize whitespace so the predicate check is insensitive to how
      // Postgres renders the WHERE clause.
      const normalized = (indexdef ?? '').replace(/\s+/g, ' ').toLowerCase();
      expect({
        indexName: entry.indexName,
        exists: indexdef !== undefined,
        isPartialOnContractId: /where \(?contract_id is not null\)?/.test(
          normalized,
        ),
      }).toEqual({
        indexName: entry.indexName,
        exists: true,
        isPartialOnContractId: true,
      });
    }
  });
});
