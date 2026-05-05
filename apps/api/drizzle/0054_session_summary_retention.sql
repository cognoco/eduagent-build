ALTER TABLE "session_summaries" ADD COLUMN "llm_summary" jsonb;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "summary_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "purged_at" timestamp with time zone;