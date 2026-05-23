ALTER TABLE "dictation_results" ADD COLUMN "completion_key" uuid;--> statement-breakpoint
UPDATE "dictation_results"
SET "completion_key" = "id"
WHERE "completion_key" IS NULL;--> statement-breakpoint
ALTER TABLE "dictation_results" ALTER COLUMN "completion_key" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_dictation_results_profile_date_mode";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dictation_results_profile_completion_key" ON "dictation_results" USING btree ("profile_id","completion_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dictation_results_profile_date_mode" ON "dictation_results" USING btree ("profile_id","date","mode");
