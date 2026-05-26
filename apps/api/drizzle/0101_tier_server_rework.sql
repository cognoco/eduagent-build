CREATE TABLE IF NOT EXISTS "profile_quota_usage" (
  "id" uuid PRIMARY KEY NOT NULL,
  "subscription_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "role" text NOT NULL,
  "monthly_limit" integer NOT NULL,
  "used_this_month" integer DEFAULT 0 NOT NULL,
  "daily_limit" integer,
  "used_today" integer DEFAULT 0 NOT NULL,
  "cycle_reset_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profile_quota_usage_month_non_negative" CHECK ("used_this_month" >= 0),
  CONSTRAINT "profile_quota_usage_today_non_negative" CHECK ("used_today" >= 0)
);
--> statement-breakpoint
ALTER TABLE "profile_quota_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_quota_usage" ADD CONSTRAINT "profile_quota_usage_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_quota_usage" ADD CONSTRAINT "profile_quota_usage_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "top_up_credits" ADD COLUMN IF NOT EXISTS "profile_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "top_up_credits" ADD CONSTRAINT "top_up_credits_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profile_quota_usage_sub_profile_idx" ON "profile_quota_usage" USING btree ("subscription_id","profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_quota_usage_subscription_idx" ON "profile_quota_usage" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "top_up_credits_sub_profile_expires_idx" ON "top_up_credits" USING btree ("subscription_id","profile_id","expires_at");
