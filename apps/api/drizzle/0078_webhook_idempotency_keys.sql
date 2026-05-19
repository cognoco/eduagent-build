-- [BUG-319 / CCR PR #254] Atomic webhook idempotency.
--
-- The previous Resend webhook dedup was a Cloudflare KV check-then-write:
-- read the key, decide, then put. Two concurrent identical webhooks can
-- both pass the read gate before either has written. Writing the KV record
-- BEFORE processing (the partial mitigation that prompted CCR PR #254) only
-- shrinks the race window to the KV put-ack latency — it does not close it.
--
-- This table provides the missing atomic primitive: the INSERT itself is
-- the gate. Two concurrent INSERTs with the same (source, webhook_id) result
-- in exactly one row, with the loser surfacing as a `23505 unique_violation`
-- (or as a zero-row return from `INSERT ... ON CONFLICT DO NOTHING RETURNING`).
--
-- Additive-only migration: no existing tables are modified, no columns are
-- dropped.
CREATE TABLE IF NOT EXISTS "webhook_idempotency_keys" (
  "source" text NOT NULL,
  "webhook_id" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_idempotency_keys_pkey" PRIMARY KEY ("source", "webhook_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_idempotency_keys_received_at_idx"
  ON "webhook_idempotency_keys" USING btree ("received_at");
