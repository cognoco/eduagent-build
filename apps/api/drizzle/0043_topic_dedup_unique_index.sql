-- [CR-FIL-DEDUP-INDEX-12] DB-level dedup for curriculum_topics
--
-- The application layer in apps/api/src/services/filing.ts deduplicates
-- topic creation by querying for an existing (book_id, lower(title)) pair
-- before inserting. That works for sequential retries inside one
-- connection, but it cannot prevent two concurrent inserts from different
-- workers passing the SELECT and both INSERTing — the exact race the
-- BUG-841 fix was filed to close. The neon-http driver does not support
-- transactional reads under serializable isolation, so the only durable
-- guarantee comes from the database itself.
--
-- This index makes the (book_id, lower(title)) uniqueness invariant a
-- DB-enforced property. Combined with INSERT ... ON CONFLICT DO NOTHING
-- in the service layer, the worst-case race outcome becomes "one insert
-- wins; the other no-ops and re-finds the existing row" instead of
-- "two duplicate rows".
--
-- IF NOT EXISTS is used so re-running the migration on an already-indexed
-- DB is a no-op (matches the project's other defensively idempotent
-- migration statements).

CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_topics_book_title_lower_uq"
  ON "curriculum_topics" ("book_id", lower("title"));

-- ## Rollback
-- Non-destructive: DROP INDEX does not delete any rows.
-- Data-safe: YES — no data is lost by removing the index.
--
-- To reverse this migration:
--   DROP INDEX IF EXISTS "curriculum_topics_book_title_lower_uq";
--
-- Caveat: if the constraint has already rejected duplicate INSERTs between
-- deploy and rollback, those rejected rows were never written. Rolling back
-- the index does NOT restore them — callers that received a conflict error
-- must retry their inserts after the rollback. This is inherent to any
-- uniqueness constraint and is not recoverable from the DB side.
