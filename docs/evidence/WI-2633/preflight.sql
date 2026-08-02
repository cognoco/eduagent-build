-- WI-2633 preflight (AC-1). Read-only. Run inside: BEGIN TRANSACTION READ ONLY; ... COMMIT;
-- Target guard FIRST — this file must be unable to report on the wrong database.
DO $$
DECLARE
  actual_project text := current_setting('neon.project_id', true);
  actual_branch  text := current_setting('neon.branch_id', true);
BEGIN
  IF actual_project IS DISTINCT FROM 'lingering-violet-30592106'
     OR actual_branch IS DISTINCT FROM 'br-weathered-silence-agw4on4x' THEN
    RAISE EXCEPTION 'WI-2633 preflight target mismatch: found project %, branch %', actual_project, actual_branch;
  END IF;
END $$;

-- 1. The orphan set (rows to be deleted).
SELECT
  qp.id, qp.subscription_id, qp.monthly_limit, qp.used_this_month,
  qp.daily_limit, qp.used_today, qp.cycle_reset_at, qp.created_at, qp.updated_at,
  (SELECT count(*) FROM subscriptions ls WHERE ls.id = qp.subscription_id) AS legacy_subscription_rows,
  (SELECT ls.status FROM subscriptions ls WHERE ls.id = qp.subscription_id) AS legacy_status
FROM quota_pools qp
LEFT JOIN subscription s ON s.id = qp.subscription_id
WHERE s.id IS NULL
ORDER BY qp.id;

-- 2. The RETAINED rows and their pre-mutation counters, so "unchanged" is provable
--    against the postcheck rather than asserted. (Gap found in review of PR #2883.)
SELECT qp.id, qp.subscription_id, qp.monthly_limit, qp.used_this_month,
       qp.daily_limit, qp.used_today, qp.cycle_reset_at, qp.created_at, qp.updated_at
FROM quota_pools qp
JOIN subscription s ON s.id = qp.subscription_id
ORDER BY qp.id;

-- 3. Aggregate usage across ALL pools, before mutation.
SELECT count(*)::int AS pools_total,
       coalesce(sum(used_this_month),0)::int AS used_this_month_total,
       coalesce(sum(used_today),0)::int AS used_today_total
FROM quota_pools;
