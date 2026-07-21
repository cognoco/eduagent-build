ALTER TABLE "mentor_notices" DROP CONSTRAINT "mentor_notices_source_session_unique";--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD COLUMN "answer_event_id" uuid;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk" FOREIGN KEY ("answer_event_id") REFERENCES "public"."session_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_source_session_answer_event_unique" UNIQUE NULLS NOT DISTINCT("source_session_id","answer_event_id");