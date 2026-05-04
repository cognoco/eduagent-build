-- Add index on topic_notes.session_id for the idempotency lookup in
-- services/notes.ts:insertNoteWithCap (selects on profileId + sessionId
-- to detect retries before insert). Without this index the lookup is a
-- sequential scan within profile scope.
CREATE INDEX IF NOT EXISTS "topic_notes_session_id_idx" ON "topic_notes" USING btree ("session_id");
