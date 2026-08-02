# Rollback — 0167_wi2534_resumable_family_join

## Changes in this migration

1. Creates `family_join_journey`, its constraints, foreign keys, indexes, and row-level-security boundary.
2. Extends `family_join_invite.status` with `bound`, `declined`, and `withdrawn`.
3. Extends `support_visibility_audit_events.event_type` with `authority_invalidated`.

## Rollback

**Possible:** Partial and destructive. The schema can return to its pre-0167 shape only when `family_join_journey` contains no rows. The guard blocks on every journey row, including terminal `joined`, `declined`, and `withdrawn` rows; completing or cancelling a journey does not make rollback possible. Stop family-join writes, take a database backup, export and audit any journey history that must be retained, then remove every journey row through a separately authorized purge before running this procedure. Prefer a forward repair when that purge is not acceptable. The old schema cannot represent an in-progress journey, a declined/withdrawn invite, or an `authority_invalidated` audit event.

**Data loss:**

- all `family_join_journey` history removed by the required pre-rollback purge, including completed `joined`, `declined`, and `withdrawn` journeys;
- terminal invite rows whose status is `declined` or `withdrawn`;
- `authority_invalidated` visibility-audit rows;

The procedure deliberately refuses to delete journey state or reopen a `bound` invite. Journey rows must already be absent, and any `bound` invite requires an audited forward repair; changing `bound` to `pending` could reissue a code for a partially completed consent ceremony.

The rollback does **not** reverse already completed membership moves, consent grants or receipts, guardian attachments, or visibility-contract decisions. Those are business records produced by application transactions, not data introduced mechanically by this migration. Restore from backup or perform an audited forward repair if one of those transactions must be reversed.

**Preflight:**

1. Stop every writer that can create or advance a family-join journey.
2. Confirm the first query returns zero rows. Any result blocks rollback regardless of state; export and audit the history, then perform a separately authorized purge of every row, or repair forward instead.
3. Review the foreign-key and view dependencies returned by the next two queries. `DROP ... RESTRICT` below is the final mechanical dependency gate, but it cannot find application code or dynamically constructed SQL; search deployed consumers separately.

```sql
SELECT state, count(*)
FROM "family_join_journey"
GROUP BY state
ORDER BY state;

SELECT conname, conrelid::regclass AS dependent_table
FROM pg_constraint
WHERE confrelid = 'family_join_journey'::regclass
  AND conrelid <> 'family_join_journey'::regclass;

SELECT DISTINCT dependent.oid::regclass AS dependent_view
FROM pg_depend AS dependency
JOIN pg_rewrite AS rewrite ON rewrite.oid = dependency.objid
JOIN pg_class AS dependent ON dependent.oid = rewrite.ev_class
WHERE dependency.refobjid = 'family_join_journey'::regclass
  AND dependent.oid <> 'family_join_journey'::regclass;
```

**Procedure:**

```sql
BEGIN;

LOCK TABLE "family_join_journey",
           "family_join_invite",
           "support_visibility_audit_events"
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "family_join_journey") THEN
    RAISE EXCEPTION
      '0167 rollback refused: family_join_journey is not empty; repair forward';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "family_join_invite" WHERE "status" = 'bound'
  ) THEN
    RAISE EXCEPTION
      '0167 rollback refused: bound family invite exists; repair forward';
  END IF;
END
$$;

DROP TABLE IF EXISTS "family_join_journey" RESTRICT;

DELETE FROM "family_join_invite"
WHERE "status" IN ('declined', 'withdrawn');

DELETE FROM "support_visibility_audit_events"
WHERE "event_type" = 'authority_invalidated';

ALTER TABLE "family_join_invite"
  DROP CONSTRAINT "family_join_invite_status_check";
ALTER TABLE "family_join_invite"
  ADD CONSTRAINT "family_join_invite_status_check"
  CHECK ("status" IN ('pending', 'accepted'));

ALTER TABLE "support_visibility_audit_events"
  DROP CONSTRAINT "support_visibility_audit_events_type_check";
ALTER TABLE "support_visibility_audit_events"
  ADD CONSTRAINT "support_visibility_audit_events_type_check"
  CHECK ("event_type" IN (
    'contract_initiated',
    'contract_accepted',
    'appeal_requested',
    'supportership_revoked',
    'graduation_restamped'
  ));

DO $$
DECLARE
  invite_status_definition text;
  visibility_event_definition text;
BEGIN
  IF to_regclass('public.family_join_journey') IS NOT NULL THEN
    RAISE EXCEPTION
      '0167 rollback assertion failed: family_join_journey still exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "family_join_invite"
    WHERE "status" NOT IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION
      '0167 rollback assertion failed: non-legacy invite status remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "support_visibility_audit_events"
    WHERE "event_type" = 'authority_invalidated'
  ) THEN
    RAISE EXCEPTION
      '0167 rollback assertion failed: authority_invalidated event remains';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO invite_status_definition
  FROM pg_constraint
  WHERE conrelid = 'family_join_invite'::regclass
    AND conname = 'family_join_invite_status_check';
  IF invite_status_definition IS DISTINCT FROM
    'CHECK ((status = ANY (ARRAY[''pending''::text, ''accepted''::text])))'
  THEN
    RAISE EXCEPTION
      '0167 rollback assertion failed: invite status constraint is %',
      invite_status_definition;
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO visibility_event_definition
  FROM pg_constraint
  WHERE conrelid = 'support_visibility_audit_events'::regclass
    AND conname = 'support_visibility_audit_events_type_check';
  IF visibility_event_definition IS DISTINCT FROM
    'CHECK ((event_type = ANY (ARRAY[''contract_initiated''::text, ''contract_accepted''::text, ''appeal_requested''::text, ''supportership_revoked''::text, ''graduation_restamped''::text])))'
  THEN
    RAISE EXCEPTION
      '0167 rollback assertion failed: visibility event constraint is %',
      visibility_event_definition;
  END IF;
END
$$;

COMMIT;
```

**Post-rollback assertions:** The final `DO` block runs before `COMMIT` and raises on any missing or non-legacy result. A failed assertion rolls the entire procedure back; deploy the pre-0167 application only after the transaction commits successfully.

**Recovery:** Deploy the pre-0167 application revision with this rollback. If the resumable journey is reintroduced later, reapply the migration and restore only reviewed records from the pre-rollback backup; do not blindly replay terminal invites or authority-invalidated events.

**Recommendation:** Prefer a forward repair. Use this rollback only before live use while the journey table is empty, or after every journey row has been exported as required and an authorized purge plus the loss of journey, terminal-invite, and audit history has been explicitly accepted.
