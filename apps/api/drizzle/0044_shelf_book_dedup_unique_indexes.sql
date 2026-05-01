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
--
-- [CR-PR129-M13a] Preflight dedup: any historical duplicate rows created
-- before this migration would cause CREATE UNIQUE INDEX to fail. The block
-- below resolves all pre-existing duplicates deterministically and
-- atomically — in the same transaction — before the indexes are built.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT DEDUP — subjects
-- Strategy: for each (profile_id, lower(name)) group that has more than one
-- active row, keep the oldest row (MIN(created_at); ties broken by MIN(id)
-- which is a UUIDv7 and therefore time-ordered) and ARCHIVE the rest.
-- We never DELETE subject rows because they may be referenced by curricula,
-- curriculum_adaptations, bookmarks, etc. Setting status = 'archived' removes
-- the duplicates from the partial unique index scope (WHERE status = 'active')
-- while preserving history.
-- ─────────────────────────────────────────────────────────────────────────────
WITH ranked_subjects AS (
  SELECT
    id,
    profile_id,
    lower(name) AS name_lower,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id, lower(name)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM subjects
  WHERE status = 'active'
),
duplicates AS (
  SELECT id FROM ranked_subjects WHERE rn > 1
)
UPDATE subjects
SET
  status    = 'archived',
  updated_at = now()
WHERE id IN (SELECT id FROM duplicates);

-- ─────────────────────────────────────────────────────────────────────────────
-- PREFLIGHT DEDUP — curriculum_books
-- Strategy: for each (subject_id, lower(title)) group that has more than one
-- row, keep the oldest row (MIN(created_at); ties broken by MIN(id)) as the
-- canonical book. curriculum_books has no status column, so duplicates must
-- be deleted. Before deleting, all child rows that reference duplicate book
-- ids are re-pointed to the canonical book id to preserve learning history:
--
--   • curriculum_topics  (book_id FK, ON DELETE CASCADE)
--   • topic_suggestions  (book_id FK, ON DELETE CASCADE)
--
-- milestones.book_id is also a FK with ON DELETE CASCADE, but milestones are
-- aggregate markers tied to a specific book's content — re-pointing them to
-- the canonical book would produce phantom milestones for progress the user
-- never completed on that book. It is safer to let the cascade delete them
-- (they will be re-earned naturally as the canonical book's content is
-- completed). This is the same conservative approach used for the topics dedup
-- in migration 0043.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Identify canonical book for each duplicate group.
CREATE TEMP TABLE _book_dedup_map AS
SELECT
  dup.id          AS duplicate_id,
  canon.id        AS canonical_id
FROM curriculum_books dup
JOIN (
  -- canonical = oldest row per (subject_id, lower(title))
  SELECT DISTINCT ON (subject_id, lower(title))
    id,
    subject_id,
    lower(title) AS title_lower
  FROM curriculum_books
  ORDER BY subject_id, lower(title), created_at ASC, id ASC
) canon
  ON  canon.subject_id   = dup.subject_id
  AND canon.title_lower  = lower(dup.title)
WHERE dup.id <> canon.id;

-- Step 2: Re-point curriculum_topics to the canonical book.
UPDATE curriculum_topics ct
SET
  book_id    = m.canonical_id,
  updated_at = now()
FROM _book_dedup_map m
WHERE ct.book_id = m.duplicate_id
  -- Skip topics that already exist on the canonical book (same lower(title))
  -- to avoid violating the curriculum_topics_book_title_lower_uq index that
  -- migration 0043 created. Those are themselves duplicates and will be cleaned
  -- up by the topics dedup logic already applied in migration 0043 — they
  -- should not exist in a healthy DB, but guard defensively.
  AND NOT EXISTS (
    SELECT 1
    FROM curriculum_topics existing
    WHERE existing.book_id  = m.canonical_id
      AND lower(existing.title) = lower(ct.title)
      AND existing.id       <> ct.id
  );

-- Step 3: Re-point topic_suggestions to the canonical book.
UPDATE topic_suggestions ts
SET book_id = m.canonical_id
FROM _book_dedup_map m
WHERE ts.book_id = m.duplicate_id;

-- Step 4: Delete duplicate book rows.
-- Cascade removes: any remaining curriculum_topics still pointing at the
-- duplicate (those skipped in Step 2 because their title already existed on
-- the canonical book), topic_suggestions (already re-pointed above but
-- cascade handles any stragglers), and milestones with book_id pointing at
-- the duplicate.
DELETE FROM curriculum_books
WHERE id IN (SELECT duplicate_id FROM _book_dedup_map);

DROP TABLE _book_dedup_map;

-- ─────────────────────────────────────────────────────────────────────────────
-- UNIQUE INDEXES
-- Built after dedup so no pre-existing duplicates can cause index creation
-- to fail.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "subjects_profile_name_lower_active_uq"
  ON "subjects" ("profile_id", lower("name"))
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_books_subject_title_lower_uq"
  ON "curriculum_books" ("subject_id", lower("title"));

COMMIT;

-- ## Rollback
-- [CR-PR129-M13b]
--
-- To reverse the index creation:
--   DROP INDEX IF EXISTS "subjects_profile_name_lower_active_uq";
--   DROP INDEX IF EXISTS "curriculum_books_subject_title_lower_uq";
--
-- Data-state after rollback:
--   • The DROP INDEX statements above are fully safe — no rows are deleted.
--   • However, the PREFLIGHT DEDUP writes are NOT reversed by dropping the
--     indexes. Specifically:
--
--     subjects:           Duplicate active rows were set to status='archived'.
--                         These rows remain archived after rollback. Manual
--                         review is required to identify which rows were
--                         auto-archived and restore them to status='active' if
--                         needed. Query:
--                           SELECT * FROM subjects
--                           WHERE status = 'archived'
--                             AND updated_at >= '<migration-timestamp>';
--
--     curriculum_books:   Duplicate book rows were DELETED (no status column
--                         exists to use for soft-delete). Their child rows
--                         (curriculum_topics, topic_suggestions, milestones)
--                         were either re-pointed to the canonical book or
--                         cascade-deleted. This data loss is NOT recoverable
--                         from the database after the migration commits.
--                         Rollback is not possible for deleted book rows —
--                         data is permanently destroyed. A point-in-time
--                         restore from a database snapshot taken before the
--                         migration is the only recovery path.
--
-- Summary: DROP INDEX is always safe. The dedup data writes are irreversible
-- for curriculum_books duplicates; subjects duplicates are recoverable via
-- manual status update.
