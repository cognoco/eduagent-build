ALTER TABLE "assessments" ADD COLUMN "mastery_challenge_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "needs_deepening_topics" ADD COLUMN "source" text DEFAULT 'system_signal' NOT NULL;--> statement-breakpoint
ALTER TABLE "needs_deepening_topics" ADD COLUMN "concept" text;--> statement-breakpoint
ALTER TABLE "needs_deepening_topics" ADD COLUMN "misconception" text;--> statement-breakpoint
ALTER TABLE "needs_deepening_topics" ADD COLUMN "correction" text;