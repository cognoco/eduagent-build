CREATE INDEX IF NOT EXISTS "subscription_payer_person_id_idx"
  ON "subscription" USING btree ("payer_person_id");

CREATE INDEX IF NOT EXISTS "subscription_payers_person_id_idx"
  ON "subscription_payers" USING btree ("person_id");
