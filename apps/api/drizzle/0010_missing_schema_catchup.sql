-- Migration 0010: Catch remaining schema drift
-- Three items defined in the Drizzle schema but never migrated:
--   1. topic_connections table (curriculum graph edges)
--   2. learning_sessions.input_mode column (voice/text tracking)
--   3. teaching_preferences.native_language column (language teaching)
-- All idempotent for databases that were synced via drizzle-kit push.

-- 1. Create topic_connections table
CREATE TABLE IF NOT EXISTS "topic_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_a_id" uuid NOT NULL,
	"topic_b_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "topic_connections" ADD CONSTRAINT "topic_connections_topic_a_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_a_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "topic_connections" ADD CONSTRAINT "topic_connections_topic_b_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_b_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 2. Add input_mode to learning_sessions
ALTER TABLE "learning_sessions" ADD COLUMN IF NOT EXISTS "input_mode" text DEFAULT 'text' NOT NULL;
--> statement-breakpoint

-- 3. Add native_language to teaching_preferences
ALTER TABLE "teaching_preferences" ADD COLUMN IF NOT EXISTS "native_language" text;
