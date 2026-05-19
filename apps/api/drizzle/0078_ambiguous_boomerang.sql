ALTER TABLE "learning_modes" DROP COLUMN IF EXISTS "mode";--> statement-breakpoint
ALTER TABLE "learning_modes" DROP COLUMN IF EXISTS "consecutive_summary_skips";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."learning_mode";