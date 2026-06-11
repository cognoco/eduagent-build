-- ============================================================================
-- Baseline — Identity Foundation (2026-06-10)
-- Per: docs/canon/identity/data-model.md §1–§2A + MMT-ADR-0012
--
-- This is the ONE-TIME baseline reset.  Migrations 0000–0105 are the
-- pre-baseline history.  Migrations 0106 (identity_t1_org_membership) and
-- 0107 (gorgeous_cardiac) are REFERENCE ONLY — committed for archaeology;
-- never applied; removed from the effective chain.
--
-- From 0108 forward, append-only migrations are absolute. No future squash.
-- See docs/adr/MMT-ADR-0012-one-time-baseline-reset.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Custom ENUMs / composite types
-- ----------------------------------------------------------------------------

CREATE TYPE "public"."policy_kind" AS ENUM(
  'prohibition_floor',
  'consent_edge'
);--> statement-breakpoint

CREATE TYPE "public"."model_tier" AS ENUM(
  'primary',
  'secondary',
  'tertiary'
);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 1. person  (replaces profiles)
-- The human. Learning-data scope key.
-- MMT-ADR-0007: Person ≠ Login.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."person" (
  "id"                       uuid         PRIMARY KEY NOT NULL,
  "display_name"             text         NOT NULL,
  "birth_date"               date         NOT NULL,
  "residence_jurisdiction"   text         NOT NULL,
  "login_id"                 uuid,
  "has_own_account"          boolean      NOT NULL DEFAULT false,
  "age_knowing"              jsonb,
  "residence_knowing"        jsonb,
  "last_activity_at"         timestamptz  NOT NULL DEFAULT now(),
  "created_at"               timestamptz  NOT NULL DEFAULT now(),
  "updated_at"               timestamptz  NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX "person_birth_date_idx"            ON "public"."person" ("birth_date");--> statement-breakpoint
CREATE INDEX "person_residence_jurisdiction_idx" ON "public"."person" ("residence_jurisdiction");--> statement-breakpoint
CREATE INDEX "person_last_activity_at_idx"      ON "public"."person" ("last_activity_at");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. login  (new — splits Clerk binding from person)
-- Thin binding between a Person and their Clerk credential.
-- MMT-ADR-0001: Clerk owns auth, we own everything else.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."login" (
  "id"             uuid   PRIMARY KEY NOT NULL,
  "person_id"      uuid   NOT NULL,
  "clerk_user_id"  text   NOT NULL,
  "email"          text   NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "login_clerk_user_id_unique" UNIQUE ("clerk_user_id"),
  CONSTRAINT "login_email_unique"         UNIQUE ("email")
);--> statement-breakpoint

CREATE INDEX "login_person_id_idx" ON "public"."login" ("person_id");--> statement-breakpoint

ALTER TABLE "public"."login"
  ADD CONSTRAINT "login_person_id_person_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."person" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint

-- Wire person.login_id FK back to login (after login table exists)
ALTER TABLE "public"."person"
  ADD CONSTRAINT "person_login_id_login_id_fk"
  FOREIGN KEY ("login_id") REFERENCES "public"."login" ("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. organization  (replaces accounts container role)
-- The thin container: billing + consent + quota anchor.
-- MMT-ADR-0010: v1 single home org.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."organization" (
  "id"                       uuid   PRIMARY KEY NOT NULL,
  "name"                     text   NOT NULL,
  "timezone"                 text,
  "deletion_scheduled_at"    timestamptz,
  "deletion_cancelled_at"    timestamptz,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. membership  (replaces inert memberships table)
-- Person ↔ Org link with role set.
-- MMT-ADR-0007: roles {admin, learner}; inv 22 three-layer authority.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."membership" (
  "id"               uuid   PRIMARY KEY NOT NULL,
  "person_id"        uuid   NOT NULL,
  "organization_id"  uuid   NOT NULL,
  "roles"            text[] NOT NULL,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "membership_person_org_unique" UNIQUE ("person_id", "organization_id"),
  CONSTRAINT "membership_roles_non_empty"   CHECK (cardinality("membership"."roles") >= 1),
  CONSTRAINT "membership_roles_valid"       CHECK ("roles" <@ ARRAY['admin', 'learner']::text[])
);--> statement-breakpoint

CREATE INDEX "membership_organization_id_idx" ON "public"."membership" ("organization_id");--> statement-breakpoint

ALTER TABLE "public"."membership"
  ADD CONSTRAINT "membership_person_id_person_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."person" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."membership"
  ADD CONSTRAINT "membership_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. subscription  (re-anchored to organization)
-- Billing row, anchored to the org. MMT-ADR-0002 store-delegation.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."subscription" (
  "id"               uuid   PRIMARY KEY NOT NULL,
  "organization_id"  uuid   NOT NULL,
  "plan_tier"        text   NOT NULL,
  "status"           text   NOT NULL,
  "payer_person_id"  uuid   NOT NULL,
  "store_product_id" text,
  "store_platform"   text,
  "period_start_at"  timestamptz,
  "period_end_at"    timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX "subscription_organization_id_idx" ON "public"."subscription" ("organization_id");--> statement-breakpoint

ALTER TABLE "public"."subscription"
  ADD CONSTRAINT "subscription_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."subscription"
  ADD CONSTRAINT "subscription_payer_person_id_person_id_fk"
  FOREIGN KEY ("payer_person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. guardianship  (replaces family_links)
-- Global edge: consent authority + consent record.
-- MMT-ADR-0008: inv 14 / inv 19 never auto-conferred; opt-in.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."guardianship" (
  "id"                  uuid   PRIMARY KEY NOT NULL,
  "guardian_person_id"  uuid   NOT NULL,
  "charge_person_id"    uuid   NOT NULL,
  "qualification"       text NOT NULL DEFAULT 'biological_parent'
                          CHECK ("qualification" IN ('biological_parent','adoptive_parent',
                            'stepparent','grandparent','court_appointed_guardian',
                            'foster_parent','kinship_caregiver','sibling_with_custody','other')),
  "granted_at"          timestamptz NOT NULL DEFAULT now(),
  "revoked_at"          timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "guardianship_no_self_guardian"
    CHECK ("guardian_person_id" <> "charge_person_id")
);--> statement-breakpoint

-- Partial unique: only one active guardianship per (guardian, charge) pair.
-- Re-granting after revoke is a new row (preserves history).
CREATE UNIQUE INDEX "guardianship_active_unique_idx"
  ON "public"."guardianship" ("guardian_person_id", "charge_person_id")
  WHERE "revoked_at" IS NULL;--> statement-breakpoint

CREATE INDEX "guardianship_charge_person_id_idx"    ON "public"."guardianship" ("charge_person_id");--> statement-breakpoint
CREATE INDEX "guardianship_guardian_person_id_idx"  ON "public"."guardianship" ("guardian_person_id");--> statement-breakpoint

ALTER TABLE "public"."guardianship"
  ADD CONSTRAINT "guardianship_guardian_person_id_person_id_fk"
  FOREIGN KEY ("guardian_person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."guardianship"
  ADD CONSTRAINT "guardianship_charge_person_id_person_id_fk"
  FOREIGN KEY ("charge_person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 7. supportership  (replaces the legacy mentor role value)
-- Opt-in supporter grant. inv 19: never auto-conferred.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."supportership" (
  "id"                   uuid  PRIMARY KEY NOT NULL,
  "supporter_person_id"  uuid  NOT NULL,
  "supportee_person_id"  uuid  NOT NULL,
  "granted_at"           timestamptz NOT NULL DEFAULT now(),
  "revoked_at"           timestamptz,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "supportership_no_self_support"
    CHECK ("supporter_person_id" <> "supportee_person_id")
);--> statement-breakpoint

CREATE UNIQUE INDEX "supportership_active_unique_idx"
  ON "public"."supportership" ("supporter_person_id", "supportee_person_id")
  WHERE "revoked_at" IS NULL;--> statement-breakpoint

CREATE INDEX "supportership_supportee_person_id_idx"  ON "public"."supportership" ("supportee_person_id");--> statement-breakpoint
CREATE INDEX "supportership_supporter_person_id_idx"  ON "public"."supportership" ("supporter_person_id");--> statement-breakpoint

ALTER TABLE "public"."supportership"
  ADD CONSTRAINT "supportership_supporter_person_id_person_id_fk"
  FOREIGN KEY ("supporter_person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."supportership"
  ADD CONSTRAINT "supportership_supportee_person_id_person_id_fk"
  FOREIGN KEY ("supportee_person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 8. consent_grant  (replaces consent_states)
-- Append-only per-purpose consent event log.
-- inv 12/27: append-only; per-purpose; separate LLM-disclosure consent.
-- charge_person_id ON DELETE RESTRICT: active grants must be re-homed first.
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."consent_grant" (
  "id"                uuid  PRIMARY KEY NOT NULL,
  "charge_person_id"  uuid  NOT NULL,
  "organization_id"   uuid  NOT NULL,
  "purpose"           text  NOT NULL,
  "lawful_basis"      text  NOT NULL,
  "granted"           boolean NOT NULL,
  "granted_at"        timestamptz NOT NULL DEFAULT now(),
  "withdrawn_at"      timestamptz,
  "prior_value"       boolean,
  "audit_fact"        jsonb,
  "assurance_token"   text,
  "assurance_method"  text,
  "snapshot_age_at_grant"          smallint,
  "snapshot_jurisdiction_at_grant" text,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Resolution hot path: (charge × purpose × org), ordered by granted_at DESC.
CREATE INDEX "consent_grant_charge_purpose_org_idx"
  ON "public"."consent_grant" ("charge_person_id", "purpose", "organization_id");--> statement-breakpoint
CREATE INDEX "consent_grant_granted_at_idx"
  ON "public"."consent_grant" ("granted_at");--> statement-breakpoint
CREATE INDEX "consent_grant_withdrawn_at_idx"
  ON "public"."consent_grant" ("withdrawn_at")
  WHERE "withdrawn_at" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "public"."consent_grant"
  ADD CONSTRAINT "consent_grant_charge_person_id_person_id_fk"
  FOREIGN KEY ("charge_person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."consent_grant"
  ADD CONSTRAINT "consent_grant_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- person_retain set (3 tables)
-- Outlives the person. Read access is role-gated, not RLS-default.
-- data-model.md §4.9
-- ----------------------------------------------------------------------------

CREATE TABLE "public"."consent_receipt" (
  "id"              uuid  PRIMARY KEY NOT NULL,
  "person_id"       uuid  NOT NULL,
  "organization_id" uuid  NOT NULL,
  "purpose"         text  NOT NULL,
  "lawful_basis"    text  NOT NULL,
  "granted"         boolean NOT NULL,
  "granted_at"      timestamptz NOT NULL,
  "withdrawn_at"    timestamptz,
  "prior_value"     boolean,
  "audit_fact"      jsonb,
  "retained_at"     timestamptz NOT NULL DEFAULT now(),
  "retention_period" text
);--> statement-breakpoint

CREATE INDEX "consent_receipt_person_id_idx"       ON "public"."consent_receipt" ("person_id");--> statement-breakpoint
CREATE INDEX "consent_receipt_organization_id_idx" ON "public"."consent_receipt" ("organization_id");--> statement-breakpoint

CREATE TABLE "public"."deletion_audit" (
  "id"           uuid   PRIMARY KEY NOT NULL,
  "person_id"    uuid   NOT NULL,
  "deleted_by"   uuid,
  "reason"       text   NOT NULL,
  "retained_at"  timestamptz NOT NULL DEFAULT now(),
  "retention_period" text
);--> statement-breakpoint

CREATE INDEX "deletion_audit_person_id_idx" ON "public"."deletion_audit" ("person_id");--> statement-breakpoint

CREATE TABLE "public"."financial_record" (
  "id"              uuid   PRIMARY KEY NOT NULL,
  "person_id"       uuid   NOT NULL,
  "organization_id" uuid   NOT NULL,
  "record_type"     text   NOT NULL,
  "payload"         jsonb  NOT NULL,
  "retained_at"     timestamptz NOT NULL DEFAULT now(),
  "retention_period" text
);--> statement-breakpoint

CREATE INDEX "financial_record_person_id_idx"       ON "public"."financial_record" ("person_id");--> statement-breakpoint
CREATE INDEX "financial_record_organization_id_idx" ON "public"."financial_record" ("organization_id");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Pre-baseline amendment tables (data-model.md §2A)
-- MMT-ADR-0013 (policy engine), MMT-ADR-0014 (router), MMT-ADR-0015 (amendments)
-- ----------------------------------------------------------------------------

-- 2A.1 Policy engine — regimes, policy_cells, policy_rules

CREATE TABLE "public"."regimes" (
  "id"           uuid   PRIMARY KEY NOT NULL,
  "code"         text   NOT NULL,
  "description"  text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "regimes_code_unique" UNIQUE ("code")
);--> statement-breakpoint

-- v1 regime seed snapshot (DB-mastered thereafter):
-- US_COPPA, EU_GDPR_16, EU_GDPR_15, EU_GDPR_14, EU_GDPR_13, UK_AADC, ROW

CREATE TABLE "public"."policy_cells" (
  "id"               uuid     PRIMARY KEY NOT NULL,
  "age_band_min"     smallint NOT NULL,
  "age_band_max"     smallint NOT NULL,
  "regime_id"        uuid     NOT NULL,
  "knowledge_axis"   text     NOT NULL CHECK ("knowledge_axis" IN ('age', 'residence')),
  "knowledge_value"  jsonb    NOT NULL,
  CONSTRAINT "policy_cells_unique"
    UNIQUE ("age_band_min", "age_band_max", "regime_id", "knowledge_axis", "knowledge_value"),
  CONSTRAINT "policy_cells_age_band_valid"
    CHECK ("age_band_min" >= 0 AND "age_band_min" <= "age_band_max")
);--> statement-breakpoint

ALTER TABLE "public"."policy_cells"
  ADD CONSTRAINT "policy_cells_regime_id_regimes_id_fk"
  FOREIGN KEY ("regime_id") REFERENCES "public"."regimes" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint

CREATE TABLE "public"."policy_rules" (
  "id"                 uuid                   PRIMARY KEY NOT NULL,
  "cell_id"            uuid                   NOT NULL,
  "kind"               "public"."policy_kind" NOT NULL,
  "rule_text"          text                   NOT NULL,
  "citation_url"       text,
  "source_instrument"  text,
  "effective_at"       timestamptz NOT NULL,
  "expires_at"         timestamptz,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "policy_rules_unique"
    UNIQUE ("cell_id", "kind", "source_instrument", "effective_at")
);--> statement-breakpoint

CREATE INDEX "idx_policy_rules_cell_kind" ON "public"."policy_rules" ("cell_id", "kind");--> statement-breakpoint

ALTER TABLE "public"."policy_rules"
  ADD CONSTRAINT "policy_rules_cell_id_policy_cells_id_fk"
  FOREIGN KEY ("cell_id") REFERENCES "public"."policy_cells" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint

-- 2A.2 Knowledge axes — knowledge_assertions + person cache columns

CREATE TABLE "public"."knowledge_assertions" (
  "id"           uuid    PRIMARY KEY NOT NULL,
  "person_id"    uuid    NOT NULL,
  "axis"         text    NOT NULL CHECK ("axis" IN ('age', 'residence')),
  "method"       text    NOT NULL,
  "confidence"   decimal(3,2) NOT NULL CHECK ("confidence" >= 0 AND "confidence" <= 1),
  "source"       text    NOT NULL,
  "asserted_at"  timestamptz NOT NULL DEFAULT now(),
  "actor_id"     uuid,
  "revoked_at"   timestamptz
);--> statement-breakpoint

CREATE INDEX "idx_knowledge_assertions_person_axis"
  ON "public"."knowledge_assertions" ("person_id", "axis", "asserted_at" DESC);--> statement-breakpoint

ALTER TABLE "public"."knowledge_assertions"
  ADD CONSTRAINT "knowledge_assertions_person_id_person_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."person" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."knowledge_assertions"
  ADD CONSTRAINT "knowledge_assertions_actor_id_person_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."person" ("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

-- 2A.3 Router — allowed_models (vetting-pipeline output)

CREATE TABLE "public"."allowed_models" (
  "id"                    uuid                  PRIMARY KEY NOT NULL,
  "model"                 text                  NOT NULL,
  "provider_via_service"  text                  NOT NULL,
  "service"               text                  NOT NULL,
  "region"                text                  NOT NULL,
  "criteria_metadata"     jsonb                 NOT NULL,
  "tier"                  "public"."model_tier" NOT NULL DEFAULT 'primary',
  "effective_at"          timestamptz           NOT NULL DEFAULT now(),
  "expires_at"            timestamptz,
  CONSTRAINT "allowed_models_unique"
    UNIQUE ("model", "provider_via_service", "service", "region", "effective_at")
);--> statement-breakpoint

CREATE INDEX "idx_allowed_models_runtime_key"
  ON "public"."allowed_models" ("model", "service", "region");--> statement-breakpoint

-- 2A.4 Capability split — subscription_payers

CREATE TABLE "public"."subscription_payers" (
  "subscription_id"  uuid   NOT NULL,
  "person_id"        uuid   NOT NULL,
  "role"             text   NOT NULL CHECK ("role" IN ('primary', 'secondary')),
  CONSTRAINT "subscription_payers_unique" UNIQUE ("subscription_id", "person_id")
);--> statement-breakpoint

ALTER TABLE "public"."subscription_payers"
  ADD CONSTRAINT "subscription_payers_subscription_id_subscription_id_fk"
  FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "public"."subscription_payers"
  ADD CONSTRAINT "subscription_payers_person_id_person_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."person" ("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;--> statement-breakpoint
