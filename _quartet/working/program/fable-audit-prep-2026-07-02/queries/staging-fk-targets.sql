SELECT
  conrelid::regclass AS source_table,
  conname,
  confrelid::regclass AS target_table
FROM pg_constraint
WHERE contype = 'f'
  AND (
    conrelid::regclass::text IN (
      'quota_pools',
      'top_up_credits',
      'usage_events',
      'profile_quota_usage',
      'subscription_payers'
    )
    OR confrelid::regclass::text IN ('subscription', 'subscriptions')
  )
-- NOTE (prep-agent fix 2026-07-02): handover SQL had `ORDER BY source_table::text`
-- which Postgres rejects (`::text` forces alias→base-column resolution). Ordering
-- by the underlying expression instead. Result set is identical.
ORDER BY conrelid::regclass::text, conname;
