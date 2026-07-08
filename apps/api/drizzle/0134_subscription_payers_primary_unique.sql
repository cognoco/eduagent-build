-- WI-1430: enforce one primary payer per subscription.
--
-- This additive partial unique index preserves secondary payer rows while making
-- PostgreSQL reject a second `role = 'primary'` row for the same subscription.
-- Rollback is safe and lossless: drop this index only.

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payers_primary_subscription_unique"
  ON "subscription_payers" USING btree ("subscription_id")
  WHERE "role" = 'primary';
