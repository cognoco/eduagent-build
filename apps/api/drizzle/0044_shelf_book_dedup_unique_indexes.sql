-- [CR-FIL-DEDUP-INDEX-12-FOLLOWUP] DB-level dedup for subjects and curriculum_books
--
-- The same race pattern that prompted migration 0043 (topic dedup) exists at
-- two other call sites in apps/api/src/services/filing.ts:
--
--   1. Shelf (subject) creation — lines ~466-493 — case-insensitive match on
--      (profile_id, lower(name)) WHERE status = 'active' followed by INSERT.
--      Two concurrent first-time-filings for the same shelf name on the same
--      profile both pass the SELECT (neon-http does not honour .for('update')
--      in interactive transactions) and both INSERT, producing duplicate rows.
--
--   2. Book (curriculum_book) creation — lines ~528-568 — case-insensitive
--      match on (subject_id, lower(title)) followed by INSERT. Same race
--      window: two concurrent first-time-filings for the same book within a
--      shelf produce duplicate rows.
--
-- These indexes make the uniqueness invariants DB-enforced properties.
-- Combined with INSERT ... ON CONFLICT DO NOTHING in the service layer the
-- worst-case race outcome is "one insert wins; the other no-ops and re-finds
-- the existing row" — never duplicate rows.
--
-- Subjects index is PARTIAL (WHERE status = 'active') because archived/paused
-- shelves must not block new shelves with the same name. A user who archived
-- "Science" and creates a fresh "Science" shelf later should not hit a
-- conflict. The filing path only creates shelves with status = 'active', so
-- the partial index covers the entire creation code path.
--
-- Books index is unconditional: curriculum_books has no status column and
-- there is no soft-delete pattern, so every (subject_id, lower(title)) pair
-- is globally unique.
--
-- IF NOT EXISTS is used so re-running the migration on an already-indexed
-- DB is a no-op (matches the project's other defensively idempotent
-- migration statements).

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_profile_name_lower_active_uq"
  ON "subjects" ("profile_id", lower("name"))
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_books_subject_title_lower_uq"
  ON "curriculum_books" ("subject_id", lower("title"));
