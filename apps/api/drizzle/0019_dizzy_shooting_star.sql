CREATE TABLE "learning_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"learning_style" jsonb,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"struggles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"communication_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suppressed_inferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interest_timestamps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effectiveness_session_count" integer DEFAULT 0 NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"memory_consent_status" text DEFAULT 'pending' NOT NULL,
	"consent_prompt_dismissed_at" timestamp with time zone,
	"memory_collection_enabled" boolean DEFAULT false NOT NULL,
	"memory_injection_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_profiles_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
ALTER TABLE "learning_profiles" ADD CONSTRAINT "learning_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_profiles_profile_id_idx" ON "learning_profiles" USING btree ("profile_id");