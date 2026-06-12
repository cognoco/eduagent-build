CREATE TABLE "feedback_retry_queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"meta_lines" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_retry_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Policy convention per 0085 (BUG-216) profile-isolation sweep. profile_id is
-- TEXT here (the feedback route can record the literal 'unknown'), so the GUC
-- comparison is text-to-text — no ::uuid cast. Guarded for idempotent re-runs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feedback_retry_queue' AND policyname='feedback_retry_queue_profile_isolation') THEN
    CREATE POLICY "feedback_retry_queue_profile_isolation" ON "feedback_retry_queue"
      USING ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), ''))
      WITH CHECK ("profile_id" = NULLIF(current_setting('app.current_profile_id', true), ''));
  END IF;
END $$;
