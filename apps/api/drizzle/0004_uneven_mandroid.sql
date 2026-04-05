-- Idempotency retrofit: CREATE TYPE wrapped in exception handler,
-- ALTER TYPE ADD VALUE uses IF NOT EXISTS, ADD COLUMN uses IF NOT EXISTS,
-- ALTER COLUMN SET DEFAULT is already idempotent
DO $$ BEGIN
  CREATE TYPE "public"."celebration_level" AS ENUM('all', 'big_only', 'off');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE IF NOT EXISTS 'system_prompt' BEFORE 'understanding_check';
--> statement-breakpoint
ALTER TABLE "quota_pools" ALTER COLUMN "monthly_limit" SET DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "quota_pools" ADD COLUMN IF NOT EXISTS "daily_limit" integer;
--> statement-breakpoint
ALTER TABLE "quota_pools" ADD COLUMN IF NOT EXISTS "used_today" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN IF NOT EXISTS "wall_clock_seconds" integer;
--> statement-breakpoint
ALTER TABLE "coaching_card_cache" ADD COLUMN IF NOT EXISTS "pending_celebrations" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "coaching_card_cache" ADD COLUMN IF NOT EXISTS "celebrations_seen_by_child" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "coaching_card_cache" ADD COLUMN IF NOT EXISTS "celebrations_seen_by_parent" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "learning_modes" ADD COLUMN IF NOT EXISTS "median_response_seconds" integer;
--> statement-breakpoint
ALTER TABLE "learning_modes" ADD COLUMN IF NOT EXISTS "celebration_level" "celebration_level" DEFAULT 'all' NOT NULL;