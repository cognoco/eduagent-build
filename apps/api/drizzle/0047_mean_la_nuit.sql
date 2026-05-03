CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_notes_content_trgm_idx" ON "topic_notes" USING gin ("content" gin_trgm_ops);