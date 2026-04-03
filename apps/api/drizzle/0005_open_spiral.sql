ALTER TYPE "public"."session_event_type" ADD VALUE 'quick_action' BEFORE 'understanding_check';--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE 'user_feedback' BEFORE 'understanding_check';--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE 'ocr_correction' BEFORE 'understanding_check';--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE 'homework_problem_started' BEFORE 'evaluate_challenge';--> statement-breakpoint
ALTER TYPE "public"."session_event_type" ADD VALUE 'homework_problem_completed' BEFORE 'evaluate_challenge';