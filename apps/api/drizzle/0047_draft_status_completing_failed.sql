-- 0047_draft_status_completing_failed.sql
-- Layer 3: extend draft_status with two new values for the Inngest-backed
-- persistCurriculum flow, plus a typed failure_code column.
-- Postgres requires ADD VALUE statements be their own transaction — the
-- drizzle migrate runner handles this correctly, but if running by hand,
-- run each ADD VALUE separately.

ALTER TYPE "draft_status" ADD VALUE IF NOT EXISTS 'completing';
ALTER TYPE "draft_status" ADD VALUE IF NOT EXISTS 'failed';

-- failure_code is a constrained text column, not a Postgres enum, so we can
-- evolve the value set in code without DDL each time. The application
-- validates writes via persistFailureCodeSchema.
ALTER TABLE "onboarding_drafts"
  ADD COLUMN "failure_code" text;
