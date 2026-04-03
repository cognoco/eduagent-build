ALTER TABLE "profiles" ADD COLUMN "birth_year" integer;
--> statement-breakpoint
UPDATE "profiles"
SET "birth_year" = EXTRACT(YEAR FROM "birth_date")::integer
WHERE "birth_date" IS NOT NULL
  AND "birth_year" IS NULL;
