-- Existing credentialed people have already passed the product's historical
-- first-run surface and must not be looped through a new launch gate. Managed
-- children remain NULL so their later credentialed join is resumably gated.
ALTER TABLE "person" ADD COLUMN "conversation_language_confirmed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "person"
SET "conversation_language_confirmed_at" = "updated_at"
WHERE EXISTS (
  SELECT 1
  FROM "login"
  WHERE "login"."person_id" = "person"."id"
);
