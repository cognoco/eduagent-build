-- Idempotency retrofit: ADD COLUMN uses IF NOT EXISTS, UPDATE with WHERE is already idempotent
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "birth_year" integer;
--> statement-breakpoint
UPDATE "profiles"
SET "birth_year" = EXTRACT(YEAR FROM "birth_date")::integer
WHERE "birth_date" IS NOT NULL
  AND "birth_year" IS NULL;
