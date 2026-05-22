-- 0087_bug405_language_check_idempotent.sql
-- BUG-405: Idempotent rebuild of profiles_conversation_language_check to recover
-- dev DBs that push-synced between migration 0035 (8 languages: en,cs,es,fr,de,it,pt,pl)
-- and migration 0061 (10 languages: +ja,+nb) and therefore retained the stale
-- 8-language CHECK, causing INSERT failures for any profile with
-- conversation_language IN ('ja','nb').
--
-- The drizzle snapshot at 0086 already reflects the correct 10-language constraint,
-- so this migration carries no schema-state delta — it is a runtime-recovery migration
-- only, targeting live databases whose constraint was never widened via the normal
-- migration path.
--
-- Safety: DROP CONSTRAINT IF EXISTS is a no-op if the constraint is absent or already
-- correct. ADD CONSTRAINT ... NOT VALID skips row validation on large tables;
-- VALIDATE CONSTRAINT then checks existing rows without holding an AccessExclusiveLock
-- for the full scan.
--
-- ## Rollback
-- Rollback is safe IF no production rows carry conversation_language IN ('ja','nb').
-- To revert: DROP CONSTRAINT profiles_conversation_language_check, then re-add with
-- the 8-language list. If any rows already use 'ja' or 'nb', those rows would violate
-- the reverted constraint — export and blank those rows before reverting.
-- Practically: reverting is NOT recommended; widen, never narrow.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_conversation_language_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_conversation_language_check
  CHECK (conversation_language IN ('en','cs','es','fr','de','it','pt','pl','ja','nb'))
  NOT VALID;

ALTER TABLE profiles VALIDATE CONSTRAINT profiles_conversation_language_check;
