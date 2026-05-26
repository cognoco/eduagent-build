# Rollback: 0103_dear_secret_warriors

## Summary

This migration adds the `child_cap_notifications` table for owner-visible child quota-cap banners.

## Rollback

If rollback is needed before any notification rows matter, run:

```sql
DROP TABLE IF EXISTS "child_cap_notifications";
```

## Data Loss

Dropping the table deletes any recorded child-cap notification and dismissal state. This is acceptable only if the feature has not shipped or if losing in-app notification history is explicitly approved.

## Recovery

Reapply the migration to recreate the table. Existing cap-hit events are not replayed automatically; new cap-hit events will create rows after the migration is restored.
