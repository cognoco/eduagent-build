CREATE TYPE "public"."retrieval_grader" AS ENUM('llm', 'fallback_heuristic');--> statement-breakpoint
CREATE TYPE "public"."retrieval_next_action" AS ENUM('advance', 'reschedule_soon', 'relearn', 'redirect_to_library');--> statement-breakpoint
CREATE TYPE "public"."retrieval_verdict" AS ENUM('solid', 'partial', 'missing', 'misconception');--> statement-breakpoint
CREATE TABLE "retrieval_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"session_id" uuid,
	"answer_event_id" uuid,
	"prompt_text" text NOT NULL,
	"learner_answer" text NOT NULL,
	"quality" smallint,
	"verdict" "retrieval_verdict",
	"next_action" "retrieval_next_action" NOT NULL,
	"graded_by" "retrieval_grader" NOT NULL,
	"rubric_rationale" text,
	"misconception" text,
	"evidence_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_routing_rung" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retrieval_events_profile_topic_idx" ON "retrieval_events" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX "retrieval_events_profile_created_idx" ON "retrieval_events" USING btree ("profile_id","created_at");--> statement-breakpoint
ALTER TABLE "retrieval_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "retrieval_events_profile_isolation" ON "retrieval_events" USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid) WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
