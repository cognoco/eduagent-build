# Rollback — 0056_schema_drift_repair

## Changes in this migration

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm` — enables trigram-based similarity indexing.
2. `ALTER TABLE topic_notes ADD COLUMN session_id uuid` (+ FK to `learning_sessions(id)` `ON DELETE SET NULL`).
3. `ALTER TABLE topic_notes DROP CONSTRAINT IF EXISTS topic_notes_topic_id_profile_id_unique` — removes the legacy `(topic_id, profile_id)` uniqueness constraint so multiple notes per (topic, profile) can coexist (the new model is one note per session).
4. `CREATE INDEX topic_notes_topic_profile_idx` on `(topic_id, profile_id)`.
5. `CREATE INDEX topic_notes_session_id_idx` on `(session_id)`.
6. `CREATE INDEX topic_notes_content_trgm_idx` GIN on `content gin_trgm_ops` — full-text similarity search.
7. `ALTER TABLE xp_ledger ADD COLUMN reflection_multiplier_applied boolean DEFAULT false NOT NULL`.
8. `ALTER TABLE xp_ledger ADD COLUMN reflection_applied_by_session_id uuid` (+ FK to `learning_sessions(id)` `ON DELETE SET NULL`).

## Rollback

**Possible:** Partial. Steps 1, 2, 4, 5, 6, 7, 8 are reversible (drop column / drop index / drop extension). Step 3 is **conditionally reversible**: the legacy unique constraint can only be re-added if the data still satisfies `(topic_id, profile_id)` uniqueness. Once any second note exists for an existing `(topic, profile)` pair (which the new design encourages — one note per session), re-adding the constraint will fail. At that point, restoring the constraint requires deleting all-but-one note per pair, which destroys session-linked review notes.

**Data loss:**
- If the migration is rolled back **before** any duplicate `(topic_id, profile_id)` rows are written, no data is lost.
- If rolled back **after** duplicates exist, restoring the unique constraint requires deleting per-session note rows; the surviving row is arbitrary unless ordered explicitly. New `session_id`, `content`, and any session-context metadata on the dropped rows are permanently lost.
- `topic_notes.session_id` and `xp_ledger.reflection_*` columns themselves contain backfilled data — dropping the columns drops all session linkage and reflection-applied state.

**Procedure (data-loss-free path — only valid if no duplicates exist):**
```sql
ALTER TABLE "topic_notes" DROP CONSTRAINT IF EXISTS "topic_notes_session_id_learning_sessions_id_fk";
ALTER TABLE "xp_ledger"   DROP CONSTRAINT IF EXISTS "xp_ledger_reflection_applied_by_session_id_learning_sessions_id_fk";

DROP INDEX IF EXISTS "topic_notes_content_trgm_idx";
DROP INDEX IF EXISTS "topic_notes_session_id_idx";
DROP INDEX IF EXISTS "topic_notes_topic_profile_idx";

ALTER TABLE "topic_notes" DROP COLUMN IF EXISTS "session_id";
ALTER TABLE "xp_ledger"   DROP COLUMN IF EXISTS "reflection_multiplier_applied";
ALTER TABLE "xp_ledger"   DROP COLUMN IF EXISTS "reflection_applied_by_session_id";

-- Only safe if no duplicate (topic_id, profile_id) rows exist:
ALTER TABLE "topic_notes"
  ADD CONSTRAINT "topic_notes_topic_id_profile_id_unique"
  UNIQUE ("topic_id", "profile_id");

-- pg_trgm is left in place — it has no usage cost when no indexes reference it,
-- and dropping it would also drop any other extension-dependent objects.
```

**Side effects on rollback:**
- Reflection multiplier state on existing XP ledger entries is lost. New sessions cannot record whether reflection was applied — replay risk if reflection rewards are recomputed.
- `topic_notes` reverts to one-note-per-(topic, profile). Any review surfaces or session recap UI that expects to render multiple session-linked notes per topic must be rolled back in lockstep, otherwise queries return collapsed/missing notes.
- Trigram similarity search on `topic_notes.content` is lost (the GIN index is gone).
- The `pg_trgm` extension is intentionally NOT dropped on rollback — leaving it installed is harmless and avoids cascade complications with any other index that may have started using it after this migration shipped.

**Recommendation:** Do not roll back after the new write path has written more than one `topic_notes` row per `(topic_id, profile_id)`. If rollback is required after that point, accept the data loss from forced deduplication, or roll forward with a fix instead.
