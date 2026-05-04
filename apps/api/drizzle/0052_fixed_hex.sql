-- Pre-flight: truncate any existing pronouns longer than 32 chars BEFORE
-- adding the CHECK constraint. Otherwise the ADD CONSTRAINT validates
-- every existing row and the deploy would halt mid-migration if any prod
-- profile has a longer value (the column was added in 0035 with no length
-- limit). This is data-safe — pronouns over 32 chars are almost certainly
-- free-text noise (e.g. accidental paste) rather than a real identity
-- string, and the new product surface enforces 32 chars at the API layer.
UPDATE "profiles"
SET "pronouns" = LEFT("pronouns", 32)
WHERE "pronouns" IS NOT NULL AND char_length("pronouns") > 32;
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_pronouns_length_check" CHECK ("profiles"."pronouns" IS NULL OR char_length("profiles"."pronouns") <= 32);
