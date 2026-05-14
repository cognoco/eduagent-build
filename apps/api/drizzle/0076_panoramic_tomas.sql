-- [BUG-4] Enforce idempotency at the (profile_id, date, mode) granularity.
-- Pre-fix: plain index allowed duplicate rows from client retries.
-- Post-fix: unique index + repository onConflictDoUpdate make the write idempotent.
--
-- Defensive pre-step: collapse any pre-existing duplicates by keeping the most
-- recently inserted row per (profile_id, date, mode). dictation_results.id is
-- a UUIDv7 so larger ids are newer; ORDER BY id DESC + DISTINCT ON gives the
-- latest row per group. This protects the CREATE UNIQUE INDEX from failing on
-- legacy data, and is a no-op when no duplicates exist.
DELETE FROM "dictation_results"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("profile_id", "date", "mode") "id"
  FROM "dictation_results"
  ORDER BY "profile_id", "date", "mode", "id" DESC
);
--> statement-breakpoint
DROP INDEX "idx_dictation_results_profile_date";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_dictation_results_profile_date_mode" ON "dictation_results" USING btree ("profile_id","date","mode");
