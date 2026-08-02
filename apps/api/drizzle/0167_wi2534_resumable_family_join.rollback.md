# Rollback — 0167_wi2534_resumable_family_join

## Changes in this migration

1. Creates `family_join_journey`, its constraints, foreign keys, indexes, and row-level-security boundary.
2. Extends `family_join_invite.status` with `bound`, `declined`, and `withdrawn`.
3. Extends `support_visibility_audit_events.event_type` with `authority_invalidated`.

## Rollback

**Possible:** Partial and destructive. The schema can return to its pre-0167 shape only after every in-progress journey is completed, cancelled, or repaired forward. The old schema cannot represent an in-progress journey, a declined/withdrawn invite, or an `authority_invalidated` audit event. Stop family-join writes, take a database backup, and complete the preflight below before running this procedure.

**Data loss:**

- terminal invite rows whose status is `declined` or `withdrawn`;
- `authority_invalidated` visibility-audit rows;

The procedure deliberately refuses to delete journey state or reopen a `bound` invite. Those cases require an audited forward repair; changing `bound` to `pending` could reissue a code for a partially completed consent ceremony.

The rollback does **not** reverse already completed membership moves, consent grants or receipts, guardian attachments, or visibility-contract decisions. Those are business records produced by application transactions, not data introduced mechanically by this migration. Restore from backup or perform an audited forward repair if one of those transactions must be reversed.

**Preflight:**

1. Stop every writer that can create or advance a family-join journey.
2. Confirm the first query returns zero rows. Any result requires completion, cancellation, or an audited forward repair before rollback.
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

COMMIT;
```

**Post-rollback assertions:** all queries must return the shown legacy-safe result before the pre-0167 application is deployed.

```sql
SELECT to_regclass('public.family_join_journey') IS NULL
  AS journey_table_removed; -- true

SELECT count(*) = 0 AS invalid_invite_statuses
FROM "family_join_invite"
WHERE "status" NOT IN ('pending', 'accepted'); -- true

SELECT count(*) = 0 AS invalid_visibility_events
FROM "support_visibility_audit_events"
WHERE "event_type" = 'authority_invalidated'; -- true

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN (
  'family_join_invite_status_check',
  'support_visibility_audit_events_type_check'
)
ORDER BY conname; -- definitions contain only the pre-0167 values
```

**Recovery:** Deploy the pre-0167 application revision with this rollback. If the resumable journey is reintroduced later, reapply the migration and restore only reviewed records from the pre-rollback backup; do not blindly replay terminal invites or authority-invalidated events.

**Recommendation:** Prefer a forward repair. Use this rollback only before live use, or after all in-flight journeys have been formally resolved and the loss of terminal invite/audit history has been explicitly accepted.
