ALTER TABLE "mentor_notices" DROP CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk";
--> statement-breakpoint
ALTER TABLE "mentor_notices" ADD CONSTRAINT "mentor_notices_answer_event_id_session_events_id_fk" FOREIGN KEY ("answer_event_id") REFERENCES "public"."session_events"("id") ON DELETE cascade ON UPDATE no action;