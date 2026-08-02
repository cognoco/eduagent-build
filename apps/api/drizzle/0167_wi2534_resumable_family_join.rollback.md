# Rollback — 0167_wi2534_resumable_family_join

## Changes in this migration

1. Creates `family_join_journey`, its constraints, foreign keys, indexes, and row-level-security boundary.
2. Extends `family_join_invite.status` with `bound`, `declined`, and `withdrawn`.
3. Extends `support_visibility_audit_events.event_type` with `authority_invalidated`.

## Rollback

**Possible:** Partial and destructive. The schema can return to its pre-0167 shape, but the old schema cannot represent an in-progress journey, a declined/withdrawn invite, or an `authority_invalidated` audit event. Stop family-join writes and take a database backup before running this procedure.

**Data loss:**

- all persisted `family_join_journey` state;
- terminal invite rows whose status is `declined` or `withdrawn`;
- `authority_invalidated` visibility-audit rows;
- the distinction between `bound` and `pending` for surviving invites.

The rollback does **not** reverse already completed membership moves, consent grants or receipts, guardian attachments, or visibility-contract decisions. Those are business records produced by application transactions, not data introduced mechanically by this migration. Restore from backup or perform an audited forward repair if one of those transactions must be reversed.

**Procedure:**

```sql
BEGIN;

DROP TABLE IF EXISTS "family_join_journey";

DELETE FROM "family_join_invite"
WHERE "status" IN ('declined', 'withdrawn');

UPDATE "family_join_invite"
SET "status" = 'pending', "updated_at" = now()
WHERE "status" = 'bound';

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

**Recovery:** Deploy the pre-0167 application revision with this rollback. If the resumable journey is reintroduced later, reapply the migration and restore only reviewed records from the pre-rollback backup; do not blindly replay terminal invites or authority-invalidated events.

**Recommendation:** Prefer a forward repair. Use this rollback only before live use or when the loss of in-flight journey and terminal-audit state has been explicitly accepted.
