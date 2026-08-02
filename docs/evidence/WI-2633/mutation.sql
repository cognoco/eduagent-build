-- WI-2633 guarded repair: delete three orphaned quota_pools rows on the dev branch.
-- Aborts on target mismatch, orphan-set drift, or unexpected delete count. Single transaction.
--
-- AS-EXECUTED, 2026-08-02. This file is the statement set that actually ran; it is deliberately
-- NOT rewritten to look better in hindsight.
-- KNOWN WEAKNESS, raised as P1 by two independent reviewers on PR #2883 and accepted as correct:
-- the orphan SELECT and the id-only DELETE are separate statements with no row locks. Under READ
-- COMMITTED that is a time-of-check/time-of-use window: a concurrent writer could acquire a new
-- `subscription` parent for a target row, or mutate its counters, between the check and the
-- delete. Combined with the fact that concurrent dev writes were NOT frozen (see README), the
-- set-identity check is therefore WEAKER protection than the README originally implied.
-- A re-run of this procedure MUST serialize the two, e.g. SELECT ... FOR UPDATE on the candidate
-- rows, or an explicit lock/freeze, before the DELETE.
-- Outcome as executed was nonetheless verified correct: exactly 3 rows deleted, 6 retained
-- unchanged, 0 orphans remaining, 0 quota usage lost (see postcheck-results.json).
BEGIN;
DO $$
DECLARE
  expected_project constant text := 'lingering-violet-30592106';
  expected_branch  constant text := 'br-weathered-silence-agw4on4x';
  actual_project text := current_setting('neon.project_id', true);
  actual_branch  text := current_setting('neon.branch_id', true);
BEGIN
  IF actual_project IS DISTINCT FROM expected_project OR actual_branch IS DISTINCT FROM expected_branch THEN
    RAISE EXCEPTION 'WI-2633 target mismatch: expected project % branch %, found project % branch %',
      expected_project, expected_branch, actual_project, actual_branch;
  END IF;
END $$;
DO $$
DECLARE
  expected uuid[] := ARRAY['019d782a-ce22-7660-9a0d-73941f2830a0','019dea4e-e828-7590-92ee-a794972fade3','019df86f-0ddf-7440-9b66-a294d806de28']::uuid[];
  actual uuid[];
  deleted_count integer;
BEGIN
  SELECT array_agg(qp.id ORDER BY qp.id) INTO actual
  FROM quota_pools qp LEFT JOIN subscription s ON s.id = qp.subscription_id WHERE s.id IS NULL;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'WI-2633 orphan set changed: expected %, found %', expected, actual;
  END IF;
  DELETE FROM quota_pools WHERE id = ANY(expected);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count <> 3 THEN
    RAISE EXCEPTION 'WI-2633 delete count changed: expected 3, deleted %', deleted_count;
  END IF;
END $$;
DO $$
DECLARE remaining integer;
BEGIN
  SELECT count(*) INTO remaining FROM quota_pools qp
  LEFT JOIN subscription s ON s.id = qp.subscription_id WHERE s.id IS NULL;
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'WI-2633 post-state check failed: % orphan(s) remain', remaining;
  END IF;
END $$;
COMMIT;
