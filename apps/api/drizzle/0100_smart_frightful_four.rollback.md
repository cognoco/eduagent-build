# 0100_smart_frightful_four rollback

## Rollback possibility

Safe. This migration converts `pending_notices.type` from `text` + CHECK
constraint to the new `pending_notice_type` pgEnum. The enum member list
(`'consent_deleted'`, `'consent_archived'`) is identical to the CHECK
constraint's allowed values, so the `USING type::pending_notice_type` cast
preserves every existing row without conversion loss.

## What is lost on rollback

Nothing. Rolling back restores the previous text + CHECK shape. Existing
row values cast back to text 1:1.

Note: rollback recreates the `pending_notices_type_check` CHECK constraint
with the same allowed set, so any future row insertion that depended on
the relaxed-during-rollback text column is still rejected by the CHECK.

## Procedure

```sql
ALTER TABLE "pending_notices" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;
ALTER TABLE "pending_notices" ADD CONSTRAINT "pending_notices_type_check" CHECK ("type" IN ('consent_deleted', 'consent_archived'));
DROP TYPE "public"."pending_notice_type";
```

## Why this is BUG-571

Replaces text + CHECK with pgEnum so the value set is enforced at the type
system layer and adding a new notice type now requires a coordinated
schema + migration update (instead of failing silently at insert time with
a generic Postgres CHECK violation that lint and unit tests can't catch).
