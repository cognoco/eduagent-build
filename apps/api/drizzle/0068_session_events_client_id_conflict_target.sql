DROP INDEX IF EXISTS "session_events_session_client_id_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_client_id_uniq"
  ON "session_events" USING btree ("session_id", "client_id")
  WHERE "client_id" IS NOT NULL;
