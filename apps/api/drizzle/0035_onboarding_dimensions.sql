-- BKT-C.1 / BKT-C.2 — Onboarding personalization dimensions + interests shape.
--
-- This migration covers two coordinated changes that are bundled because both
-- touch the onboarding data model and it is simpler to ship them together:
--   1. profiles.conversation_language (NOT NULL DEFAULT 'en')
--   2. profiles.pronouns (nullable text)
--   3. learning_profiles.interests shape: string[] -> InterestEntry[]
--      (idempotent; only rewrites entries still in legacy string shape)
--
-- Rollback notes:
--   * ALTER TABLE additions are reversible via DROP COLUMN (see .rollback.md).
--   * The interests UPDATE is LOSSY — original string[] shape cannot be
--     reconstructed. Forward-fix only. The forward-compatible reader in
--     @eduagent/schemas (interestsArraySchema) accepts both shapes during the
--     transition window and after, so rollout can be staggered.
--
-- Safety:
--   * Existing rows get conversation_language='en' (audit recommendation #1:
--     backfill existing profiles to 'en' because current behavior is English).
--   * pronouns starts NULL for every row. Child profiles below age 13 will
--     never be prompted (PRONOUNS_PROMPT_MIN_AGE in schemas).

-- Idempotency note:
--   All three steps are idempotent so this migration is safe to run against a
--   database that was provisioned via `db:push` before the SQL was generated.
--   Reason: during the BKT-C.1 rollout the schema was pushed directly to dev
--   and staging before the migration file was committed, which means a plain
--   `drizzle-kit migrate` would fail on "column already exists" / "constraint
--   already exists". Reconciliation path per ~/.claude/CLAUDE.md Fix
--   Verification Rules: idempotent rewrite rather than a manual
--   __drizzle_migrations insert.

-- 1. profiles: new columns (idempotent)
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "conversation_language" text NOT NULL DEFAULT 'en';

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "pronouns" text;

-- 2. profiles: CHECK constraint for conversation_language (idempotent)
-- Matches the pgEnum-style whitelist in the Drizzle schema. If this list
-- expands, both the CHECK and the Zod conversationLanguageSchema must update.
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so we guard via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_conversation_language_check'
      AND conrelid = '"profiles"'::regclass
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_conversation_language_check"
      CHECK ("conversation_language" IN ('en','cs','es','fr','de','it','pt','pl'));
  END IF;
END$$;

-- 3. learning_profiles.interests: shape rewrite (idempotent)
-- Only touches rows where at least one entry is still a bare string. Rows that
-- already contain InterestEntry objects are left untouched. Rows with an
-- empty array are untouched (the WHERE guards this).
UPDATE "learning_profiles"
SET "interests" = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(elem) = 'string'
        THEN jsonb_build_object('label', elem, 'context', 'both')
      ELSE elem
    END
  )
  FROM jsonb_array_elements("interests") AS elem
)
WHERE jsonb_typeof("interests") = 'array'
  AND jsonb_array_length("interests") > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("interests") AS elem
    WHERE jsonb_typeof(elem) = 'string'
  );
