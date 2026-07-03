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
CREATE INDEX "activation_events_anonymous_created_idx" ON "activation_events" USING btree ("anonymous_id","created_at");