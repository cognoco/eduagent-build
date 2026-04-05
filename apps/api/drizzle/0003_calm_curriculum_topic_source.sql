-- Idempotency retrofit: CREATE TYPE wrapped in exception handler, ADD COLUMN uses IF NOT EXISTS
DO $$ BEGIN
  CREATE TYPE "public"."curriculum_topic_source" AS ENUM('generated', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "curriculum_topics"
ADD COLUMN IF NOT EXISTS "source" "curriculum_topic_source" DEFAULT 'generated' NOT NULL;
