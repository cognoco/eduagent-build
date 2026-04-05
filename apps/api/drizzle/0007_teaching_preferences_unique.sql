-- Idempotency retrofit: DELETE with WHERE is already idempotent,
-- ADD CONSTRAINT wrapped in exception handler

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
DO $$ BEGIN
  ALTER TABLE "teaching_preferences"
    ADD CONSTRAINT "teaching_preferences_profile_subject_unique"
    UNIQUE ("profile_id", "subject_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
