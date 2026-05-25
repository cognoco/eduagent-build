CREATE TABLE IF NOT EXISTS "bookmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "closing_line" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "learner_recap" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "next_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "next_topic_reason" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookmarks_profile_id_profiles_id_fk'
      AND conrelid = '"bookmarks"'::regclass
  ) THEN
    ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookmarks_subject_id_subjects_id_fk'
      AND conrelid = '"bookmarks"'::regclass
  ) THEN
    ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END$$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookmarks_topic_id_curriculum_topics_id_fk'
      AND conrelid = '"bookmarks"'::regclass
  ) THEN
    ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_profile_id_idx" ON "bookmarks" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_session_id_idx" ON "bookmarks" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookmarks_profile_event_unique" ON "bookmarks" USING btree ("profile_id","event_id");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_summaries_next_topic_id_curriculum_topics_id_fk'
      AND conrelid = '"session_summaries"'::regclass
  ) THEN
    ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_next_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("next_topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END$$;--> statement-breakpoint
ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;
