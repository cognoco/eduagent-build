ALTER TYPE "public"."needs_deepening_status" ADD VALUE IF NOT EXISTS 'pending_review' BEFORE 'resolved';--> statement-breakpoint
ALTER TABLE "needs_deepening_topics" ADD COLUMN IF NOT EXISTS "pending_expires_at" timestamp with time zone;
