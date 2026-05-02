ALTER TYPE "public"."draft_status" ADD VALUE 'completing' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."draft_status" ADD VALUE 'failed' BEFORE 'expired';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'interview_ready';--> statement-breakpoint
ALTER TABLE "onboarding_drafts" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "session_events" ADD COLUMN "orphan_reason" text;