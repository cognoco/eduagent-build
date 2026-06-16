-- @freeze-only
-- =============================================================================
-- M-REPOINT — re-point every live FK off the legacy identity tables onto the
-- new-model parents. WI-586 convergence runbook §4 step 6 (INSIDE the freeze
-- window, BEFORE the flip). Pairs with m-drop.sql (§4 step 8).
--
-- STATUS: INERT DRAFT. This file lives under _wip/ deliberately — it is NOT in
-- apps/api/drizzle/, so drizzle-kit migrate never sees it and it cannot
-- auto-apply on a deploy. At the freeze it is promoted to the next free
-- migration number (e.g. 0117_m_repoint.sql) per cutover-plan §1, RE-GENERATED
-- against the frozen catalog (see "catalog-driven" below), reviewed, applied.
--
-- DESIGN (cutover-plan-2026-06-11 §2.7 — "catalog-authoritative, mapping-driven"):
--   * The re-point SET is NOT a frozen hand-list. It is computed from the LIVE
--     catalog at run time: every FK whose target is a mapped legacy parent and
--     whose child is NOT itself on the drop list. This is why the static count
--     drifts (plan said 56–57; staging 2026-06-14 = 58: 54→person, 4→subscription)
--     and why hard-coding the list is banned — the loop below always matches the
--     catalog as it stands at execution.
--   * Mapping (the ONLY legacy→new parents with a live mapping):
--         profiles      -> person
--         subscriptions -> subscription
--     'accounts' is deliberately UNMAPPED: its only two inbound FKs
--     (profiles.account_id, subscriptions.account_id) are intra-legacy and drop
--     with their tables (0 re-points → organization).
--   * Children on the drop list (profiles, accounts, subscriptions, family_links,
--     consent_states) are excluded — their FKs vanish with the table in M-DROP,
--     they are not re-pointed.
--   * Per constraint: DROP the old FK + ADD the same FK re-targeted, preserving
--     the EXACT column list and ON DELETE / ON UPDATE action (taken verbatim from
--     pg_get_constraintdef — only the REFERENCES target is rewritten). Constraint
--     NAME follows drizzle convention (…_profiles_id_fk -> …_person_id_fk). The
--     column name (profile_id) does NOT change (OQ-7).
--   * COMPLETENESS ASSERTION (fail loud): if any LIVE (non-drop-list) table holds
--     an unmapped 'accounts'-target FK, abort — a live table grew an accounts FK
--     and the mapping must be re-derived before this runs.
--   * IDEMPOTENT / CONVERGENT: after a successful run the re-pointed FKs target
--     person/subscription, so the catalog query matches nothing on a re-run — the
--     loop is a no-op. Safe for the rehearsal-then-freeze double execution.
--   * Single transaction (pre-launch data sizes make NOT VALID+VALIDATE staging
--     unnecessary, plan §2.7).
--
-- ## Rollback
-- M-REPOINT runs pre-flip, inside the freeze, while the legacy tables still exist
-- and hold the system-of-record rows (person.id = profiles.id by construction).
-- Reversal is a clean reverse re-point (swap the mapping: person->profiles,
-- subscription->subscriptions) while still frozen — the inverse of this file,
-- generated the same way. This is the §4.2 "clean-reverse → step 6 (frozen)" leg.
-- Once the flip (§4 step 7) sets IDENTITY_V2_ENABLED=true and writers land on the
-- new model, reverse re-point is no longer clean: recovery becomes Neon PITR to
-- the pre-cutover marker (§4.2 "PITR-only post-flip"). After M-DROP it is
-- impossible (§4.2). Do NOT run M-REPOINT outside the freeze.
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  -- Completeness assertion — abort if a live table other than the two known
  -- accounts-referrers holds an accounts-target FK. profiles (drops with its
  -- table) and subscriptions (account_id repointed to organization by the loop
  -- below) are the only expected referrers; anything else means the catalog
  -- grew an unmapped accounts FK and the mapping must be re-derived.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'accounts'::regclass
      AND c.conrelid NOT IN ('profiles'::regclass, 'subscriptions'::regclass)
  ) THEN
    RAISE EXCEPTION
      'M-REPOINT completeness check failed: a live (non-drop-list) table holds an unmapped accounts-target FK. Re-derive the mapping (cutover-plan §2.7) before running.';
  END IF;

  FOR r IN
    WITH target_map(legacy_parent, new_parent) AS (
      -- [WI-586 drop-4 reshape] `subscriptions` (the table) is RETAINED in
      -- WI-586 — its DROP moves to WI-805. But the FK repoints stay as-is:
      --  * profiles -> person  (54 child FKs)
      --  * subscriptions -> subscription: the 4 quota children (quota_pools,
      --    profile_quota_usage, top_up_credits, usage_events) already repoint
      --    their subscription_id FK to v2 `subscription` here — they were never
      --    in drop_list, so this is the COMMITTED, pre-existing dual-write-era
      --    end-state, not new orphaning. Kept verbatim.
      --  * accounts -> organization: NEW — so the single retained-table FK that
      --    targets a dropped table (subscriptions.account_id -> accounts)
      --    repoints to organization (organization.id == accounts.id by the
      --    reseed; value-safe).
      VALUES ('profiles', 'person'),
             ('subscriptions', 'subscription'),
             ('accounts', 'organization')
    ),
    drop_list(t) AS (
      -- `subscriptions` removed from the drop list: it is retained, and its
      -- account_id FK must be IN repoint scope (the loop excludes drop_list
      -- children at the WHERE below).
      VALUES ('profiles'), ('accounts'),
             ('family_links'), ('consent_states')
    )
    SELECT
      c.conrelid::regclass::text AS child,
      c.conname                  AS old_name,
      regexp_replace(c.conname, '_' || m.legacy_parent || '_id_fk$',
                                '_' || m.new_parent || '_id_fk') AS new_name,
      replace(pg_get_constraintdef(c.oid),
              'REFERENCES ' || m.legacy_parent || '(',
              'REFERENCES ' || m.new_parent || '(') AS new_def
    FROM pg_constraint c
    JOIN target_map m ON c.confrelid = m.legacy_parent::regclass
    WHERE c.contype = 'f'
      AND c.conrelid NOT IN (SELECT t::regclass FROM drop_list)
    ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      r.child, r.old_name, r.new_name, r.new_def
    );
  END LOOP;
END $$;