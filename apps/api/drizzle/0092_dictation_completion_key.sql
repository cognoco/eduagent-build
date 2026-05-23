ALTER TABLE "dictation_results" ADD COLUMN "completion_key" uuid;--> statement-breakpoint
WITH legacy_completion_keys AS (
  SELECT
    "id",
    md5('dictation-result:' || "profile_id"::text || ':' || "date"::text || ':' || "mode"::text) AS legacy_hex
  FROM "dictation_results"
  WHERE "completion_key" IS NULL
)
UPDATE "dictation_results" AS result
SET "completion_key" = (
  substr(legacy_hex, 1, 8) || '-' ||
  substr(legacy_hex, 9, 4) || '-' ||
  '5' || substr(legacy_hex, 14, 3) || '-' ||
  substr('89ab', ((position(substr(legacy_hex, 17, 1) in '0123456789abcdef') - 1) % 4) + 1, 1) ||
  substr(legacy_hex, 18, 3) || '-' ||
  substr(legacy_hex, 21, 12)
)::uuid
FROM legacy_completion_keys
WHERE result."id" = legacy_completion_keys."id";--> statement-breakpoint
ALTER TABLE "dictation_results" ALTER COLUMN "completion_key" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_dictation_results_profile_date_mode";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dictation_results_profile_completion_key" ON "dictation_results" USING btree ("profile_id","completion_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dictation_results_profile_date_mode" ON "dictation_results" USING btree ("profile_id","date","mode");
