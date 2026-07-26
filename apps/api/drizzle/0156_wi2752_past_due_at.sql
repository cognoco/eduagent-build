ALTER TABLE "subscription" ADD COLUMN "past_due_at" timestamp with time zone;--> statement-breakpoint
-- Best-effort historical seed. Future transitions author this timestamp only
-- when status enters past_due, so unrelated subscription writes cannot reset it.
UPDATE "subscription"
SET "past_due_at" = "updated_at"
WHERE "status" = 'past_due';
