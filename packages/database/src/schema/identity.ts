/**
 * WI-570 — Identity foundation schema (8 tables + pre-baseline amendments)
 *
 * Physical realization of docs/canon/identity/data-model.md §1–§2A.
 * Matches 0108_identity_foundation_baseline.sql EXACTLY.
 *
 * Table list (dependency order):
 *   1. person           — the human; learning-data scope key (MMT-ADR-0007)
 *   2. login            — thin Clerk binding (MMT-ADR-0001)
 *   3. organization     — billing + consent + quota anchor (MMT-ADR-0010)
 *   4. membership       — person↔org link with role set (MMT-ADR-0007 inv 22)
 *   5. subscription     — billing row, org-anchored (MMT-ADR-0002)
 *   6. guardianship     — global consent-authority edge (MMT-ADR-0008)
 *   7. supportership    — opt-in data-access grant (inv 19)
 *   8. consent_grant    — append-only per-purpose consent log (inv 12/27)
 *   person_retain set:
 *   9. consent_receipt  — durable receipt (outlives the person)
 *  10. deletion_audit   — deletion record (outlives the person)
 *  11. financial_record — billing/tax record (outlives the person)
 *   Pre-baseline amendments (MMT-ADR-0013/0014/0015):
 *  12. regimes          — policy-engine regime lookup (data, not ENUM)
 *  13. policy_cells     — age-band × regime × knowledge-axis grid
 *  14. policy_rules     — per-cell rules
 *  15. knowledge_assertions — append-only known-age/known-residence history
 *  16. allowed_models   — vetting-pipeline output; router reads this
 *  17. subscription_payers — primary + ≤1 secondary payer join
 *
 * F-032: scoped single-table reads on these tables must use
 * createScopedRepository(profileId). This file declares the tables;
 * the enforcement pattern is in repository.ts.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  date,
  smallint,
  jsonb,
  decimal,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUUIDv7 } from '../utils/uuid';

// ---------------------------------------------------------------------------
// ENUMs
// ---------------------------------------------------------------------------

/** Policy rule kind — prohibition_floor = unconditional; consent_edge = consent-gated. */
export const policyKindEnum = pgEnum('policy_kind', [
  'prohibition_floor',
  'consent_edge',
]);

/** Router tier for allowed_models — vetting assigns each model a tier. */
export const modelTierEnum = pgEnum('model_tier', [
  'primary',
  'secondary',
  'tertiary',
]);

// ---------------------------------------------------------------------------
// 1. person  (replaces profiles)
// The human. Learning-data scope key.
// MMT-ADR-0007: Person ≠ Login.
// ---------------------------------------------------------------------------

export const person = pgTable(
  'person',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    displayName: text('display_name').notNull(),
    birthDate: date('birth_date').notNull(),
    residenceJurisdiction: text('residence_jurisdiction').notNull(),
    /**
     * Nullable FK to login — null = managed child (no Clerk credential yet).
     *
     * The FK constraint (person_login_id_login_id_fk, ON DELETE SET NULL) exists
     * at the DB layer — see 0108_identity_foundation_baseline.sql lines 77-81.
     * It is NOT declared here because login is defined after person, creating a
     * circular TS reference that causes TS7022/TS7024 (Drizzle circular-FK issue).
     * Since the repo uses migration-based deploys (not drizzle-kit push in prod),
     * the constraint is applied by the SQL migration and Drizzle drift checks will
     * not drop it. Future schema migrations should add `.references(() => login.id,
     * { onDelete: 'set null' })` if Drizzle resolves the circular-type issue.
     */
    loginId: uuid('login_id'),
    /** Birthday-crossing takeover branch — set when a managed child creates their own account. */
    hasOwnAccount: boolean('has_own_account').notNull().default(false),
    /** Cached current age-knowledge state — {method, confidence, last_updated}. */
    ageKnowing: jsonb('age_knowing'),
    /** Cached current residence-knowledge state — {method, confidence, last_updated}. */
    residenceKnowing: jsonb('residence_knowing'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('person_birth_date_idx').on(table.birthDate),
    index('person_residence_jurisdiction_idx').on(table.residenceJurisdiction),
    index('person_last_activity_at_idx').on(table.lastActivityAt),
  ],
);

// ---------------------------------------------------------------------------
// 2. login  (new — splits Clerk binding from person)
// Thin binding between a Person and their Clerk credential.
// MMT-ADR-0001: Clerk owns auth, we own everything else.
// ---------------------------------------------------------------------------

export const login = pgTable(
  'login',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('login_person_id_idx').on(table.personId)],
);

// Wire person.login_id FK back to login (after login is declared).
// Drizzle handles forward-ref FKs via the references(() => ...) pattern.
// We declare this on person here separately because person is declared first
// and login_id references login which must be declared after person.
// In practice, drizzle-kit reads all schema files and resolves FKs globally.
// The FK is declared directly on the column below for the Drizzle TS layer.
// NOTE: The SQL adds the FK in a separate ALTER TABLE statement. Drizzle
// generates the same SQL when the FK is expressed inline on the column.
// We re-declare person with the FK reference here for type-safety.
// (Drizzle supports this pattern — see data-model.md §3.1 circular refs note.)

// ---------------------------------------------------------------------------
// 3. organization  (replaces accounts container role)
// The thin container: billing + consent + quota anchor.
// MMT-ADR-0010: v1 single home org.
// ---------------------------------------------------------------------------

export const organization = pgTable('organization', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  name: text('name').notNull(),
  timezone: text('timezone'),
  deletionScheduledAt: timestamp('deletion_scheduled_at', {
    withTimezone: true,
  }),
  deletionCancelledAt: timestamp('deletion_cancelled_at', {
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// 4. membership  (replaces inert memberships table)
// Person ↔ Org link with role set.
// MMT-ADR-0007: roles {admin, learner}; inv 22 three-layer authority.
// ---------------------------------------------------------------------------

export const membership = pgTable(
  'membership',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    roles: text('roles').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('membership_person_org_unique').on(
      table.personId,
      table.organizationId,
    ),
    index('membership_organization_id_idx').on(table.organizationId),
    /**
     * [BREAK-TEST: membership_roles_non_empty]
     * Roles array must never be empty — a membership with no roles has no
     * defined authorization posture and cannot be correctly evaluated.
     */
    check('membership_roles_non_empty', sql`cardinality(${table.roles}) >= 1`),
    /**
     * [BREAK-TEST: membership_roles_valid]
     * Closed role set: only 'admin' and 'learner' are valid.
     * Any write outside this set is rejected at the storage layer.
     */
    check(
      'membership_roles_valid',
      sql`${table.roles} <@ ARRAY['admin', 'learner']::text[]`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 5. subscription  (re-anchored to organization)
// Billing row, anchored to the org. MMT-ADR-0002 store-delegation.
// payer_person_id is NOT NULL (the primary Payer — data-model.md §2A.4).
// ---------------------------------------------------------------------------

export const subscription = pgTable(
  'subscription',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    planTier: text('plan_tier').notNull(),
    status: text('status').notNull(),
    /**
     * Primary Payer (NOT NULL per data-model.md §2A.4).
     * RESTRICT: a person who is the primary payer cannot be deleted without
     * re-homing the subscription first.
     */
    payerPersonId: uuid('payer_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    storeProductId: text('store_product_id'),
    storePlatform: text('store_platform'),
    periodStartAt: timestamp('period_start_at', { withTimezone: true }),
    periodEndAt: timestamp('period_end_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('subscription_organization_id_idx').on(table.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// 6. guardianship  (replaces family_links)
// Global edge: consent authority + consent record.
// MMT-ADR-0008: inv 14 / inv 19 never auto-conferred; opt-in.
// ---------------------------------------------------------------------------

export const guardianship = pgTable(
  'guardianship',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    guardianPersonId: uuid('guardian_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    chargePersonId: uuid('charge_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    qualification: text('qualification').notNull().default('biological_parent'),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * [BREAK-TEST: guardianship_no_self_guardian]
     * The attack being prevented: a self-guardian record where
     * guardian_person_id = charge_person_id, creating a consent-authority
     * loop. REJECT at the storage layer.
     */
    check(
      'guardianship_no_self_guardian',
      sql`${table.guardianPersonId} <> ${table.chargePersonId}`,
    ),
    /**
     * Partial unique: one active guardianship per (guardian, charge) pair.
     * Re-granting after revoke is a new row (preserves history).
     * WHERE revoked_at IS NULL matches the SQL partial index.
     */
    uniqueIndex('guardianship_active_unique_idx')
      .on(table.guardianPersonId, table.chargePersonId)
      .where(sql`${table.revokedAt} IS NULL`),
    index('guardianship_charge_person_id_idx').on(table.chargePersonId),
    index('guardianship_guardian_person_id_idx').on(table.guardianPersonId),
    check(
      'guardianship_qualification_valid',
      sql`${table.qualification} IN ('biological_parent','adoptive_parent','stepparent','grandparent','court_appointed_guardian','foster_parent','kinship_caregiver','sibling_with_custody','other')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 7. supportership  (replaces the legacy mentor role value)
// Opt-in supporter grant. inv 19: never auto-conferred.
// ---------------------------------------------------------------------------

export const supportership = pgTable(
  'supportership',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    supporterPersonId: uuid('supporter_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    supporteePersonId: uuid('supportee_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * [BREAK-TEST: supportership_no_self_support]
     * Prevent a supporter from also being the supportee.
     */
    check(
      'supportership_no_self_support',
      sql`${table.supporterPersonId} <> ${table.supporteePersonId}`,
    ),
    uniqueIndex('supportership_active_unique_idx')
      .on(table.supporterPersonId, table.supporteePersonId)
      .where(sql`${table.revokedAt} IS NULL`),
    index('supportership_supportee_person_id_idx').on(table.supporteePersonId),
    index('supportership_supporter_person_id_idx').on(table.supporterPersonId),
  ],
);

// ---------------------------------------------------------------------------
// 8. consent_grant  (replaces consent_states)
// Append-only per-purpose consent event log.
// inv 12/27: append-only; per-purpose; separate LLM-disclosure consent.
// charge_person_id ON DELETE RESTRICT: active grants must be re-homed first.
// ---------------------------------------------------------------------------

export const consentGrant = pgTable(
  'consent_grant',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    /** RESTRICT: a person with active grants cannot be deleted without re-homing. */
    chargePersonId: uuid('charge_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    /** RESTRICT: an org with active grants cannot be deleted without re-homing. */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    purpose: text('purpose').notNull(),
    lawfulBasis: text('lawful_basis').notNull(),
    granted: boolean('granted').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    /** Direction-aware gate: the prior consent value before this record. */
    priorValue: boolean('prior_value'),
    /** The audit fact for direction-aware protection-lowering. */
    auditFact: jsonb('audit_fact'),
    /** VPC tokenised pass/fail — dropped at re-home time. */
    assuranceToken: text('assurance_token'),
    assuranceMethod: text('assurance_method'),
    snapshotAgeAtGrant: smallint('snapshot_age_at_grant'),
    snapshotJurisdictionAtGrant: text('snapshot_jurisdiction_at_grant'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** Resolution hot path: (charge × purpose × org), ordered by granted_at DESC. */
    index('consent_grant_charge_purpose_org_idx').on(
      table.chargePersonId,
      table.purpose,
      table.organizationId,
    ),
    index('consent_grant_granted_at_idx').on(table.grantedAt),
    index('consent_grant_withdrawn_at_idx')
      .on(table.withdrawnAt)
      .where(sql`${table.withdrawnAt} IS NOT NULL`),
  ],
);

// ---------------------------------------------------------------------------
// person_retain set (3 tables)
// Outlives the person. Read access is role-gated, not RLS-default.
// data-model.md §4.9
//
// NOTE: These tables intentionally do NOT carry FK references to person.id —
// they outlive the person row. Read access is role-gated (service role).
// ---------------------------------------------------------------------------

export const consentReceipt = pgTable(
  'consent_receipt',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    /** person_id NOT NULL but no FK — the receipt outlives the person. */
    personId: uuid('person_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    purpose: text('purpose').notNull(),
    lawfulBasis: text('lawful_basis').notNull(),
    granted: boolean('granted').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    priorValue: boolean('prior_value'),
    auditFact: jsonb('audit_fact'),
    retainedAt: timestamp('retained_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    retentionPeriod: text('retention_period'),
  },
  (table) => [
    index('consent_receipt_person_id_idx').on(table.personId),
    index('consent_receipt_organization_id_idx').on(table.organizationId),
  ],
);

export const deletionAudit = pgTable(
  'deletion_audit',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    /** person_id NOT NULL but no FK — the audit outlives the person. */
    personId: uuid('person_id').notNull(),
    /** The actor who initiated deletion (null = system/abandonment). */
    deletedBy: uuid('deleted_by'),
    reason: text('reason').notNull(),
    retainedAt: timestamp('retained_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    retentionPeriod: text('retention_period'),
  },
  (table) => [index('deletion_audit_person_id_idx').on(table.personId)],
);

export const financialRecord = pgTable(
  'financial_record',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    /** person_id NOT NULL but no FK — the record outlives the person. */
    personId: uuid('person_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    recordType: text('record_type').notNull(),
    payload: jsonb('payload').notNull(),
    retainedAt: timestamp('retained_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    retentionPeriod: text('retention_period'),
  },
  (table) => [
    index('financial_record_person_id_idx').on(table.personId),
    index('financial_record_organization_id_idx').on(table.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Pre-baseline amendments (data-model.md §2A)
// MMT-ADR-0013 (policy engine), MMT-ADR-0014 (router), MMT-ADR-0015 (amendments)
// ---------------------------------------------------------------------------

// 2A.1 Policy engine — regimes, policy_cells, policy_rules

/**
 * Regime = DATA (rows), not a Postgres ENUM.
 * Add/retire a regime = INSERT/UPDATE, not a migration.
 * v1 seed: US_COPPA, EU_GDPR_16, EU_GDPR_15, EU_GDPR_14, EU_GDPR_13, UK_AADC, ROW
 */
export const regimes = pgTable('regimes', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  code: text('code').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const policyCells = pgTable(
  'policy_cells',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ageBandMin: smallint('age_band_min').notNull(),
    ageBandMax: smallint('age_band_max').notNull(),
    regimeId: uuid('regime_id')
      .notNull()
      .references(() => regimes.id, { onDelete: 'restrict' }),
    knowledgeAxis: text('knowledge_axis').notNull(),
    knowledgeValue: jsonb('knowledge_value').notNull(),
  },
  (table) => [
    uniqueIndex('policy_cells_unique').on(
      table.ageBandMin,
      table.ageBandMax,
      table.regimeId,
      table.knowledgeAxis,
      table.knowledgeValue,
    ),
    check(
      'policy_cells_knowledge_axis_valid',
      sql`${table.knowledgeAxis} IN ('age', 'residence')`,
    ),
    check(
      'policy_cells_age_band_valid',
      sql`${table.ageBandMin} >= 0 AND ${table.ageBandMin} <= ${table.ageBandMax}`,
    ),
  ],
);

export const policyRules = pgTable(
  'policy_rules',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    cellId: uuid('cell_id')
      .notNull()
      .references(() => policyCells.id, { onDelete: 'cascade' }),
    kind: policyKindEnum('kind').notNull(),
    ruleText: text('rule_text').notNull(),
    citationUrl: text('citation_url'),
    sourceInstrument: text('source_instrument'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('policy_rules_unique').on(
      table.cellId,
      table.kind,
      table.sourceInstrument,
      table.effectiveAt,
    ),
    index('idx_policy_rules_cell_kind').on(table.cellId, table.kind),
  ],
);

// 2A.2 Knowledge axes — knowledge_assertions + person cache columns
// (The person cache columns age_knowing / residence_knowing are on person above.)

export const knowledgeAssertions = pgTable(
  'knowledge_assertions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    axis: text('axis').notNull(),
    method: text('method').notNull(),
    confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull(),
    source: text('source').notNull(),
    assertedAt: timestamp('asserted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actorId: uuid('actor_id').references(() => person.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_knowledge_assertions_person_axis').on(
      table.personId,
      table.axis,
      table.assertedAt,
    ),
    check(
      'knowledge_assertions_axis_valid',
      sql`${table.axis} IN ('age', 'residence')`,
    ),
    check(
      'knowledge_assertions_confidence_valid',
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
);

// 2A.3 Router — allowed_models (vetting-pipeline output)

export const allowedModels = pgTable(
  'allowed_models',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    model: text('model').notNull(),
    providerViaService: text('provider_via_service').notNull(),
    service: text('service').notNull(),
    region: text('region').notNull(),
    criteriaMetadata: jsonb('criteria_metadata').notNull(),
    tier: modelTierEnum('tier').notNull().default('primary'),
    effectiveAt: timestamp('effective_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('allowed_models_unique').on(
      table.model,
      table.providerViaService,
      table.service,
      table.region,
      table.effectiveAt,
    ),
    index('idx_allowed_models_runtime_key').on(
      table.model,
      table.service,
      table.region,
    ),
  ],
);

// 2A.4 Capability split — subscription_payers

/**
 * Primary + ≤1 secondary Payer join (Payer = sub-field, not persona).
 * v1: ≤1 secondary per subscription (enforced in service code);
 * secondary = read state + view invoices + update payment method ONLY.
 */
export const subscriptionPayers = pgTable(
  'subscription_payers',
  {
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
  },
  (table) => [
    uniqueIndex('subscription_payers_unique').on(
      table.subscriptionId,
      table.personId,
    ),
    check(
      'subscription_payers_role_valid',
      sql`${table.role} IN ('primary', 'secondary')`,
    ),
  ],
);
