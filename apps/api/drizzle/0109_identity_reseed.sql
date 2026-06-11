-- 0109_identity_reseed — seed the 8-table identity model from the legacy source.
--
-- Copies live identity data out of the legacy tables (accounts, profiles,
-- family_links, consent_states, subscriptions) into the new model created by
-- 0108_identity_foundation_baseline.sql (person, login, organization,
-- membership, subscription, guardianship, supportership, consent_grant,
-- plus the subscription_payers primary-payer join rows).
--
-- The legacy tables are NOT modified. They remain the system of record until
-- the legacy-drop migration lands; no runtime code reads or writes the new tables
-- at this migration's commit, so this is a pure data-staging step.
--
-- Design properties:
--   * SINGLE STATEMENT — one DO $$ block, so neon-serverless applies it as one
--     atomic transaction (house pattern from the former 0106 backfill).
--   * IDEMPOTENT + CONVERGENT — deterministic ids (new id = legacy source id)
--     with ON CONFLICT (id) DO UPDATE ... WHERE ... IS DISTINCT FROM ... on
--     mutable tables, ON CONFLICT DO NOTHING on append-only edges. Re-running
--     immediately before the legacy-drop cut tops up rows created
--     since the first run and converges rows updated since, so the
--     verify-then-drop sequence stays sound.
--   * FAIL-LOUD — aborts (and therefore rolls back) if an account has more
--     than one is_owner profile (would break the login/payer binding).
--
-- Deterministic id map:
--   organization.id   = accounts.id
--   person.id         = profiles.id      (keeps every learning-data profile_id
--                                         FK value meaningful for the legacy-drop cutover)
--   login.id          = accounts.id      (1:1 with accounts; distinct table, no clash)
--   membership.id     = profiles.id      (exactly one membership per profile in v1)
--   guardianship.id   = family_links.id
--   consent_grant.id  = consent_states.id
--   subscription.id   = subscriptions.id
--
-- Mapping conventions (documented decisions, revisable until a reader exists):
--   * person.birth_date = make_date(birth_year, 1, 1). The legacy runtime ages
--     a user as (current UTC year - birth_year) (services/age-utils.ts
--     calculateAge); a Jan-1 birth date reproduces exactly that age under
--     full-date arithmetic, so no user's computed age changes at cutover.
--     PRECONDITION: profiles.birth_year IS NOT NULL for every row (NOT NULL
--     by schema; re-asserted by a fail-loud guard in the block).
--   * person.residence_jurisdiction: location 'US' -> 'US', 'EU' -> 'EU',
--     'OTHER' -> 'ROW' (positively known to be neither), NULL -> 'UNKNOWN'
--     (fail-closed: the policy engine treats unknown residence as strictest).
--   * person.age_knowing / residence_knowing: provenance-honest cache stubs
--     ({method, source, last_updated}); no confidence value is invented.
--     residence_knowing stays NULL when the legacy location is NULL.
--   * consent_grant purpose vocabulary is provisional ('platform_use') —
--     no consent_grant reader exists yet; the legacy-drop cutover owns finalizing
--     vocabulary. lawful_basis records the legacy regime
--     ('coppa_parental_consent' / 'gdpr_parental_consent').
--   * Only consent_states rows whose status is CONSENTED or WITHDRAWN map to
--     consent_grant rows (a consent event actually happened). PENDING /
--     PARENTAL_CONSENT_REQUESTED rows represent no grant and are not seeded.
--   * Accounts with no is_owner profile cannot satisfy login.person_id /
--     subscription.payer_person_id NOT NULL; their login + subscription rows
--     are SKIPPED and surfaced by scripts/verify-identity-reseed.mjs as
--     exceptions for the operator.
--   * Archived profiles (archived_at IS NOT NULL) ARE seeded — person carries
--     no archived marker; their withdrawn consent state is preserved on
--     consent_grant, and archival/visibility semantics at cutover are
--     the legacy-drop cutover's reader work. Counted by the verify script.
--
-- ## Rollback
--
-- REVERSIBLE until the legacy-drop migration runs. This migration only inserts into
-- (or converges) the 9 new-model tables; every legacy table is read-only here
-- and remains authoritative. No runtime code writes the new tables at this
-- commit, so the pre-migration state of the new tables is exactly "empty or
-- previously-reseeded". Recovery procedure (restores the pre-seed state):
--
--   TRUNCATE subscription_payers, consent_grant, guardianship, supportership,
--            membership, subscription, login, person, organization CASCADE;
--
-- Data lost by rollback: none (the legacy source is untouched).
-- After the legacy-drop migration removes the legacy tables this rollback is no
-- longer available; that irreversibility is documented on that migration.

DO $$
BEGIN
  -- Guard: the login binding and the primary-payer binding both require at
  -- most one is_owner profile per account. Fail loudly (aborting the whole
  -- block) rather than seeding an ambiguous identity graph.
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE is_owner = true
    GROUP BY account_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'identity reseed: account(s) with >1 is_owner profile';
  END IF;

  -- Guard: person.birth_date is NOT NULL and derives from profiles.birth_year.
  -- profiles.birth_year is NOT NULL by schema, but dev is push-managed and
  -- this block also runs unattended at staging deploy — if a NULL ever
  -- appears, fail with a named precondition instead of a raw constraint
  -- abort mid-block.
  IF EXISTS (SELECT 1 FROM profiles WHERE birth_year IS NULL) THEN
    RAISE EXCEPTION 'identity reseed: profile(s) with NULL birth_year';
  END IF;

  -- 0. Mirror-deletes FIRST: rows whose legacy source row no longer exists
  --    are removed, so a re-run converges on the legacy truth even if legacy
  --    deletions (account/profile deletion flows) happened since the last
  --    run. Running these BEFORE the upserts also frees unique values
  --    (login.email / login.clerk_user_id) that a deleted account may have
  --    released and a live account since claimed — upserting first would hit
  --    the unique constraint and abort with no converging re-run possible.
  --    PRECONDITION (grep-verified at this commit, and required until the
  --    legacy-drop cutover): no runtime code writes the new tables, so every
  --    row here is reseed-sourced and safe to mirror. Child-before-parent
  --    order respects the RESTRICT FKs.
  DELETE FROM subscription_payers sp
  WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = sp.subscription_id);

  DELETE FROM consent_grant cg
  WHERE NOT EXISTS (
    SELECT 1 FROM consent_states cs
    WHERE cs.id = cg.id AND cs.status IN ('CONSENTED', 'WITHDRAWN')
  );

  DELETE FROM guardianship g
  WHERE NOT EXISTS (SELECT 1 FROM family_links fl WHERE fl.id = g.id);

  -- A subscription mirror also goes when its payer person lost their legacy
  --   profile (the row can no longer satisfy payer_person_id and re-joins the
  --   "ownerless account" exception class reported by the verify script).
  --   subscription_payers rows cascade with it.
  DELETE FROM subscription sub
  WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = sub.id)
     OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = sub.payer_person_id);

  DELETE FROM membership m
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = m.id);

  -- Deleting login before person is safe even while persons still reference
  --   the login: person.login_id -> login is ON DELETE SET NULL (0108), so
  --   the surviving persons are unhooked, not blocked.
  DELETE FROM login l
  WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = l.id);

  DELETE FROM person per
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = per.id);

  DELETE FROM organization o
  WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = o.id);

  -- 1. accounts -> organization (id reuse). Name from the owner profile's
  --    display name (archived included — an account mid-deletion can have an
  --    archived owner and organization.name is NOT NULL), falling back to the
  --    email local-part, then a literal.
  INSERT INTO organization (
    id, name, timezone, deletion_scheduled_at, deletion_cancelled_at,
    created_at, updated_at
  )
  SELECT
    a.id,
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
    a.created_at,
    a.updated_at
  FROM accounts a
  ON CONFLICT (id) DO UPDATE SET
    name = excluded.name,
    timezone = excluded.timezone,
    deletion_scheduled_at = excluded.deletion_scheduled_at,
    deletion_cancelled_at = excluded.deletion_cancelled_at,
    updated_at = excluded.updated_at
  WHERE (organization.name, organization.timezone,
         organization.deletion_scheduled_at, organization.deletion_cancelled_at)
    IS DISTINCT FROM
        (excluded.name, excluded.timezone, excluded.deletion_scheduled_at,
         excluded.deletion_cancelled_at);

  -- 2. profiles -> person (id reuse). login_id is wired in step 4 (the
  --    person<->login FK pair is circular, so person rows are created first).
  INSERT INTO person (
    id, display_name, birth_date, residence_jurisdiction, login_id,
    has_own_account, age_knowing, residence_knowing, last_activity_at,
    created_at, updated_at
  )
  SELECT
    p.id,
    p.display_name,
    make_date(p.birth_year, 1, 1),
    CASE p.location::text
      WHEN 'US' THEN 'US'
      WHEN 'EU' THEN 'EU'
      WHEN 'OTHER' THEN 'ROW'
      ELSE 'UNKNOWN'
    END,
    NULL,
    false,
    jsonb_build_object(
      'method', 'self_attested_birth_year',
      'source', 'reseed_0109:profiles.birth_year',
      'last_updated', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    CASE WHEN p.location IS NULL THEN NULL ELSE
      jsonb_build_object(
        'method', 'self_attested_location',
        'source', 'reseed_0109:profiles.location',
        'last_updated', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    END,
    p.updated_at,
    p.created_at,
    p.updated_at
  FROM profiles p
  ON CONFLICT (id) DO UPDATE SET
    display_name = excluded.display_name,
    birth_date = excluded.birth_date,
    residence_jurisdiction = excluded.residence_jurisdiction,
    -- The knowing caches refresh whenever a converging field changed (the
    -- WHERE below deliberately excludes them — their last_updated stamp
    -- differs every run and would otherwise force a rewrite of every row).
    age_knowing = excluded.age_knowing,
    residence_knowing = excluded.residence_knowing,
    last_activity_at = excluded.last_activity_at,
    updated_at = excluded.updated_at
  WHERE (person.display_name, person.birth_date,
         person.residence_jurisdiction, person.last_activity_at)
    IS DISTINCT FROM
        (excluded.display_name, excluded.birth_date,
         excluded.residence_jurisdiction, excluded.last_activity_at);

  -- 3. accounts -> login (id reuse), bound to the owner person. Accounts
  --    without an is_owner profile are skipped (login.person_id NOT NULL);
  --    the verify script reports them.
  INSERT INTO login (id, person_id, clerk_user_id, email, created_at, updated_at)
  SELECT a.id, p.id, a.clerk_user_id, a.email, a.created_at, a.updated_at
  FROM accounts a
  JOIN profiles p ON p.account_id = a.id AND p.is_owner = true
  ON CONFLICT (id) DO UPDATE SET
    person_id = excluded.person_id,
    clerk_user_id = excluded.clerk_user_id,
    email = excluded.email,
    updated_at = excluded.updated_at
  WHERE (login.person_id, login.clerk_user_id, login.email)
    IS DISTINCT FROM
        (excluded.person_id, excluded.clerk_user_id, excluded.email);

  -- 4. Wire person.login_id for owner persons (converges on re-run). First
  --    clear a stale binding (a person pointing at a login that now belongs
  --    to someone else — e.g. the account's owner profile changed between
  --    runs), then set the current bindings.
  UPDATE person per
  SET login_id = NULL, updated_at = now()
  FROM login l
  WHERE per.login_id = l.id
    AND l.person_id <> per.id;

  UPDATE person per
  SET login_id = l.id, updated_at = now()
  FROM login l
  WHERE l.person_id = per.id
    AND per.login_id IS DISTINCT FROM l.id;

  -- 5. profiles -> membership (id reuse). Owner = org admin (and a learner —
  --    the legacy owner profile has its own learning surface); everyone else
  --    on the account is a learner.
  INSERT INTO membership (id, person_id, organization_id, roles, created_at, updated_at)
  SELECT
    p.id,
    p.id,
    p.account_id,
    CASE WHEN p.is_owner THEN ARRAY['admin','learner'] ELSE ARRAY['learner'] END,
    p.created_at,
    p.updated_at
  FROM profiles p
  ON CONFLICT (id) DO UPDATE SET
    roles = excluded.roles,
    updated_at = excluded.updated_at
  WHERE membership.roles IS DISTINCT FROM excluded.roles;

  -- 6. family_links -> guardianship (id reuse). Append-only edge; the
  --    qualification defaults to 'biological_parent' (the legacy model has no
  --    qualification data). granted_at = the legacy link's creation time.
  INSERT INTO guardianship (
    id, guardian_person_id, charge_person_id, granted_at, created_at, updated_at
  )
  SELECT fl.id, fl.parent_profile_id, fl.child_profile_id,
         fl.created_at, fl.created_at, fl.created_at
  FROM family_links fl
  ON CONFLICT DO NOTHING;

  -- 7. supportership: intentionally not seeded — the legacy mentor role value
  --    never shipped as data, so there is no legacy source. (inv 19: a
  --    supportership is opt-in and never auto-conferred.)

  -- 8. consent_states -> consent_grant (id reuse) for rows where a consent
  --    event actually happened. The audit_fact preserves the legacy audit
  --    metadata (Bug #872 fields) so the regulator-facing record survives the
  --    eventual legacy drop of consent_states.
  INSERT INTO consent_grant (
    id, charge_person_id, organization_id, purpose, lawful_basis, granted,
    granted_at, withdrawn_at, prior_value, audit_fact,
    assurance_token, assurance_method,
    snapshot_age_at_grant, snapshot_jurisdiction_at_grant, created_at
  )
  SELECT
    cs.id,
    cs.profile_id,
    p.account_id,
    'platform_use',
    CASE cs.consent_type::text
      WHEN 'COPPA' THEN 'coppa_parental_consent'
      ELSE 'gdpr_parental_consent'
    END,
    true,
    COALESCE(cs.responded_at, cs.requested_at),
    CASE WHEN cs.status = 'WITHDRAWN' THEN cs.updated_at END,
    NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'reseed_0109:consent_states',
      'legacy_status', cs.status::text,
      'legacy_consent_type', cs.consent_type::text,
      'policy_version', cs.policy_version,
      'request_ip', cs.request_ip,
      'user_agent', cs.user_agent,
      'parent_email', cs.parent_email
    )),
    NULL,
    NULL,
    CASE WHEN cs.responded_at IS NOT NULL OR cs.requested_at IS NOT NULL THEN
      GREATEST(0, LEAST(32767,
        extract(year FROM COALESCE(cs.responded_at, cs.requested_at))::int
          - p.birth_year))::smallint
    END,
    CASE p.location::text
      WHEN 'US' THEN 'US'
      WHEN 'EU' THEN 'EU'
      WHEN 'OTHER' THEN 'ROW'
      ELSE 'UNKNOWN'
    END,
    cs.created_at
  FROM consent_states cs
  JOIN profiles p ON p.id = cs.profile_id
  WHERE cs.status IN ('CONSENTED', 'WITHDRAWN')
  ON CONFLICT (id) DO UPDATE SET
    -- The legacy row mutates in place through status transitions
    -- (e.g. WITHDRAWN -> re-requested -> CONSENTED rewrites responded_at),
    -- so every derived field must converge, not just withdrawn_at.
    granted_at = excluded.granted_at,
    withdrawn_at = excluded.withdrawn_at,
    lawful_basis = excluded.lawful_basis,
    audit_fact = excluded.audit_fact,
    snapshot_age_at_grant = excluded.snapshot_age_at_grant,
    snapshot_jurisdiction_at_grant = excluded.snapshot_jurisdiction_at_grant
  WHERE (consent_grant.granted_at, consent_grant.withdrawn_at,
         consent_grant.lawful_basis, consent_grant.audit_fact,
         consent_grant.snapshot_age_at_grant,
         consent_grant.snapshot_jurisdiction_at_grant)
    IS DISTINCT FROM
        (excluded.granted_at, excluded.withdrawn_at, excluded.lawful_basis,
         excluded.audit_fact, excluded.snapshot_age_at_grant,
         excluded.snapshot_jurisdiction_at_grant);

  -- 9. subscriptions -> subscription (id reuse), re-anchored to the org. The
  --    primary payer is the owner person; ownerless accounts are skipped
  --    (payer_person_id NOT NULL) and reported by the verify script.
  --    Stripe/RevenueCat correlation ids have no column in the new model;
  --    they stay readable on the legacy table until the drop (the drop WP
  --    owns deciding their retain-tier home, e.g. financial_record).
  INSERT INTO subscription (
    id, organization_id, plan_tier, status, payer_person_id,
    store_product_id, store_platform, period_start_at, period_end_at,
    created_at, updated_at
  )
  SELECT
    s.id,
    s.account_id,
    s.tier::text,
    s.status::text,
    p.id,
    NULL,
    CASE
      WHEN s.revenuecat_original_app_user_id IS NOT NULL THEN 'revenuecat'
      WHEN s.stripe_subscription_id IS NOT NULL THEN 'stripe'
    END,
    s.current_period_start,
    s.current_period_end,
    s.created_at,
    s.updated_at
  FROM subscriptions s
  JOIN profiles p ON p.account_id = s.account_id AND p.is_owner = true
  ON CONFLICT (id) DO UPDATE SET
    plan_tier = excluded.plan_tier,
    status = excluded.status,
    payer_person_id = excluded.payer_person_id,
    store_platform = excluded.store_platform,
    period_start_at = excluded.period_start_at,
    period_end_at = excluded.period_end_at,
    updated_at = excluded.updated_at
  WHERE (subscription.plan_tier, subscription.status,
         subscription.payer_person_id, subscription.store_platform,
         subscription.period_start_at, subscription.period_end_at)
    IS DISTINCT FROM
        (excluded.plan_tier, excluded.status, excluded.payer_person_id,
         excluded.store_platform, excluded.period_start_at,
         excluded.period_end_at);

  -- 10. Primary-payer join rows (data-model.md §2A.4: subscription_payers
  --     carries primary + <=1 secondary; the primary row mirrors
  --     subscription.payer_person_id). A stale primary mirror (payer changed
  --     between runs) is removed first so the join converges.
  DELETE FROM subscription_payers sp
  USING subscription sub
  WHERE sp.subscription_id = sub.id
    AND sp.role = 'primary'
    AND sp.person_id <> sub.payer_person_id;

  INSERT INTO subscription_payers (subscription_id, person_id, role)
  SELECT sub.id, sub.payer_person_id, 'primary'
  FROM subscription sub
  ON CONFLICT DO NOTHING;

END $$;
