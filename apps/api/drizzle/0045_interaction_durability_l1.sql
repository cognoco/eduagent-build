CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"flow" text NOT NULL,
	"surface_key" text NOT NULL,
	"content" text NOT NULL,
	"attempts" integer NOT NULL,
	"first_attempted_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_reason" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
ALTER TABLE "session_events" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_messages_profile_idx" ON "support_messages" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_messages_profile_client_id_uniq" ON "support_messages" USING btree ("profile_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_client_id_uniq" ON "session_events" USING btree ("session_id","client_id") WHERE "session_events"."client_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
