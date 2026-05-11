CREATE TYPE "public"."book_suggestion_category" AS ENUM('related', 'explore');--> statement-breakpoint
CREATE TYPE "public"."nudge_template" AS ENUM('you_got_this', 'proud_of_you', 'quick_session', 'thinking_of_you');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'nudge';--> statement-breakpoint
CREATE TABLE "nudges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_profile_id" uuid NOT NULL,
	"to_profile_id" uuid NOT NULL,
	"template" "nudge_template" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "book_suggestions" ADD COLUMN "category" "book_suggestion_category";--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "book_suggestions_last_generation_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_from_profile_id_profiles_id_fk" FOREIGN KEY ("from_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_to_profile_id_profiles_id_fk" FOREIGN KEY ("to_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nudges_to_profile_read_at_idx" ON "nudges" USING btree ("to_profile_id","read_at");--> statement-breakpoint
CREATE INDEX "nudges_from_to_created_at_idx" ON "nudges" USING btree ("from_profile_id","to_profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_suggestions_subject_title_unique_unpicked"
  ON "book_suggestions" ("subject_id", lower("title"))
  WHERE "picked_at" IS NULL;
