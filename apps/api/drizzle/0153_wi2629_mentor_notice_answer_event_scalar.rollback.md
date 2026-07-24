# Rollback — 0153_wi2629_mentor_notice_answer_event_scalar

## Changes in this migration

1. `ALTER TABLE "mentor_notices" DROP CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk"` (the `ON DELETE CASCADE` FK created in 0150).

Only the FK is dropped. `answer_event_id` stays a `uuid` column with the same
name, nullability, and both partial unique indexes from 0149/0150 untouched.
No column, table, type, index, or row is added or removed.

## Rollback

**Possible:** Yes, with no data loss — but re-adding the FK requires every
existing `answer_event_id` value to still reference a live `session_events`
row. Once this migration has been live and any transcript purge has run, some
`answer_event_id` values may point at rows `purgeSessionTranscript` has since
deleted (that is this change's entire point — see below), and re-adding the
FK will fail with a foreign-key-violation until those dangling rows are
cleaned up or re-nulled.

**Data loss:**
- None from this migration's own DDL. Re-establishing the FK as `ON DELETE
  CASCADE` would, on its next purge, resume deleting mentor notices whose
  evidence event was purged — silently discarding notices that this change
  was written to preserve.

**Procedure (only safe once no `answer_event_id` is dangling):**
```sql
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk"
  FOREIGN KEY ("answer_event_id") REFERENCES "public"."session_events"("id") ON DELETE CASCADE ON UPDATE no action;
```

**Side effects on rollback:**
- Reverting to a FK (of either `CASCADE` or `SET NULL` flavor) reinstates the
  WI-2500/OPQ-144 collision class this migration exists to eliminate: a
  purge-time cascade or null-out of `answer_event_id` again risks colliding
  evidence-backed notices onto `mentor_notices_source_session_null_evidence_uq`,
  or (the case this migration targets) destroys the notice's evidence identity
  outright. Do not roll back unless OPQ-144's F2 Option A ruling is also being
  reverted.
- Roll back the matching code change in lockstep:
  `packages/database/src/schema/mentor-notices.ts` must re-add the
  `.references(...)` clause, and `purgeSessionTranscript`
  (`apps/api/src/services/transcript-purge.ts`) must not be relied on to
  leave `answer_event_id` dangling once the FK is back.
