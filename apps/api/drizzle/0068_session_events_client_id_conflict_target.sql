-- Keep this unique index partial. Rows without client_id are legacy/non-idempotent
-- events and must retain their prior duplicate-NULL behavior.
--
-- Application writes that use this index must include the matching conflict
-- predicate (`WHERE client_id IS NOT NULL`) so Postgres can select the partial
-- arbiter index.
--
-- Rollback: see 0068_session_events_client_id_conflict_target.rollback.md.
DROP INDEX IF EXISTS "session_events_session_client_id_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_client_id_uniq"
  ON "session_events" USING btree ("session_id", "client_id")
  WHERE "client_id" IS NOT NULL;
