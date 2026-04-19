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

-- 1. profiles: new columns
ALTER TABLE "profiles"
  ADD COLUMN "conversation_language" text NOT NULL DEFAULT 'en';

ALTER TABLE "profiles"
  ADD COLUMN "pronouns" text;

-- 2. profiles: CHECK constraint for conversation_language
-- Matches the pgEnum-style whitelist in the Drizzle schema. If this list
-- expands, both the CHECK and the Zod conversationLanguageSchema must update.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_conversation_language_check"
  CHECK ("conversation_language" IN ('en','cs','es','fr','de','it','pt','pl'));

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
