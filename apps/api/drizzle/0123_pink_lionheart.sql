ALTER TABLE "curriculum_books" ADD COLUMN "failed_reason" text;--> statement-breakpoint
ALTER TABLE "curriculum_books" ADD COLUMN "failed_at" timestamp with time zone;