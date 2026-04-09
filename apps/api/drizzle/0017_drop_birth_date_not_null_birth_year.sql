-- Safety backfill for dev databases that may have NULL birth_year rows
UPDATE "profiles" SET "birth_year" = 2000 WHERE "birth_year" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "birth_year" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "birth_date";