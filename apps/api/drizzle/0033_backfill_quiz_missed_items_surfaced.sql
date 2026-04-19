-- Backfill: mark all existing quiz_missed_items as surfaced.
-- New items created after this deploy participate in the new surfacing mechanic.
-- This prevents the first coaching card tap from sweeping hundreds of historical items.
--
-- Rollback: NOT recommended via UPDATE — cannot distinguish backfilled rows from
-- legitimately surfaced rows post-deploy. Restore from pre-backfill snapshot instead.
UPDATE quiz_missed_items
SET surfaced = true
WHERE surfaced = false;
