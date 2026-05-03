# Rollback — 0048_sticky_genesis

## Changes in this migration

1. Drop unique constraint `topic_notes_topic_id_profile_id_unique` from `topic_notes`.
2. Add column `topic_notes.session_id uuid references learning_sessions(id) on delete set null`.

## Rollback

**Possible:** Partial. The added column can be dropped without data loss to other tables. Re-adding the unique constraint is only possible if no `(topic_id, profile_id)` pair has more than one row at the time of rollback.

**Data loss:**
- `topic_notes.session_id` values are dropped (link from a note back to the session that produced it is lost).
- If multiple notes per topic exist (which migration 0048 was designed to allow), recovering the unique constraint requires deleting all but one row per `(topic_id, profile_id)`. Older notes for the duplicates are permanently lost in that recovery path.

**Procedure:**
```sql
-- 1. Drop the additive column.
ALTER TABLE "topic_notes" DROP COLUMN "session_id";

-- 2. Deduplicate before re-adding the unique constraint.
--    Keeps the most recently updated row per (topic_id, profile_id),
--    tiebreak on id. Adjust the keep-policy if a different row should win.
DELETE FROM "topic_notes" a
USING "topic_notes" b
WHERE a.topic_id = b.topic_id
  AND a.profile_id = b.profile_id
  AND (
    a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id)
  );

-- 3. Re-add the unique constraint.
ALTER TABLE "topic_notes"
  ADD CONSTRAINT "topic_notes_topic_id_profile_id_unique"
  UNIQUE ("topic_id", "profile_id");
```

**Side effects on rollback:**
- The mobile multi-note UI (Library v3 topic page) will degrade to single-note behavior; users with multiple notes per topic will lose the extras during step 2.
- `getTopicIdsWithNotes` no longer needs `selectDistinct`, but leaving it in place is harmless.
- Auto-note-from-summary (session-summary.ts → createNoteForSession) will hit `ConflictError('Note limit reached')` for any topic that already has a note; that path is already non-fatal but the user will not get an auto-note for repeat sessions on the same topic until manually deleted.

**Risk assessment:** Re-adding the unique constraint after Library v3 has shipped is destructive (deletes rows). If an emergency rollback is required, prefer dropping only the `session_id` column and leaving the unique constraint absent — that combination matches pre-Library-v3 behavior at the application layer (single note per topic) without losing data.
