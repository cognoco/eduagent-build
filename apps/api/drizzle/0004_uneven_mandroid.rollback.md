# Rollback: 0004 — Add `celebration_level` enum, quota columns, session and coaching-cache columns

Migration adds:
- `celebration_level` enum type (`all`, `big_only`, `off`)
- `system_prompt` value to `session_event_type` enum via `ALTER TYPE ADD VALUE`
- `daily_limit`, `used_today` columns to `quota_pools`
- `monthly_limit` default change on `quota_pools`
- `wall_clock_seconds` column to `learning_sessions`
- `pending_celebrations`, `celebrations_seen_by_child`, `celebrations_seen_by_parent` columns to `coaching_card_cache`
- `median_response_seconds`, `celebration_level` columns to `learning_modes`

## Rollback

- **(a) Rollback possible?** Partially. The `ALTER TYPE ADD VALUE` for `session_event_type` is **not reversible** — PostgreSQL does not support `ALTER TYPE ... DROP VALUE`. All other changes (new columns, new enum type, default change) are reversible if no rows contain the new enum value.

- **(b) Data lost?**
  - `quota_pools.daily_limit` and `quota_pools.used_today`: today's quota tracking is lost.
  - `learning_sessions.wall_clock_seconds`: wall-clock timing data for all sessions.
  - `coaching_card_cache` celebration columns: all pending/seen celebration state.
  - `learning_modes.median_response_seconds` and `learning_modes.celebration_level`: response-time medians and celebration preferences.
  - The `system_prompt` enum value in `session_event_type` **cannot be removed**. If any rows in `session_events` have `type = 'system_prompt'`, dropping the column would fail or require deleting those rows first.

- **(c) Recovery procedure?**

  1. Ensure no `session_events` rows use `type = 'system_prompt'` before attempting rollback (delete or reclassify them).
  2. Apply the following SQL:
     ```sql
     ALTER TABLE "learning_modes" DROP COLUMN IF EXISTS "median_response_seconds";
     ALTER TABLE "learning_modes" DROP COLUMN IF EXISTS "celebration_level";
     ALTER TABLE "coaching_card_cache" DROP COLUMN IF EXISTS "pending_celebrations";
     ALTER TABLE "coaching_card_cache" DROP COLUMN IF EXISTS "celebrations_seen_by_child";
     ALTER TABLE "coaching_card_cache" DROP COLUMN IF EXISTS "celebrations_seen_by_parent";
     ALTER TABLE "learning_sessions" DROP COLUMN IF EXISTS "wall_clock_seconds";
     ALTER TABLE "quota_pools" DROP COLUMN IF EXISTS "daily_limit";
     ALTER TABLE "quota_pools" DROP COLUMN IF EXISTS "used_today";
     ALTER TABLE "quota_pools" ALTER COLUMN "monthly_limit" DROP DEFAULT;
     DROP TYPE IF EXISTS "public"."celebration_level";
     -- NOTE: 'system_prompt' value in session_event_type CANNOT be removed.
     ```
  3. Revert the TypeScript schema and service code that references these columns and the `celebration_level` type.
  4. Rebuild and redeploy the API Worker.
