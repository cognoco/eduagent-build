-- Idempotency retrofit: all ADD COLUMN statements use IF NOT EXISTS
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "revenuecat_original_app_user_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_revenuecat_event_id" text;--> statement-breakpoint
ALTER TABLE "top_up_credits" ADD COLUMN IF NOT EXISTS "revenuecat_transaction_id" text;--> statement-breakpoint
ALTER TABLE "consent_states" ADD COLUMN IF NOT EXISTS "resend_count" integer DEFAULT 0 NOT NULL;