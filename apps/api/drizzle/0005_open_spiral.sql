-- Idempotency retrofit: all ALTER TYPE ADD VALUE use IF NOT EXISTS
ALTER TYPE "public"."session_event_type" ADD VALUE IF NOT EXISTS 'quick_action' BEFORE 'understanding_check';
--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE IF NOT EXISTS 'user_feedback' BEFORE 'understanding_check';
--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE IF NOT EXISTS 'ocr_correction' BEFORE 'understanding_check';
--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE IF NOT EXISTS 'homework_problem_started' BEFORE 'evaluate_challenge';
--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE IF NOT EXISTS 'homework_problem_completed' BEFORE 'evaluate_challenge';