CREATE TYPE "public"."mentor_notice_nudge_status" AS ENUM('pending', 'sent', 'skipped', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."mentor_notice_recheck_outcome" AS ENUM('locked_in', 'not_yet', 'dismissed', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."mentor_notice_status" AS ENUM('open', 'locked_in', 'dismissed', 'faded');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'notice_recheck' BEFORE 'weekly_progress';--> statement-breakpoint
CREATE TABLE "mentor_notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"source_session_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"correction_hint" text,
	"status" "mentor_notice_status" DEFAULT 'open' NOT NULL,
	"last_offered_session_id" uuid,
	"last_offered_at" timestamp with time zone,
	"last_deferred_at" timestamp with time zone,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"recheck_attempt_count" integer DEFAULT 0 NOT NULL,
	"first_recheck_at" timestamp with time zone,
	"last_recheck_at" timestamp with time zone,
	"last_recheck_outcome" "mentor_notice_recheck_outcome",
	"nudge_status" "mentor_notice_nudge_status" DEFAULT 'pending' NOT NULL,
	"nudged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "mentor_notices_source_session_unique" UNIQUE("source_session_id"),
	CONSTRAINT "mentor_notices_offer_count_nonnegative" CHECK ("mentor_notices"."offer_count" >= 0),
	CONSTRAINT "mentor_notices_recheck_attempt_count_nonnegative" CHECK ("mentor_notices"."recheck_attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "mentor_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mentor_notices' AND policyname='mentor_notices_profile_isolation') THEN
    CREATE POLICY "mentor_notices_profile_isolation" ON "mentor_notices"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_profile_id_person_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_source_session_id_learning_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_last_offered_session_id_learning_sessions_id_fk" FOREIGN KEY ("last_offered_session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_notices_profile_status_created_idx" ON "mentor_notices" USING btree ("profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mentor_notices_subject_status_created_idx" ON "mentor_notices" USING btree ("subject_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mentor_notices_topic_id_idx" ON "mentor_notices" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "mentor_notices_last_offered_session_id_idx" ON "mentor_notices" USING btree ("last_offered_session_id");
