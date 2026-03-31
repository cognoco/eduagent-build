CREATE TYPE "public"."celebration_level" AS ENUM('all', 'big_only', 'off');--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE 'system_prompt' BEFORE 'understanding_check';--> statement-breakpoint
ALTER TABLE "quota_pools" ALTER COLUMN "monthly_limit" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "quota_pools" ADD COLUMN "daily_limit" integer;--> statement-breakpoint
ALTER TABLE "quota_pools" ADD COLUMN "used_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD COLUMN "wall_clock_seconds" integer;--> statement-breakpoint
ALTER TABLE "coaching_card_cache" ADD COLUMN "pending_celebrations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "coaching_card_cache" ADD COLUMN "celebrations_seen_by_child" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coaching_card_cache" ADD COLUMN "celebrations_seen_by_parent" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "learning_modes" ADD COLUMN "median_response_seconds" integer;--> statement-breakpoint
ALTER TABLE "learning_modes" ADD COLUMN "celebration_level" "celebration_level" DEFAULT 'all' NOT NULL;