-- 0113_identity_stray_ddl.sql
-- Pre-existing baseline reconciliation (NOT CUT-A semantics).
--
-- Surfaced by the WI-689 CUT-A generate-preflight: the Drizzle journal snapshot
-- (frozen at 0108 baseline / 0112) and the TS schema in
-- packages/database/src/schema/{identity,concept-mastery}.ts disagree on a set of
-- objects. dev is push-managed (db:push:dev) and already at the TS-schema target
-- state; this migration brings the journal snapshot and any non-pushed
-- environment (staging) into agreement so the NEXT generate (M-HOMES) emits ONLY
-- the CUT-A additions and never silently bundles this drift.
--
-- Three drift classes, all reconciled here:
--   Cat-1  concepts + concept_mastery — CREATE lived only in journal-removed
--          0107 (concept-capture tables; FKs to legacy `profiles`, valid pre-drop).
--          Physically present in dev already → CREATE ... IF NOT EXISTS.
--   Cat-2  five UNIQUE constraints whose TS form is now uniqueIndex(...) — the DB
--          equivalent is a plain unique index. Reconciled by dropping the
--          constraint (if it still exists) and ensuring the unique index exists.
--          Gate (a) verified: no FK references the converted column sets
--          (the only FK into these tables is policy_rules.cell_id → policy_cells
--          PRIMARY KEY, unaffected).
--   Cat-3  five CHECK constraints renamed `*_check` → `*_valid` (Drizzle now emits
--          named table-level checks). Reconciled by dropping the old name (if
--          present) and adding the new name (if absent).
--   Cat-4  person.has_own_account default — assert DEFAULT false (matches the TS
--          `.default(false)`: a new person owns no account until proven).
--
-- IDEMPOTENT BY CONSTRUCTION. dev/stg are journal-drifted (drizzle-kit migrate
-- ABORTED on exactly this class in WI-585 with 42701 "already exists"). Every
-- drop uses IF EXISTS; every add is guarded so a name already in the target state
-- cannot abort the migration. Safe to apply against the old state OR the
-- already-converged state.
--
-- ## Rollback
-- This migration does DROP/RECREATE (it is NOT purely additive). Reversal:
--   - Cat-1: DROP TABLE IF EXISTS concept_mastery; DROP TABLE IF EXISTS concepts;
--            DROP TYPE IF EXISTS concept_mastery_status;  (data loss: any
--            concept-capture rows. dev/stg only — feature not yet in prod.)
--   - Cat-2: drop each unique index; re-add the matching UNIQUE constraint
--            (ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (cols)). No data loss.
--   - Cat-3: drop each `*_valid` check; re-add the `*_check` form. No data loss.
--   - Cat-4: ALTER TABLE person ALTER COLUMN has_own_account DROP DEFAULT. No data loss.
-- Because every statement is guarded, re-running the forward migration after a
-- partial rollback converges. No CUT-A object is touched here.

-- ===========================================================================
-- Cat-1: concept_mastery_status enum + concepts + concept_mastery tables
-- (journal reconciliation; CREATE IF NOT EXISTS — already physically present in dev)
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE "public"."concept_mastery_status" AS ENUM('solid', 'partial', 'missing', 'misconception');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "concepts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepts_profile_topic_label_unique" UNIQUE("profile_id","topic_id","normalized_label")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "concept_mastery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"concept_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" "concept_mastery_status" NOT NULL,
	"verified_at" timestamp with time zone,
	"last_evaluated_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"source_session_id" uuid,
	"learner_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_mastery_concept_unique" UNIQUE("concept_id")
);
--> statement-breakpoint

-- Cat-1 FKs (guarded: skip if already present)
DO $$ BEGIN
  ALTER TABLE "concepts" ADD CONSTRAINT "concepts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "concepts" ADD CONSTRAINT "concepts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "concepts" ADD CONSTRAINT "concepts_topic_id_curriculum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."curriculum_topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_source_session_id_learning_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Cat-1 indexes (IF NOT EXISTS — already present in dev)
CREATE INDEX IF NOT EXISTS "concept_mastery_profile_id_idx" ON "concept_mastery" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_profile_topic_idx" ON "concepts" USING btree ("profile_id","topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_profile_id_idx" ON "concepts" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "concept_mastery" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "concepts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ===========================================================================
-- Cat-2: UNIQUE constraint -> unique index reconciliation
-- (drop the constraint if it still exists; ensure the unique index exists)
-- Gate (a): no FK references these unique column sets, so dropping the
-- constraint cannot orphan a foreign key.
-- ===========================================================================
ALTER TABLE "membership"          DROP CONSTRAINT IF EXISTS "membership_person_org_unique";--> statement-breakpoint
ALTER TABLE "policy_cells"        DROP CONSTRAINT IF EXISTS "policy_cells_unique";--> statement-breakpoint
ALTER TABLE "policy_rules"        DROP CONSTRAINT IF EXISTS "policy_rules_unique";--> statement-breakpoint
ALTER TABLE "allowed_models"      DROP CONSTRAINT IF EXISTS "allowed_models_unique";--> statement-breakpoint
ALTER TABLE "subscription_payers" DROP CONSTRAINT IF EXISTS "subscription_payers_unique";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "membership_person_org_unique" ON "membership" USING btree ("person_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "policy_cells_unique" ON "policy_cells" USING btree ("age_band_min","age_band_max","regime_id","knowledge_axis","knowledge_value");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "policy_rules_unique" ON "policy_rules" USING btree ("cell_id","kind","source_instrument","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "allowed_models_unique" ON "allowed_models" USING btree ("model","provider_via_service","service","region","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payers_unique" ON "subscription_payers" USING btree ("subscription_id","person_id");--> statement-breakpoint

-- ===========================================================================
-- Cat-3: CHECK constraint rename (*_check -> *_valid)
-- Drop the legacy `*_check` name if present; add the `*_valid` name if absent.
-- Constraint expressions are unchanged from 0108 — only the names differ
-- (guardianship_qualification expression matches the ratified set verbatim).
-- ===========================================================================
ALTER TABLE "guardianship"         DROP CONSTRAINT IF EXISTS "guardianship_qualification_check";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "guardianship" ADD CONSTRAINT "guardianship_qualification_valid" CHECK ("guardianship"."qualification" IN ('biological_parent','adoptive_parent','stepparent','grandparent','court_appointed_guardian','foster_parent','kinship_caregiver','sibling_with_custody','other'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "policy_cells"         DROP CONSTRAINT IF EXISTS "policy_cells_knowledge_axis_check";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "policy_cells" ADD CONSTRAINT "policy_cells_knowledge_axis_valid" CHECK ("policy_cells"."knowledge_axis" IN ('age', 'residence'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "knowledge_assertions" DROP CONSTRAINT IF EXISTS "knowledge_assertions_axis_check";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "knowledge_assertions" ADD CONSTRAINT "knowledge_assertions_axis_valid" CHECK ("knowledge_assertions"."axis" IN ('age', 'residence'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "knowledge_assertions" DROP CONSTRAINT IF EXISTS "knowledge_assertions_confidence_check";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "knowledge_assertions" ADD CONSTRAINT "knowledge_assertions_confidence_valid" CHECK ("knowledge_assertions"."confidence" >= 0 AND "knowledge_assertions"."confidence" <= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "subscription_payers"  DROP CONSTRAINT IF EXISTS "subscription_payers_role_check";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "subscription_payers" ADD CONSTRAINT "subscription_payers_role_valid" CHECK ("subscription_payers"."role" IN ('primary', 'secondary'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ===========================================================================
-- Cat-4: person.has_own_account default
-- ===========================================================================
ALTER TABLE "person" ALTER COLUMN "has_own_account" SET DEFAULT false;
