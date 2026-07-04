CREATE TABLE "activation_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid,
	"anonymous_id" text,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"environment" text,
	"app_version" text,
	"platform" text,
	"profile_shape" text,
	"route" text,
	"dedupe_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_events_event_type_known" CHECK ("activation_events"."event_type" IN ('app_opened', 'signup_started', 'signup_completed', 'onboarding_completed', 'first_subject_or_lesson_started', 'first_session_started', 'first_session_completed', 'review_card_seen', 'review_card_tapped', 'day2_return'))
);
--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_profile_id_person_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activation_events_dedupe_key_uq" ON "activation_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "activation_events_created_at_idx" ON "activation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activation_events_profile_created_idx" ON "activation_events" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "activation_events_type_created_idx" ON "activation_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "activation_events_anonymous_created_idx" ON "activation_events" USING btree ("anonymous_id","created_at");--> statement-breakpoint
-- [WI-1504 / ASSUMP-F14] Row-Level Security for activation_events.
-- Mirrors the practice_activity_events / celebration_events pattern (migration
-- 0072), but activation_events.profile_id is NULLABLE BY DESIGN: pre-account
-- events (app_opened, signup_started) fire before any profile row exists, so
-- those rows carry profile_id = NULL. A bare `profile_id = current_setting(...)`
-- USING/WITH CHECK (the sibling pattern) evaluates to NULL — never TRUE — for a
-- NULL-profile row, which would block the exact pre-account writes this WI must
-- capture once the connection role switches from the RLS-bypassing owner
-- (neondb_owner) to app_user (S-06 Phase 2–4, currently parked). The
-- `profile_id IS NULL OR ...` clause admits NULL-profile system/pre-account rows
-- for every session while still scoping non-null rows to the active profile.
-- Admitting NULL rows broadly is intentional and safe: they are anonymous
-- funnel telemetry (anonymousId, event_type, build info) and carry no
-- per-profile or child content.
ALTER TABLE "activation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activation_events'
      AND policyname = 'activation_events_profile_isolation'
  ) THEN
    CREATE POLICY "activation_events_profile_isolation"
      ON "activation_events"
      USING (
        "profile_id" IS NULL
        OR "profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
      )
      WITH CHECK (
        "profile_id" IS NULL
        OR "profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid
      );
  END IF;
END $$;