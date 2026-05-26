# 0101_tier_server_rework rollback

## Rollback possibility

Safe only before launch or before these rows become billing-relevant history.
The migration is additive: it creates `profile_quota_usage` and adds nullable
`top_up_credits.profile_id`.

## What is lost on rollback

All per-profile quota history in `profile_quota_usage` is lost. Dropping
`top_up_credits.profile_id` removes buyer-profile attribution from top-up
packs, so Plus owner-only top-up isolation can no longer be enforced from
storage.

## Procedure

```sql
DROP INDEX IF EXISTS "top_up_credits_sub_profile_expires_idx";
ALTER TABLE "top_up_credits" DROP CONSTRAINT IF EXISTS "top_up_credits_profile_id_profiles_id_fk";
ALTER TABLE "top_up_credits" DROP COLUMN IF EXISTS "profile_id";
DROP TABLE IF EXISTS "profile_quota_usage";
```
