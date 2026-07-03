-- =============================================================================
-- M-DROP — forward drop of the four legacy identity tables, the companion to
-- 0129_m_repoint. WI-1306 (0130 catalog-gated drop), stacked on WI-1128.
--
-- WHAT / WHY:
--   0129 re-pointed every LIVE non-drop-list FK off {profiles, accounts} onto
--   {person, organization}. After that repoint the only FKs still targeting the
--   four legacy parents are among the parents themselves — so they can be
--   dropped as a set. This migration performs that drop.
--
--   Catalog-gated, exactly like 0129: `DROP TABLE IF EXISTS` is a clean NO-OP
--   wherever the tables are already gone. Staging/prod had these dropped
--   out-of-band ahead of this chain landing, so this file has PHYSICAL EFFECT
--   ON dev/CI ONLY. Its purpose there is convergence: it brings the dev/CI
--   schema to the same tables-absent state prod already has, so the flag-OFF
--   integration lane stops running legacy code paths against tables that never
--   ship (see WI-1167 staging-drift, WI-1128 flag-OFF-lane red).
--
--   NO CASCADE — deliberate. 0129's post-state assertion (and the mirror guard
--   below) prove no live non-drop-list table still references the four. With
--   that guaranteed, a bare DROP removes only the set and their mutual FKs. Any
--   OTHER surviving dependency (a view, a trigger) SHOULD fail this migration
--   loudly at dev/CI rather than be silently cascaded away.
--
--   SCHEMA-MODEL NOTE: the Drizzle TS schema still DECLARES these four tables
--   (packages/database/src/schema/profiles.ts). Removing the declarations is a
--   separate, later WI. This migration therefore makes no schema-model change —
--   its meta snapshot (0130) is a verbatim carry-forward of 0129's, matching
--   how 0129 itself carried 0128's forward.
--
-- ## Rollback
--   IRREVERSIBLE where it has effect (dev/CI): DROP TABLE destroys the tables
--   and all rows. This is acceptable because the only data in these tables on
--   dev/CI is ephemeral per-run test seed — no durable data is lost. On
--   staging/prod this migration is a NO-OP (the tables were already dropped
--   out-of-band), so there is nothing to roll back and no production data is at
--   risk. If a dev/CI database must be restored to the pre-0130 shape, re-run
--   the genesis migrations to recreate the empty tables, then re-seed; there is
--   no in-place reverse for this step.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRE-DROP COMPLETENESS ASSERTION (mirror of 0129's post-state check).
-- Self-defending: abort if any LIVE non-drop-list table still holds an FK that
-- targets one of the four legacy parents. 0129 already asserts this one step
-- earlier in the chain; repeating it here means 0130 fails safe even if run
-- against a database where the repoint is incomplete, with a precise diagnostic
-- rather than a raw dependency error on the DROP.
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
        'M-DROP pre-drop check failed: live FK(s) still target a legacy identity parent: %. Run the 0129 repoint before this drop.', offending;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- THE DROP — catalog-gated (IF EXISTS => clean no-op where already absent),
-- no CASCADE (fail loud on any unexpected surviving dependency). One statement
-- drops the set together, so mutual FKs among the four are handled atomically.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.consent_states, public.family_links, public.profiles, public.accounts;
