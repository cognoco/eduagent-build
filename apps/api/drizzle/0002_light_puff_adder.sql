-- Idempotency retrofit: ADD COLUMN uses IF NOT EXISTS
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "raw_input" text;