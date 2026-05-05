CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

ALTER TABLE "topic_notes" ADD COLUMN IF NOT EXISTS "session_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'topic_notes_session_id_learning_sessions_id_fk'
  ) THEN
    ALTER TABLE "topic_notes"
      ADD CONSTRAINT "topic_notes_session_id_learning_sessions_id_fk"
      FOREIGN KEY ("session_id")
      REFERENCES "public"."learning_sessions"("id")
      ON DELETE set null
      ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "topic_notes" DROP CONSTRAINT IF EXISTS "topic_notes_topic_id_profile_id_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_notes_topic_profile_idx" ON "topic_notes" USING btree ("topic_id","profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_notes_session_id_idx" ON "topic_notes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_notes_content_trgm_idx" ON "topic_notes" USING gin ("content" gin_trgm_ops);--> statement-breakpoint

ALTER TABLE "xp_ledger" ADD COLUMN IF NOT EXISTS "reflection_multiplier_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_ledger" ADD COLUMN IF NOT EXISTS "reflection_applied_by_session_id" uuid;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'xp_ledger_reflection_applied_by_session_id_learning_sessions_id_fk'
  ) THEN
    ALTER TABLE "xp_ledger"
      ADD CONSTRAINT "xp_ledger_reflection_applied_by_session_id_learning_sessions_id_fk"
      FOREIGN KEY ("reflection_applied_by_session_id")
      REFERENCES "public"."learning_sessions"("id")
      ON DELETE set null
      ON UPDATE no action;
  END IF;
END $$;
