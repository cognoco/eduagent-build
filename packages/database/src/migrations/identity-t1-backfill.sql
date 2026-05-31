-- Identity T1 backfill — SINGLE SOURCE OF TRUTH.
--
-- This exact text is (a) embedded verbatim in the additive migration
-- 0106_identity_t1_org_membership.sql for the one-time apply at migrate time,
-- and (b) executed by the integration test
-- (identity-backfill.integration.test.ts) after it seeds precursor rows —
-- because the package harness connects to an ALREADY-migrated DB and never
-- re-applies migrations, so the migration's embedded copy can never see rows a
-- test seeds afterward. A guard test asserts the migration embeds this byte for
-- byte (identity-backfill-embedded.test.ts).
--
-- It is one DO $$ block so it runs as a SINGLE statement (neon-serverless does
-- not run multi-statement strings through one execute()). Every step is
-- IDEMPOTENT (ON CONFLICT DO NOTHING / IS DISTINCT FROM), so re-running against
-- already-backfilled data is a no-op. organizations.id REUSES accounts.id, so
-- the account->org mapping is implicit (organization_id = account_id) and
-- survives the T7 drop of accounts (no FK from organizations back to accounts).
DO $$
BEGIN
  -- [HIGH-3] The backfill assumes exactly one is_owner profile per account
  -- (the org-name lookup would otherwise be multi-row, and the clerk_user_id
  -- copy would duplicate-key on profiles.clerk_user_id). Fail loudly if not.
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE is_owner = true
    GROUP BY account_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'identity-t1 backfill: account(s) with >1 is_owner profile';
  END IF;

  -- 1. One organization per account; id REUSED from account.id. Name from the
  --    owner profile (archived INCLUDED — an account mid-deletion can have an
  --    archived owner, and organizations.name is NOT NULL), falling back to the
  --    email local-part, then a literal so the INSERT can never fail on NULL.
  INSERT INTO organizations (
    id, name, timezone,
    deletion_scheduled_at, deletion_cancelled_at, created_at, updated_at
  )
  SELECT
    a.id,
    -- NULLIF(trim(...), '') so a blank/whitespace display_name or an email with
    -- no local-part falls through to the literal — COALESCE alone only skips
    -- NULL, and organizations.name (NOT NULL) would otherwise persist as ''.
    COALESCE(
      NULLIF(trim((SELECT p.display_name FROM profiles p
        WHERE p.account_id = a.id AND p.is_owner = true
        ORDER BY p.created_at ASC
        LIMIT 1)), ''),
      NULLIF(split_part(a.email, '@', 1), ''),
      'My Organization'
    ),
    a.timezone,
    a.deletion_scheduled_at,
    a.deletion_cancelled_at,
    now(),
    now()
  FROM accounts a
  ON CONFLICT (id) DO NOTHING;

  -- 2. One membership per profile (archived INCLUDED — a seat-removed child is
  --    archivedAt-marked with data preserved; excluding it would orphan that
  --    person from the only scoping model once T7 drops account_id). Roles:
  --    owner if is_owner; mentor if the person appears as a parent in
  --    family_links; student always. array_remove drops the absent-role NULLs;
  --    'student' guarantees a non-empty set.
  INSERT INTO memberships (
    id, person_id, organization_id, roles, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    p.id,
    p.account_id,  -- == organizations.id (id reuse)
    array_remove(ARRAY[
      CASE WHEN p.is_owner = true THEN 'owner'::membership_role END,
      CASE WHEN EXISTS (
        SELECT 1 FROM family_links fl WHERE fl.parent_profile_id = p.id
      ) THEN 'mentor'::membership_role END,
      'student'::membership_role
    ], NULL),
    now(),
    now()
  FROM profiles p
  ON CONFLICT (person_id, organization_id) DO NOTHING;

  -- 3. Copy the Clerk credential down to the OWNER profile only (the only
  --    profile with a login today). Idempotent via IS DISTINCT FROM.
  UPDATE profiles p
  SET clerk_user_id = a.clerk_user_id,
      updated_at = now()
  FROM accounts a
  WHERE p.account_id = a.id
    AND p.is_owner = true
    AND p.clerk_user_id IS DISTINCT FROM a.clerk_user_id;

  -- 4. Point each subscription at its account's organization (== account_id).
  UPDATE subscriptions s
  SET organization_id = s.account_id,
      updated_at = now()
  WHERE s.organization_id IS DISTINCT FROM s.account_id;
END $$;
