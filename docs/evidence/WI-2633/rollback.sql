-- WI-2633 rollback. VALID ONLY while the FK still targets legacy `subscriptions`
-- (i.e. before migration 0129_m_repoint.sql runs). After 0129 this INSERT would itself
-- violate the repointed FK; the real restore at that point is the Neon branch snapshot
-- br-rough-heart-ag22kigb (parent br-weathered-silence-agw4on4x @ LSN 0/31B53E00).
BEGIN;
INSERT INTO quota_pools (id, subscription_id, monthly_limit, used_this_month, daily_limit, used_today, cycle_reset_at, created_at, updated_at)
VALUES
  ('019d782a-ce22-7660-9a0d-73941f2830a0','019d782a-cddc-7e58-b06a-15f2a39815e5',100,0,10,0,'2026-07-10T16:12:44.450Z','2026-04-10T16:12:44.501Z','2026-06-11T09:44:45.187Z'),
  ('019dea4e-e828-7590-92ee-a794972fade3','019dea4e-e794-7a9d-86b9-9a55df7e9629',100,0,10,0,'2026-07-02T20:08:53.032Z','2026-05-02T20:08:53.153Z','2026-06-09T19:40:08.362Z'),
  ('019df86f-0ddf-7440-9b66-a294d806de28','019df86f-0d84-71e8-b46d-d5cdf265f507',100,0,10,0,'2026-07-05T13:58:40.863Z','2026-05-05T13:58:40.914Z','2026-06-09T19:40:08.362Z');
COMMIT;
