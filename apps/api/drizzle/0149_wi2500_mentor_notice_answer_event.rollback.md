# Rollback — 0149_wi2500_mentor_notice_answer_event

## Changes in this migration

1. `ALTER TABLE "mentor_notices" DROP CONSTRAINT "mentor_notices_source_session_unique"`
2. `ALTER TABLE "mentor_notices" ADD COLUMN "answer_event_id" uuid`
3. `ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk"` (FK → `session_events.id`, `ON DELETE SET NULL`)
4. `CREATE UNIQUE INDEX "mentor_notices_source_session_answer_event_uq"` on `(source_session_id, answer_event_id)` WHERE `answer_event_id IS NOT NULL`
5. `CREATE UNIQUE INDEX "mentor_notices_source_session_null_evidence_uq"` on `(source_session_id)` WHERE `answer_event_id IS NULL`

## Rollback

**Possible:** Yes, with data loss on `answer_event_id` only.

**Data loss:**
- `mentor_notices.answer_event_id` values are dropped — the durable evidence link (which learner-answer event a notice's evidence is anchored to) is lost. The `concept`/`correction_hint` copy and all other notice state are untouched.
- No row loss: nothing in this migration deletes or moves existing `mentor_notices` rows, and no backfill was needed going forward (the retired constraint already guaranteed ≤1 row/session, so every existing row already satisfies both new partial indexes as-is).

**Procedure:**
```sql
-- Drop the two partial unique indexes this migration created
DROP INDEX IF EXISTS "mentor_notices_source_session_answer_event_uq";
DROP INDEX IF EXISTS "mentor_notices_source_session_null_evidence_uq";

-- Drop the FK and the additive column
ALTER TABLE "mentor_notices" DROP CONSTRAINT IF EXISTS "mentor_notices_answer_event_id_session_events_id_fk";
ALTER TABLE "mentor_notices" DROP COLUMN IF EXISTS "answer_event_id";

-- Restore the retired session-only unique constraint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_source_session_unique" UNIQUE ("source_session_id");
```

**Side effects on rollback:**
- The restored `mentor_notices_source_session_unique` constraint reinstates the pre-WI-2500 behavior of ≤1 notice per session, ever — including the case this migration was written to fix (a second, differently-evidenced notice in the same session). If any such second-per-session rows were created while this migration was live, the `ADD CONSTRAINT` step above fails on the existing duplicate and those extra rows must be resolved (merged or deleted) before the constraint can be re-added.
- Application code (`apps/api/src/services/mentor-notices/state.ts`) references `answer_event_id` directly in its `onConflictDoNothing` target; a schema rollback without a matching code rollback will break notice creation. Roll back the WI-2500 code changes in lockstep with this migration.
