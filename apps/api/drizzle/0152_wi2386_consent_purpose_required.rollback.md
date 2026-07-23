# Rollback — 0152_wi2386_consent_purpose_required

## Changes in this migration

The migration removes the `platform_use` default from
`consent_request.purpose`. It does not rewrite or delete existing consent
requests.

## Rollback

**Possible:** Yes, without data loss.

**Data loss:** None. Restoring the default changes only how future inserts that
omit `purpose` are interpreted; existing rows and consent evidence are
unchanged.

**Procedure:**

```sql
ALTER TABLE "consent_request"
  ALTER COLUMN "purpose" SET DEFAULT 'platform_use';
```

**Side effects on rollback:**

- The restored default revives the legacy whole-workflow `platform_use` proxy.
  Roll back the WI-2386 application changes in lockstep so old code and the
  schema agree.
- Any request created after rollback without an explicit purpose is recorded as
  `platform_use` only. Reapplying WI-2386 requires explicit complete-set
  re-consent; do not infer or backfill `llm_disclosure` from those rows.
