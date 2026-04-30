CREATE TYPE "public"."filing_status" AS ENUM('filing_pending', 'filing_failed', 'filing_recovered');--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN "filed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN "filing_status" "filing_status";--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN "filing_retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "learning_sessions_filing_status_idx" ON "learning_sessions" USING btree ("filing_status") WHERE "learning_sessions"."filing_status" IS NOT NULL;