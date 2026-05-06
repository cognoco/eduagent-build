# 0065_family_preferences rollback

## Rollback possibility

Safe. This migration creates a new table, `family_preferences`, for one
owner-scoped sharing toggle that defaults to `false`.

## What is lost on rollback

Per-owner family-pool breakdown sharing choices. After rollback, non-owner
family members return to seeing only their own usage row, which matches the
pre-PR-5 behavior.

## Procedure

```sql
DROP TABLE IF EXISTS family_preferences;
```
