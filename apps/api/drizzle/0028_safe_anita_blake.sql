CREATE TYPE "public"."quiz_activity_type" AS ENUM('capitals', 'vocabulary', 'guess_who');--> statement-breakpoint
CREATE TYPE "public"."quiz_round_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "quiz_missed_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_type" "quiz_activity_type" NOT NULL,
	"question_text" text NOT NULL,
	"correct_answer" text NOT NULL,
	"source_round_id" uuid NOT NULL,
	"surfaced" boolean DEFAULT false NOT NULL,
	"converted_to_topic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_type" "quiz_activity_type" NOT NULL,
	"theme" text NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" integer,
	"total" integer NOT NULL,
	"xp_earned" integer,
	"library_question_indices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "quiz_round_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quiz_missed_items" ADD CONSTRAINT "quiz_missed_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_missed_items" ADD CONSTRAINT "quiz_missed_items_source_round_id_quiz_rounds_id_fk" FOREIGN KEY ("source_round_id") REFERENCES "public"."quiz_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_rounds" ADD CONSTRAINT "quiz_rounds_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quiz_missed_items_profile" ON "quiz_missed_items" USING btree ("profile_id","activity_type","surfaced");--> statement-breakpoint
CREATE INDEX "idx_quiz_rounds_profile_activity" ON "quiz_rounds" USING btree ("profile_id","activity_type");--> statement-breakpoint
CREATE INDEX "idx_quiz_rounds_profile_status" ON "quiz_rounds" USING btree ("profile_id","status");