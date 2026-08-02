-- WI-2633 postchecks (AC-4). Read-only; these are the EXECUTABLE queries behind
-- postcheck-results.json. (The original committed file held only prose; that defect was
-- found in review of PR #2883 and is corrected here.)
DO $$
DECLARE
  actual_project text := current_setting('neon.project_id', true);
  actual_branch  text := current_setting('neon.branch_id', true);
BEGIN
  IF actual_project IS DISTINCT FROM 'lingering-violet-30592106'
     OR actual_branch IS DISTINCT FROM 'br-weathered-silence-agw4on4x' THEN
    RAISE EXCEPTION 'WI-2633 postcheck target mismatch: found project %, branch %', actual_project, actual_branch;
  END IF;
END $$;

-- 1. Zero orphans remain.
SELECT count(*)::int AS orphans_remaining
FROM quota_pools qp LEFT JOIN subscription s ON s.id = qp.subscription_id
WHERE s.id IS NULL;

-- 2. The three deleted ids are absent.
SELECT count(*)::int AS deleted_ids_still_present
FROM quota_pools
WHERE id = ANY(ARRAY['019d782a-ce22-7660-9a0d-73941f2830a0',
                     '019dea4e-e828-7590-92ee-a794972fade3',
                     '019df86f-0ddf-7440-9b66-a294d806de28']::uuid[]);

-- 3. Retained rows and counters — compare against preflight query 2.
SELECT qp.id, qp.subscription_id, qp.monthly_limit, qp.used_this_month,
       qp.daily_limit, qp.used_today
FROM quota_pools qp ORDER BY qp.id;

-- 4. No quota usage lost.
SELECT count(*)::int AS pools_total,
       coalesce(sum(used_this_month),0)::int AS used_this_month_total,
       coalesce(sum(used_today),0)::int AS used_today_total
FROM quota_pools;

-- 5. Live child FKs still targeting legacy parents (excluding drop-list children).
--    Expected NON-ZERO until migration 0129 runs; recorded, not asserted zero.
SELECT con.conname, cl.relname AS child, ref.relname AS parent
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_class ref ON ref.oid = con.confrelid
WHERE con.contype = 'f' AND ref.relname IN ('profiles','subscriptions','accounts')
  AND cl.relname NOT IN ('profiles','accounts','family_links','consent_states')
ORDER BY 1;

-- 6. No unvalidated FK constraints.
SELECT count(*)::int AS unvalidated_fks FROM pg_constraint WHERE contype = 'f' AND NOT convalidated;
