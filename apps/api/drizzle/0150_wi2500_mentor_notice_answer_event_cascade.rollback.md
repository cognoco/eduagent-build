# Rollback — 0150_wi2500_mentor_notice_answer_event_cascade

## Changes in this migration

1. `ALTER TABLE "mentor_notices" DROP CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk"` (the `ON DELETE SET NULL` FK created in 0149)
2. `ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk"` (FK → `session_events.id`, now `ON DELETE CASCADE`)

Only the FK's `ON DELETE` action changes (`SET NULL` → `CASCADE`). No column, table, type, index, or row is added or removed.

## Rollback

**Possible:** Yes, with no data loss.

**Data loss:**
- None. This migration only alters an FK's delete action; it touches no rows and no columns. Rolling back re-alters the same FK.

**Procedure:**
```sql
-- Restore the ON DELETE SET NULL behavior from 0149
ALTER TABLE "mentor_notices" DROP CONSTRAINT IF EXISTS "mentor_notices_answer_event_id_session_events_id_fk";
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk"
  FOREIGN KEY ("answer_event_id") REFERENCES "public"."session_events"("id") ON DELETE SET NULL ON UPDATE no action;
```

**Side effects on rollback:**
- Reverting to `ON DELETE SET NULL` reinstates the exact bug this migration fixed: purging a transcript (`purgeSessionTranscript` deletes a session's `session_events`) nulls the `answer_event_id` of every evidence-backed notice in that session, and two or more such notices then collide on `mentor_notices_source_session_null_evidence_uq` — aborting the purge transaction. Do not roll back unless the multi-notice-per-session capability (WI-2500) is also being reverted.
- Roll back the matching code change in lockstep: `packages/database/src/schema/mentor-notices.ts` sets this FK's `onDelete` to `'cascade'`; a SQL rollback without the code rollback leaves schema and code out of sync.
