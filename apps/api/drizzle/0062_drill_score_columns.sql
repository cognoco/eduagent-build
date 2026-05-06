ALTER TABLE "session_events" ADD COLUMN "drill_correct" integer;--> statement-breakpoint
ALTER TABLE "session_events" ADD COLUMN "drill_total" integer;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_drill_score_range" CHECK (
  ("drill_correct" IS NULL AND "drill_total" IS NULL)
  OR (
    "drill_correct" IS NOT NULL
    AND "drill_total" IS NOT NULL
    AND "drill_correct" >= 0
    AND "drill_total" >= 0
    AND "drill_correct" <= "drill_total"
  )
) NOT VALID;--> statement-breakpoint
ALTER TABLE "session_events" VALIDATE CONSTRAINT "session_events_drill_score_range";
