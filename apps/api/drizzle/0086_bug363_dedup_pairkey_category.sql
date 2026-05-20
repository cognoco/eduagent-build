-- 0086_bug363_dedup_pairkey_category.sql
-- BUG-363: Add `category` column to `memory_dedup_decisions` and widen the
-- primary key to (profile_id, pair_key, category).
--
-- Rationale: the dedup pipeline operates within a single fact-category (e.g.
-- 'interest', 'struggle'). Scoping pair_key to category prevents cross-category
-- false-positive dedup collisions and lets the index be used by category-filtered
-- lookups. Without this column, a pair_key of 'foo::bar' generated for an
-- 'interest' fact could shadow a 'struggle' fact pair with the same key.
--
-- Steps:
--   1. Drop the existing PK (profile_id, pair_key).
--   2. Clear stale dedup rows — the old pair_key scheme is incompatible with the
--      new (pair_key, category) scheme; stale rows would cause false-positive
--      cache hits on the first dedup run. Safe pre-launch: no user decisions
--      are lost.
--   3. Add `category` column NOT NULL with a sentinel default of 'unknown' for
--      any residual rows (post-TRUNCATE there will be none; the DEFAULT guards
--      against a race with any concurrent inserts during migration).
--   4. Re-create PK as (profile_id, pair_key, category).
--   5. Add (profile_id, category) index for category-scoped dedup queries.
--
-- ## Rollback
-- See 0086_bug363_dedup_pairkey_category.rollback.md

-- NOTE: TRUNCATE only safe pre-launch; use DELETE WHERE created_at < ... for post-launch cleanup.
TRUNCATE TABLE "memory_dedup_decisions";

ALTER TABLE "memory_dedup_decisions"
  DROP CONSTRAINT "memory_dedup_decisions_profile_id_pair_key_pk";

ALTER TABLE "memory_dedup_decisions"
  ADD COLUMN IF NOT EXISTS "category" text NOT NULL DEFAULT 'unknown';

ALTER TABLE "memory_dedup_decisions"
  ADD CONSTRAINT "memory_dedup_decisions_profile_id_pair_key_category_pk"
  PRIMARY KEY ("profile_id", "pair_key", "category");

CREATE INDEX IF NOT EXISTS "memory_dedup_decisions_profile_category_idx"
  ON "memory_dedup_decisions" ("profile_id", "category");
