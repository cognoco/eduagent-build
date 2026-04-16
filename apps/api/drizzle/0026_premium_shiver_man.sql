CREATE TYPE "public"."dictation_mode" AS ENUM('homework', 'surprise');--> statement-breakpoint
CREATE TABLE "dictation_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sentence_count" integer NOT NULL,
	"mistake_count" integer,
	"mode" "dictation_mode" NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dictation_results" ADD CONSTRAINT "dictation_results_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dictation_results_profile_date" ON "dictation_results" USING btree ("profile_id","date");