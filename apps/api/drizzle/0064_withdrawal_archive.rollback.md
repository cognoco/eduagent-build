# 0064_withdrawal_archive rollback

## Rollback possibility

**PARTIAL.** The new tables can be dropped safely. The `archived_at` column on
`profiles` is also safe to drop, but rolling back destroys archive intent for
any profile currently in the 30-day archive window.

## What is lost on rollback

- Per-owner withdrawal archive preferences.
- Unseen post-grace notices.
- Archived state for profiles currently in the 30-day archive window. After
  rollback, those profiles reappear unless operators hard-delete them first.

Postgres enum values cannot be removed from `notification_type` without
recreating the enum type, so the `consent_archived` value is left in place.

## Procedure

```sql
-- Optional: hard-delete profiles already in the archive window.
DELETE FROM profiles WHERE archived_at IS NOT NULL;

DROP TABLE IF EXISTS pending_notices;
DROP TABLE IF EXISTS withdrawal_archive_preferences;
DROP TYPE IF EXISTS withdrawal_archive_preference;

ALTER TABLE profiles DROP COLUMN IF EXISTS archived_at;
```
