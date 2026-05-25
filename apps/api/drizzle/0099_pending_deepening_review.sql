ALTER TYPE "needs_deepening_status" ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TABLE "needs_deepening_topics" ADD COLUMN "pending_expires_at" timestamp with time zone;
