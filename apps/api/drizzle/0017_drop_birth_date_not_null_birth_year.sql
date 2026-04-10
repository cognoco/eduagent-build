-- Backfill birth_year from birth_date where possible (column is still present
-- at this point in the migration). The fallback to 2000 only applies when
-- birth_date is also NULL — expected only in dev databases.
-- PRODUCTION RISK: If any production row has birth_year IS NULL AND birth_date
-- IS NULL, it will be assigned 2000 (age ~26 in 2026). Verify with:
--   SELECT count(*) FROM profiles WHERE birth_year IS NULL AND birth_date IS NULL;
-- before running on staging/production.
UPDATE "profiles" SET "birth_year" = EXTRACT(YEAR FROM "birth_date")::int WHERE "birth_year" IS NULL AND "birth_date" IS NOT NULL;--> statement-breakpoint
UPDATE "profiles" SET "birth_year" = 2000 WHERE "birth_year" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "birth_year" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "birth_date";