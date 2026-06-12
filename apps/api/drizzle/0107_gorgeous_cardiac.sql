-- @reference-only
-- ============================================================================
-- REFERENCE ONLY — DO NOT APPLY TO STAGING OR PRODUCTION.
-- This migration (concept-capture: concepts + concept_mastery, for the B
-- "mastery star") is superseded by the identity-foundation baseline reset
-- (MMT-ADR-0012, one-time create-from-empty baseline). Its FKs target
-- `profiles`, which the reset renames to `person`, so this SQL is
-- reset-incompatible and will be regenerated against the new baseline.
-- Status: committed for shape reference, applied nowhere. Iterate in dev via
-- `db:push:dev`; re-home these tables into the post-reset baseline.
-- See docs/glossary.md §4 (note marks) and _wip/identity-foundation/data-model.md §1.
-- ============================================================================
CREATE TYPE "public"."concept_mastery_status" AS ENUM('solid', 'partial', 'missing', 'misconception');--> statement-breakpoint
CREATE TABLE "concept_mastery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"concept_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" "concept_mastery_status" NOT NULL,
	"verified_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"source_session_id" uuid,
	"learner_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_mastery_concept_unique" UNIQUE("concept_id")
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepts_profile_topic_label_unique" UNIQUE("profile_id","topic_id","normalized_label")
);
--> statement-breakpoint
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_source_session_id_learning_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_mastery_profile_id_idx" ON "concept_mastery" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "concepts_profile_topic_idx" ON "concepts" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX "concepts_profile_id_idx" ON "concepts" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "concept_mastery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "concepts" ENABLE ROW LEVEL SECURITY;