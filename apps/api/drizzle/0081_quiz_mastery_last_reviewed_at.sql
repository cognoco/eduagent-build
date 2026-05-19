-- [CR-2026-05-19-H9] Add dedicated last_reviewed_at column to quiz_mastery_items.
--
-- Background: SM-2 retention scheduling needs the timestamp of the last real
-- review to compute the inter-review interval. The code previously used
-- `updated_at`, but that column is dirtied by MC-streak counter writes
-- (incrementMcSuccessCount / resetMcSuccessCount) that run on every multiple-
-- choice answer between rounds. As a result, SM-2's next-review interval was
-- computed from a bogus "just touched" timestamp and items resurfaced sooner
-- than the algorithm intended.
--
-- This migration adds a dedicated `last_reviewed_at` column that is set ONLY
-- inside `updateSm2` (real SM-2 review) and on initial insert from a
-- discovery answer. MC-streak writes do not touch it.

ALTER TABLE "quiz_mastery_items"
  ADD COLUMN "last_reviewed_at" timestamp with time zone;
--> statement-breakpoint

-- Backfill existing rows. At the time of this migration `updated_at` is the
-- closest proxy we have to the last review time (it may be inflated by MC-
-- streak writes, but for already-existing rows it is the best estimate, and
-- the first real SM-2 review after deploy will overwrite it correctly).
UPDATE "quiz_mastery_items"
  SET "last_reviewed_at" = "updated_at"
  WHERE "last_reviewed_at" IS NULL;
--> statement-breakpoint

ALTER TABLE "quiz_mastery_items"
  ALTER COLUMN "last_reviewed_at" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "quiz_mastery_items"
  ALTER COLUMN "last_reviewed_at" SET DEFAULT now();
