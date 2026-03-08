ALTER TABLE "subscriptions" ADD COLUMN "revenuecat_original_app_user_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_revenuecat_event_id" text;--> statement-breakpoint
ALTER TABLE "top_up_credits" ADD COLUMN "revenuecat_transaction_id" text;--> statement-breakpoint
ALTER TABLE "consent_states" ADD COLUMN "resend_count" integer DEFAULT 0 NOT NULL;