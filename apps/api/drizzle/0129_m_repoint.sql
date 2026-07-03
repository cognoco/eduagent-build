-- =============================================================================
-- M-REPOINT — re-point every live FK off the legacy identity tables onto the
-- new-model parents. WI-1128 (779-strip drop-landing WI), adapted from the
-- frozen WI-586 convergence runbook draft (apps/api/drizzle/_freeze-only/
-- 0117_m_repoint.sql). The frozen file's mapping/exclusion logic is
-- authoritative and is preserved verbatim below; only the gating mechanism
-- changes — this version uses to_regclass() instead of hard ::regclass casts
-- so it is a clean NO-OP wherever the legacy tables are already gone
-- (staging/prod already had them dropped out-of-band ahead of this migration
-- landing; this file only has physical effect on dev/CI).
--
-- DESIGN (catalog-authoritative, mapping-driven):
--   * The re-point SET is NOT a frozen hand-list. It is computed from the LIVE
--     catalog at run time: every FK whose target is a mapped legacy parent and
--     whose child is NOT itself on the drop list.
--   * Mapping (the ONLY legacy->new parents with a live mapping):
--         profiles      -> person
--         subscriptions -> subscription
--         accounts      -> organization
--     `subscriptions` (the table) is RETAINED here — its DROP is a separate,
--     later WI (WI-805). Its `account_id` FK is still repointed below (it is
--     a live, non-drop-list child of `accounts`).
--   * Children on the drop list (profiles, accounts, family_links,
--     consent_states) are excluded — their FKs vanish with the table when
--     the companion 0130 migration drops them; they are not re-pointed here.
--   * Per constraint: DROP the old FK + ADD the same FK re-targeted, preserving
--     the EXACT column list and ON DELETE / ON UPDATE action (taken verbatim
--     from pg_get_constraintdef — only the REFERENCES target is rewritten).
--   * IDEMPOTENT / CONVERGENT: after a successful run the re-pointed FKs target
--     person/subscription/organization, so the catalog query matches nothing
--     on a re-run — the loop is a no-op.
--   * Single transaction (matches frozen design; pre-launch data sizes make
--     NOT VALID+VALIDATE staging unnecessary).
--
-- ## Rollback
-- On dev/CI (where this migration has physical effect): reversal is a clean
-- reverse re-point (swap the mapping: person->profiles, subscription->
-- subscriptions, organization->accounts) — the inverse of this file. On
-- staging/prod this migration is a no-op (legacy tables already gone), so
-- there is nothing to roll back there.
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  -- Completeness assertion — abort if a live table other than the two known
  -- accounts-referrers holds an accounts-target FK. Skipped entirely when
  -- 'accounts' doesn't exist (already dropped upstream).
  IF to_regclass('public.accounts') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'accounts'::regclass
        AND c.conrelid NOT IN ('profiles'::regclass, 'subscriptions'::regclass)
    ) THEN
      RAISE EXCEPTION
        'M-REPOINT completeness check failed: a live (non-drop-list) table holds an unmapped accounts-target FK. Re-derive the mapping before running.';
    END IF;
  END IF;

  FOR r IN
    WITH target_map(legacy_parent, new_parent) AS (
      VALUES ('profiles', 'person'),
             ('subscriptions', 'subscription'),
             ('accounts', 'organization')
    ),
    drop_list(t) AS (
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
    JOIN target_map m
      ON to_regclass('public.' || m.legacy_parent) IS NOT NULL
     AND c.confrelid = to_regclass('public.' || m.legacy_parent)
    WHERE c.contype = 'f'
      AND c.conrelid NOT IN (
        SELECT to_regclass('public.' || t)
        FROM drop_list
        WHERE to_regclass('public.' || t) IS NOT NULL
      )
    ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      r.child, r.old_name, r.new_name, r.new_def
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- POST-STATE COMPLETENESS ASSERTION
-- After the repoint, NO live (non-drop-list) table may still hold an FK that
-- targets a legacy identity parent. If one survives, the companion 0130 drop
-- fails loud on the dangling dependency (no CASCADE). Assert it HERE so an
-- incomplete repoint fails at this step, with a precise diagnostic — rather
-- than at the irreversible drop. The only FKs still allowed to target the 4
-- legacy parents are those among the parents themselves (they drop together
-- as a set in 0130).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offending text;
  drop_list_oids oid[];
BEGIN
  SELECT array_agg(reg) INTO drop_list_oids
  FROM (
    SELECT to_regclass('public.' || t) AS reg
    FROM (VALUES ('profiles'), ('accounts'), ('family_links'), ('consent_states')) AS d(t)
  ) s
  WHERE reg IS NOT NULL;

  IF drop_list_oids IS NOT NULL THEN
    SELECT string_agg(
             format('%s.%s -> %s', c.conrelid::regclass, c.conname,
                    c.confrelid::regclass),
             '; '
           )
      INTO offending
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = ANY(drop_list_oids)
      AND NOT (c.conrelid = ANY(drop_list_oids));

    IF offending IS NOT NULL THEN
      RAISE EXCEPTION
        'M-REPOINT post-state check failed: live FK(s) still target a legacy identity parent after repoint: %. The companion drop migration must not run until these are repointed.', offending;
    END IF;
  END IF;
END $$;
