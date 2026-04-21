-- [BUG-524] Add weekly_reports table for persisted weekly parent reports.
--
-- NOTE: The ALTER TABLE statements below are idempotent (IF NOT EXISTS) because
-- migrations 0034 and 0035 already added these columns via hand-written SQL
-- that pre-dates the Drizzle snapshot chain. The Drizzle generator re-emits
-- them because the snapshot for 0033 doesn't include them. Making them
-- idempotent ensures this migration is safe against both fresh databases
-- and databases that already ran 0034/0035.

CREATE TABLE IF NOT EXISTS "weekly_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"report_week" date NOT NULL,
	"report_data" jsonb NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "conversation_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "pronouns" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "narrative" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "conversation_prompt" text;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN IF NOT EXISTS "engagement_signal" text;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_child_profile_id_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_reports_parent_child_week_uq" ON "weekly_reports" USING btree ("profile_id","child_profile_id","report_week");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_reports_child_week_idx" ON "weekly_reports" USING btree ("child_profile_id","report_week");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_conversation_language_check'
      AND conrelid = '"profiles"'::regclass
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_conversation_language_check"
      CHECK ("profiles"."conversation_language" IN ('en','cs','es','fr','de','it','pt','pl'));
  END IF;
END$$;
