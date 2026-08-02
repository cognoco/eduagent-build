-- WI-2633 preflight: capture the exact orphan set and full row state BEFORE mutation.
-- Read-only. Orphan = quota_pools row whose subscription_id has no row in the new `subscription` parent.
SELECT
  qp.id, qp.subscription_id, qp.monthly_limit, qp.used_this_month,
  qp.daily_limit, qp.used_today, qp.cycle_reset_at, qp.created_at, qp.updated_at,
  (SELECT count(*) FROM subscriptions ls WHERE ls.id = qp.subscription_id) AS legacy_subscription_rows,
  (SELECT ls.status FROM subscriptions ls WHERE ls.id = qp.subscription_id) AS legacy_status
FROM quota_pools qp
LEFT JOIN subscription s ON s.id = qp.subscription_id
WHERE s.id IS NULL
ORDER BY qp.id;
