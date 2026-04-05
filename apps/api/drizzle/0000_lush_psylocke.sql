-- Migration 0000: Initial schema (retrofitted for idempotency)
-- All DDL wrapped for safe re-run on push-bootstrapped databases.

DO $$ BEGIN
  CREATE TYPE "public"."analogy_domain" AS ENUM('cooking', 'sports', 'building', 'music', 'nature', 'gaming');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."assessment_status" AS ENUM('in_progress', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."needs_deepening_status" AS ENUM('active', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."teaching_method" AS ENUM('visual_diagrams', 'step_by_step', 'real_world_examples', 'practice_problems');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."verification_depth" AS ENUM('recall', 'explain', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."xp_status" AS ENUM('pending', 'verified', 'decayed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'plus', 'family', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."consent_status" AS ENUM('PENDING', 'PARENTAL_CONSENT_REQUESTED', 'CONSENTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."consent_type" AS ENUM('GDPR', 'COPPA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."location_type" AS ENUM('EU', 'US', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."persona_type" AS ENUM('TEEN', 'LEARNER', 'PARENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."subject_status" AS ENUM('active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."topic_relevance" AS ENUM('core', 'recommended', 'contemporary', 'emerging');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."draft_status" AS ENUM('in_progress', 'completed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."session_event_type" AS ENUM('user_message', 'ai_response', 'understanding_check', 'session_start', 'session_end', 'hint', 'escalation', 'flag', 'check_response', 'summary_submission', 'parking_lot_add', 'evaluate_challenge', 'teach_back_response');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."session_status" AS ENUM('active', 'paused', 'completed', 'auto_closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."session_type" AS ENUM('learning', 'homework', 'interleaved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."summary_status" AS ENUM('pending', 'submitted', 'accepted', 'skipped', 'auto_closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."learning_mode" AS ENUM('serious', 'casual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."notification_type" AS ENUM('review_reminder', 'daily_reminder', 'trial_expiry', 'streak_warning', 'consent_request', 'consent_reminder', 'consent_warning', 'consent_expired', 'subscribe_request');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"session_id" uuid,
	"verification_depth" "verification_depth" DEFAULT 'recall' NOT NULL,
	"status" "assessment_status" DEFAULT 'in_progress' NOT NULL,
	"mastery_score" numeric(3, 2),
	"quality_rating" integer,
	"exchange_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "needs_deepening_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"status" "needs_deepening_status" DEFAULT 'active' NOT NULL,
	"consecutive_success_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retention_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"ease_factor" numeric(4, 2) DEFAULT '2.50' NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"consecutive_successes" integer DEFAULT 0 NOT NULL,
	"xp_status" "xp_status" DEFAULT 'pending' NOT NULL,
	"evaluate_difficulty_rung" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_cards_profile_topic_unique" UNIQUE("profile_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teaching_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"method" "teaching_method" NOT NULL,
	"analogy_domain" "analogy_domain",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "byok_waitlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "byok_waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quota_pools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"monthly_limit" integer DEFAULT 50 NOT NULL,
	"used_this_month" integer DEFAULT 0 NOT NULL,
	"cycle_reset_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_pools_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"last_stripe_event_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "top_up_credits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"remaining" integer NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_embeddings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" uuid,
	"embedding" vector(1024) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	"deletion_cancelled_at" timestamp with time zone,
	CONSTRAINT "accounts_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"status" "consent_status" DEFAULT 'PENDING' NOT NULL,
	"parent_email" text,
	"consent_token" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_states_profile_type_unique" UNIQUE("profile_id","consent_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "family_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_profile_id" uuid NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"birth_date" timestamp,
	"persona_type" "persona_type" DEFAULT 'LEARNER' NOT NULL,
	"location" "location_type",
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curricula" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_adaptations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer NOT NULL,
	"relevance" "topic_relevance" DEFAULT 'core' NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "subject_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"session_type" "session_type" DEFAULT 'learning' NOT NULL,
	"verification_type" text,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"escalation_rung" integer DEFAULT 1 NOT NULL,
	"exchange_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"exchange_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extracted_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "draft_status" DEFAULT 'in_progress' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parking_lot_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" uuid,
	"question" text NOT NULL,
	"explored" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"event_type" "session_event_type" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"structured_assessment" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_summaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" uuid,
	"content" text,
	"ai_feedback" text,
	"status" "summary_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coaching_card_cache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"card_data" jsonb NOT NULL,
	"context_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_card_cache_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_modes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"mode" "learning_mode" DEFAULT 'serious' NOT NULL,
	"consecutive_summary_skips" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_modes_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"ticket_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"review_reminders" boolean DEFAULT false NOT NULL,
	"daily_reminders" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"max_daily_push" integer DEFAULT 3 NOT NULL,
	"expo_push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "streaks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" text,
	"grace_period_start_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streaks_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xp_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" "xp_status" DEFAULT 'pending' NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assessments" ADD CONSTRAINT "assessments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assessments" ADD CONSTRAINT "assessments_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assessments" ADD CONSTRAINT "assessments_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "needs_deepening_topics" ADD CONSTRAINT "needs_deepening_topics_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "needs_deepening_topics" ADD CONSTRAINT "needs_deepening_topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "needs_deepening_topics" ADD CONSTRAINT "needs_deepening_topics_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "retention_cards" ADD CONSTRAINT "retention_cards_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "retention_cards" ADD CONSTRAINT "retention_cards_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "teaching_preferences" ADD CONSTRAINT "teaching_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "teaching_preferences" ADD CONSTRAINT "teaching_preferences_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "quota_pools" ADD CONSTRAINT "quota_pools_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "top_up_credits" ADD CONSTRAINT "top_up_credits_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_embeddings" ADD CONSTRAINT "session_embeddings_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_embeddings" ADD CONSTRAINT "session_embeddings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_embeddings" ADD CONSTRAINT "session_embeddings_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "consent_states" ADD CONSTRAINT "consent_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "family_links" ADD CONSTRAINT "family_links_parent_profile_id_profiles_id_fk" FOREIGN KEY ("parent_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "family_links" ADD CONSTRAINT "family_links_child_profile_id_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curricula" ADD CONSTRAINT "curricula_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curriculum_adaptations" ADD CONSTRAINT "curriculum_adaptations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curriculum_adaptations" ADD CONSTRAINT "curriculum_adaptations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curriculum_adaptations" ADD CONSTRAINT "curriculum_adaptations_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "subjects" ADD CONSTRAINT "subjects_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_events" ADD CONSTRAINT "session_events_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_events" ADD CONSTRAINT "session_events_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_events" ADD CONSTRAINT "session_events_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coaching_card_cache" ADD CONSTRAINT "coaching_card_cache_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "learning_modes" ADD CONSTRAINT "learning_modes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "streaks" ADD CONSTRAINT "streaks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retention_cards_review_idx" ON "retention_cards" USING btree ("profile_id","next_review_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "top_up_credits_subscription_id_idx" ON "top_up_credits" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_hnsw_idx" ON "session_embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "family_links_child_profile_id_idx" ON "family_links" USING btree ("child_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_account_id_idx" ON "profiles" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_profile_id_idx" ON "subjects" USING btree ("profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_sessions_profile_id_idx" ON "learning_sessions" USING btree ("profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_events_session_id_idx" ON "session_events" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_log_profile_sent_idx" ON "notification_log" USING btree ("profile_id","sent_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xp_ledger_profile_id_idx" ON "xp_ledger" USING btree ("profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xp_ledger_topic_id_idx" ON "xp_ledger" USING btree ("topic_id");
