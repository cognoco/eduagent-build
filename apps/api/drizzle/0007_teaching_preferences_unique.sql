-- Bug #1: The schema declares a UNIQUE(profile_id, subject_id) constraint on
-- teaching_preferences, but the initial migration (0000) never created it.
-- This means .onConflictDoUpdate() in setTeachingPreference may have silently
-- inserted duplicate rows. Deduplicate first, then add the constraint.

-- Step 1: Delete duplicate rows, keeping only the most recently updated row
-- per (profile_id, subject_id) pair.
DELETE FROM "teaching_preferences"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("profile_id", "subject_id") "id"
  FROM "teaching_preferences"
  ORDER BY "profile_id", "subject_id", "updated_at" DESC
);
--> statement-breakpoint

-- Step 2: Add the unique constraint that the schema already declares.
ALTER TABLE "teaching_preferences"
  ADD CONSTRAINT "teaching_preferences_profile_subject_unique"
  UNIQUE ("profile_id", "subject_id");
