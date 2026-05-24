# 0089_ancient_naoko rollback

## Rollback possibility

Safe. This migration adds nullable `profiles.default_app_context` plus a
check constraint limiting values to `study` or `family`.

## What is lost on rollback

Users lose their persisted Study/Family default preference. After rollback,
mobile falls back to Study for V1 profiles that are not explicitly persisted
and to the legacy V0 derivation when V1 is disabled.

## Procedure

```sql
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_default_app_context_check";
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "default_app_context";
```
