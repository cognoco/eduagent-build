-- Migration 0011: Bug-fix constraints and columns
-- Items from bug-fix-plan.md: D-05 (CHECK constraints), D-06 (family_links
-- integrity), BD-01 (RevenueCat event timestamp), plus indexes that were
-- defined in the Drizzle schema but never migrated (BS-02, curricula unique).
-- All idempotent for databases that were synced via drizzle-kit push.

-- D-05: CHECK constraint — retention_cards.interval_days must be >= 1
DO $$ BEGIN
  ALTER TABLE "retention_cards" ADD CONSTRAINT "retention_cards_interval_days_positive"
    CHECK ("retention_cards"."interval_days" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- D-05: CHECK constraint — quota_pools.used_this_month must be >= 0
DO $$ BEGIN
  ALTER TABLE "quota_pools" ADD CONSTRAINT "quota_pools_used_this_month_non_negative"
    CHECK ("quota_pools"."used_this_month" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- D-05: CHECK constraint — top_up_credits.remaining must be >= 0
DO $$ BEGIN
  ALTER TABLE "top_up_credits" ADD CONSTRAINT "top_up_credits_remaining_non_negative"
    CHECK ("top_up_credits"."remaining" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- D-06: Unique constraint — prevent duplicate family links
DO $$ BEGIN
  ALTER TABLE "family_links" ADD CONSTRAINT "family_links_parent_child_unique"
    UNIQUE("parent_profile_id", "child_profile_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- D-06: CHECK constraint — prevent self-links in family_links
DO $$ BEGIN
  ALTER TABLE "family_links" ADD CONSTRAINT "family_links_no_self_link"
    CHECK ("family_links"."parent_profile_id" != "family_links"."child_profile_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- BD-01: Add timestamp column for RevenueCat event ordering
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_revenuecat_event_timestamp_ms" text;
--> statement-breakpoint

-- BS-02: Unique index on top_up_credits.revenuecat_transaction_id (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "top_up_credits_rc_txn_id_idx"
  ON "top_up_credits" USING btree ("revenuecat_transaction_id");
--> statement-breakpoint

-- Unique index on curricula (subject_id, version) — schema-defined but never migrated
CREATE UNIQUE INDEX IF NOT EXISTS "curricula_subject_version_idx"
  ON "curricula" USING btree ("subject_id", "version");
