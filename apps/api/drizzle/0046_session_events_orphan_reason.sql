-- 0046_session_events_orphan_reason.sql
-- Layer 2: track exchanges where the assistant turn was lost so the LLM can
-- acknowledge the gap on the next turn. Additive — no backfill required.
-- Reuses Layer 1's session_events_session_client_id_uniq index for dedup.

ALTER TABLE "session_events"
  ADD COLUMN "orphan_reason" text;
