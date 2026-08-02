-- WI-2633 guarded repair: delete three orphaned quota_pools rows on the dev branch.
-- Aborts on target mismatch, orphan-set drift, or unexpected delete count. Single transaction.
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
