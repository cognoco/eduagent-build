CREATE TABLE "consent_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"charge_person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"purpose" text DEFAULT 'platform_use' NOT NULL,
	"requested_basis" text NOT NULL,
	"guardian_person_id" uuid,
	"guardian_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"token_expires_at" timestamp with time zone,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"recipient_change_count" integer DEFAULT 0 NOT NULL,
	"policy_version" text,
	"request_ip" text,
	"user_agent" text,
	"requested_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"consent_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_request_requested_basis_check" CHECK ("consent_request"."requested_basis" IN ('coppa_parental_consent','gdpr_parental_consent')),
	CONSTRAINT "consent_request_status_check" CHECK ("consent_request"."status" IN ('pending','requested','approved','denied','expired')),
	CONSTRAINT "consent_request_resend_count_check" CHECK ("consent_request"."resend_count" >= 0),
	CONSTRAINT "consent_request_recipient_change_count_check" CHECK ("consent_request"."recipient_change_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "consent_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "conversation_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "pronouns" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "default_app_context" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_stripe_event_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_stripe_event_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "revenuecat_original_app_user_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_revenuecat_event_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_revenuecat_event_timestamp_ms" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_request" ADD CONSTRAINT "consent_request_charge_person_id_person_id_fk" FOREIGN KEY ("charge_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_request" ADD CONSTRAINT "consent_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_request" ADD CONSTRAINT "consent_request_guardian_person_id_person_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_request" ADD CONSTRAINT "consent_request_consent_grant_id_consent_grant_id_fk" FOREIGN KEY ("consent_grant_id") REFERENCES "public"."consent_grant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_request_charge_purpose_org_basis_unique" ON "consent_request" USING btree ("charge_person_id","purpose","organization_id","requested_basis");--> statement-breakpoint
CREATE INDEX "consent_request_token_idx" ON "consent_request" USING btree ("token") WHERE "consent_request"."token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "consent_request_status_requested_idx" ON "consent_request" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "person_archived_at_idx" ON "person" USING btree ("archived_at") WHERE "person"."archived_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_stripe_customer_id_idx" ON "subscription" USING btree ("stripe_customer_id") WHERE "subscription"."stripe_customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_stripe_subscription_id_idx" ON "subscription" USING btree ("stripe_subscription_id") WHERE "subscription"."stripe_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_org_revenuecat_event_id_idx" ON "subscription" USING btree ("organization_id","last_revenuecat_event_id") WHERE "subscription"."last_revenuecat_event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_org_stripe_event_id_idx" ON "subscription" USING btree ("organization_id","last_stripe_event_id") WHERE "subscription"."last_stripe_event_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_conversation_language_check" CHECK ("person"."conversation_language" IN ('en','cs','es','fr','de','it','pt','pl','ja','nb'));--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_pronouns_length_check" CHECK ("person"."pronouns" IS NULL OR char_length("person"."pronouns") <= 32);--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_default_app_context_check" CHECK ("person"."default_app_context" IS NULL OR "person"."default_app_context" IN ('study','family'));--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_tier_check" CHECK ("subscription"."plan_tier" IN ('free','plus','family','pro'));--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_status_check" CHECK ("subscription"."status" IN ('trial','active','past_due','cancelled','expired'));--> statement-breakpoint
-- CUT-A (MMT-ADR-0020): consent_request RLS isolation policy ships WITH the
-- table (never ENABLE-without-policy — see §1.2a). charge_person_id is the
-- isolation anchor (person.id = profiles.id, so the app.current_profile_id GUC
-- carries over unchanged). Mirrors consent_states_profile_isolation (0085).
-- Guarded by DO $$ / IF NOT EXISTS so the migration is idempotent (re-runnable),
-- matching the 0085 / 0112 convention.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='consent_request' AND policyname='consent_request_charge_isolation') THEN
    CREATE POLICY "consent_request_charge_isolation" ON "consent_request"
      USING ("charge_person_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
      WITH CHECK ("charge_person_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
  END IF;
END $$;