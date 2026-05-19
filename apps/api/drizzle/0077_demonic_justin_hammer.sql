-- [BUG-116] DB-level idempotency for RevenueCat webhook events.
--
-- The application-layer isRevenuecatEventProcessed() check races with
-- ensureFreeSubscription on first-event delivery: two concurrent identical
-- webhooks can both see "not processed" and both proceed past the
-- application gate, doing redundant work and emitting duplicate downstream
-- events. This partial unique index makes a same-(account, event) collision
-- impossible at the storage layer — the second UPDATE that tries to stamp
-- the same event_id on the same account row is rejected by Postgres.
--
-- The partial WHERE clause prevents accounts that have never received any
-- RevenueCat event (last_revenuecat_event_id = NULL) from colliding with
-- each other on NULL — Postgres treats multiple NULLs as distinct in a
-- regular unique index, but the partial filter makes the intent explicit.
--
-- Additive-only migration: no existing data is modified, no columns are
-- dropped. Existing rows where last_revenuecat_event_id IS NULL are
-- unaffected by the partial filter.
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_account_revenuecat_event_id_idx"
  ON "subscriptions" USING btree ("account_id","last_revenuecat_event_id")
  WHERE "subscriptions"."last_revenuecat_event_id" IS NOT NULL;
