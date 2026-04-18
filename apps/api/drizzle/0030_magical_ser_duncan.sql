ALTER TYPE "public"."notification_type" ADD VALUE 'dictation_review';--> statement-breakpoint
CREATE TABLE "quiz_mastery_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"activity_type" "quiz_activity_type" NOT NULL,
	"item_key" text NOT NULL,
	"item_answer" text NOT NULL,
	"ease_factor" numeric(4, 2) DEFAULT '2.5' NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone NOT NULL,
	"mc_success_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_quiz_mastery_profile_activity_key" UNIQUE("profile_id","activity_type","item_key")
);
--> statement-breakpoint
ALTER TABLE "quiz_mastery_items" ADD CONSTRAINT "quiz_mastery_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quiz_mastery_due" ON "quiz_mastery_items" USING btree ("profile_id","activity_type","next_review_at");