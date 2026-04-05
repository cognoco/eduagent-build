-- Migration 0009: Backfill is_owner for existing accounts
-- During the push-only era, profiles were created with is_owner defaulting to
-- false even for the first (and often only) profile on an account. The route
-- handler has always passed isFirstProfile = true, but databases bootstrapped
-- via `drizzle-kit push` never ran that code path for seed/manual data.
--
-- This migration sets is_owner = true on the oldest profile of every account
-- that currently has NO owner profile. Idempotent — accounts that already have
-- an owner profile are untouched.

UPDATE profiles
SET    is_owner   = true,
       updated_at = now()
WHERE  id IN (
  -- For each account with zero owner profiles, pick the oldest profile
  SELECT DISTINCT ON (p.account_id) p.id
  FROM   profiles p
  WHERE  NOT EXISTS (
    SELECT 1 FROM profiles o
    WHERE  o.account_id = p.account_id
      AND  o.is_owner   = true
  )
  ORDER BY p.account_id, p.created_at ASC
);
