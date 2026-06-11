CREATE TYPE "public"."ledger_visibility" AS ENUM('self', 'supporter', 'both');--> statement-breakpoint
CREATE TABLE "mentor_activity_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"actor_job" text NOT NULL,
	"kind" text NOT NULL,
	"template_key" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" "ledger_visibility" DEFAULT 'self' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"surfaced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mentor_activity_ledger" ADD CONSTRAINT "mentor_activity_ledger_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_activity_ledger_pending_idx" ON "mentor_activity_ledger" USING btree ("profile_id","created_at") WHERE "mentor_activity_ledger"."surfaced_at" IS NULL;--> statement-breakpoint
CREATE INDEX "mentor_activity_ledger_profile_id_idx" ON "mentor_activity_ledger" USING btree ("profile_id");
