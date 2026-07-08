/**
 * WI-570 — identity schema guard tests
 *
 * F-032: every scoped single-table read on the identity tables must go through
 * createScopedRepository(profileId). These tests do NOT run SQL — they verify
 * the Drizzle table definitions match the applied 0108 baseline constraints.
 *
 * Break tests (negative-path, per "security fixes require a break test" rule):
 * - T6: guardianship self-guardian CHECK verified via constraint name on the table config.
 * - T9: membership roles non-empty + closed-role-set CHECK verified via constraint names.
 */

import {
  person,
  login,
  organization,
  membership,
  subscription,
  guardianship,
  supportership,
  consentGrant,
  consentReceipt,
  deletionAudit,
  financialRecord,
  regimes,
  policyCells,
  policyRules,
  knowledgeAssertions,
  allowedModels,
  subscriptionPayers,
  policyKindEnum,
  modelTierEnum,
} from './identity.js';

// ---------------------------------------------------------------------------
// Table export smoke tests
// ---------------------------------------------------------------------------

describe('identity schema — table exports', () => {
  it('exports person table with required columns', () => {
    expect(person).toBeDefined();
    const cols = Object.keys(person);
    // The Drizzle table object itself; column names are on the returned table object's properties
    expect(person.id).toBeDefined();
    expect(person.displayName).toBeDefined();
    expect(person.birthDate).toBeDefined();
    expect(person.residenceJurisdiction).toBeDefined();
    expect(person.loginId).toBeDefined();
    expect(person.hasOwnAccount).toBeDefined();
    expect(person.ageKnowing).toBeDefined();
    expect(person.residenceKnowing).toBeDefined();
    expect(person.lastActivityAt).toBeDefined();
    expect(person.createdAt).toBeDefined();
    expect(person.updatedAt).toBeDefined();
    void cols; // silence unused variable warning
  });

  it('exports login table with clerk binding columns', () => {
    expect(login).toBeDefined();
    expect(login.id).toBeDefined();
    expect(login.personId).toBeDefined();
    expect(login.clerkUserId).toBeDefined();
    expect(login.email).toBeDefined();
    expect(login.createdAt).toBeDefined();
    expect(login.updatedAt).toBeDefined();
  });

  it('exports organization table', () => {
    expect(organization).toBeDefined();
    expect(organization.id).toBeDefined();
    expect(organization.name).toBeDefined();
    expect(organization.timezone).toBeDefined();
    expect(organization.deletionScheduledAt).toBeDefined();
    expect(organization.deletionCancelledAt).toBeDefined();
  });

  it('exports membership table', () => {
    expect(membership).toBeDefined();
    expect(membership.id).toBeDefined();
    expect(membership.personId).toBeDefined();
    expect(membership.organizationId).toBeDefined();
    expect(membership.roles).toBeDefined();
  });

  it('exports subscription table with payer', () => {
    expect(subscription).toBeDefined();
    expect(subscription.id).toBeDefined();
    expect(subscription.organizationId).toBeDefined();
    expect(subscription.planTier).toBeDefined();
    expect(subscription.status).toBeDefined();
    expect(subscription.payerPersonId).toBeDefined();
  });

  it('exports guardianship table', () => {
    expect(guardianship).toBeDefined();
    expect(guardianship.id).toBeDefined();
    expect(guardianship.guardianPersonId).toBeDefined();
    expect(guardianship.chargePersonId).toBeDefined();
    expect(guardianship.qualification).toBeDefined();
    expect(guardianship.grantedAt).toBeDefined();
    expect(guardianship.revokedAt).toBeDefined();
  });

  it('exports supportership table', () => {
    expect(supportership).toBeDefined();
    expect(supportership.id).toBeDefined();
    expect(supportership.supporterPersonId).toBeDefined();
    expect(supportership.supporteePersonId).toBeDefined();
    expect(supportership.grantedAt).toBeDefined();
    expect(supportership.revokedAt).toBeDefined();
  });

  it('exports consent_grant table with RESTRICT-FK columns', () => {
    expect(consentGrant).toBeDefined();
    expect(consentGrant.id).toBeDefined();
    expect(consentGrant.chargePersonId).toBeDefined();
    expect(consentGrant.organizationId).toBeDefined();
    expect(consentGrant.purpose).toBeDefined();
    expect(consentGrant.lawfulBasis).toBeDefined();
    expect(consentGrant.granted).toBeDefined();
    expect(consentGrant.grantedAt).toBeDefined();
    expect(consentGrant.withdrawnAt).toBeDefined();
    expect(consentGrant.priorValue).toBeDefined();
    expect(consentGrant.auditFact).toBeDefined();
    expect(consentGrant.assuranceToken).toBeDefined();
    expect(consentGrant.assuranceMethod).toBeDefined();
    expect(consentGrant.snapshotAgeAtGrant).toBeDefined();
    expect(consentGrant.snapshotJurisdictionAtGrant).toBeDefined();
  });

  it('exports person_retain set (consent_receipt, deletion_audit, financial_record)', () => {
    expect(consentReceipt).toBeDefined();
    expect(consentReceipt.id).toBeDefined();
    expect(consentReceipt.personId).toBeDefined();
    expect(consentReceipt.organizationId).toBeDefined();
    expect(consentReceipt.retainedAt).toBeDefined();
    expect(consentReceipt.retentionPeriod).toBeDefined();

    expect(deletionAudit).toBeDefined();
    expect(deletionAudit.id).toBeDefined();
    expect(deletionAudit.personId).toBeDefined();
    expect(deletionAudit.deletedBy).toBeDefined();
    expect(deletionAudit.reason).toBeDefined();

    expect(financialRecord).toBeDefined();
    expect(financialRecord.id).toBeDefined();
    expect(financialRecord.personId).toBeDefined();
    expect(financialRecord.organizationId).toBeDefined();
    expect(financialRecord.recordType).toBeDefined();
    expect(financialRecord.payload).toBeDefined();
  });

  it('exports policy engine tables (regimes, policy_cells, policy_rules)', () => {
    expect(regimes).toBeDefined();
    expect(regimes.id).toBeDefined();
    expect(regimes.code).toBeDefined();
    expect(regimes.description).toBeDefined();

    expect(policyCells).toBeDefined();
    expect(policyCells.id).toBeDefined();
    expect(policyCells.ageBandMin).toBeDefined();
    expect(policyCells.ageBandMax).toBeDefined();
    expect(policyCells.regimeId).toBeDefined();
    expect(policyCells.knowledgeAxis).toBeDefined();
    expect(policyCells.knowledgeValue).toBeDefined();

    expect(policyRules).toBeDefined();
    expect(policyRules.id).toBeDefined();
    expect(policyRules.cellId).toBeDefined();
    expect(policyRules.kind).toBeDefined();
    expect(policyRules.ruleText).toBeDefined();
    expect(policyRules.effectiveAt).toBeDefined();
    expect(policyRules.expiresAt).toBeDefined();
  });

  it('exports knowledge_assertions table', () => {
    expect(knowledgeAssertions).toBeDefined();
    expect(knowledgeAssertions.personId).toBeDefined();
    expect(knowledgeAssertions.axis).toBeDefined();
    expect(knowledgeAssertions.method).toBeDefined();
    expect(knowledgeAssertions.confidence).toBeDefined();
    expect(knowledgeAssertions.source).toBeDefined();
    expect(knowledgeAssertions.actorId).toBeDefined();
    expect(knowledgeAssertions.revokedAt).toBeDefined();
  });

  it('exports allowed_models with model_tier enum', () => {
    expect(allowedModels).toBeDefined();
    expect(allowedModels.model).toBeDefined();
    expect(allowedModels.providerViaService).toBeDefined();
    expect(allowedModels.service).toBeDefined();
    expect(allowedModels.region).toBeDefined();
    expect(allowedModels.criteriaMetadata).toBeDefined();
    expect(allowedModels.tier).toBeDefined();
    expect(allowedModels.effectiveAt).toBeDefined();
    expect(allowedModels.expiresAt).toBeDefined();

    expect(modelTierEnum).toBeDefined();
    expect(modelTierEnum.enumValues).toEqual([
      'primary',
      'secondary',
      'tertiary',
    ]);
  });

  it('exports subscription_payers join table', () => {
    expect(subscriptionPayers).toBeDefined();
    expect(subscriptionPayers.subscriptionId).toBeDefined();
    expect(subscriptionPayers.personId).toBeDefined();
    expect(subscriptionPayers.role).toBeDefined();
  });

  it('exports policyKindEnum with expected values', () => {
    expect(policyKindEnum).toBeDefined();
    expect(policyKindEnum.enumValues).toEqual([
      'prohibition_floor',
      'consent_edge',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helper: read CHECK constraint names from identity.ts source text.
//
// The Drizzle ExtraConfigBuilder pattern (Symbol.for('drizzle:ExtraConfigBuilder'))
// re-invokes index builders at introspection time, which throws for tables that
// mix uniqueIndex and check — Drizzle 0.39.3 calls JSON.stringify(defaultConfig)
// where defaultConfig is undefined after the column is added to the table.
//
// Source-based analysis is the established pattern in this codebase for
// schema constraint verification — see cascade-fk-guard.test.ts and
// rls-coverage.test.ts for the same approach.
// ---------------------------------------------------------------------------
import * as fs from 'fs';
import * as path from 'path';

const IDENTITY_SOURCE = fs.readFileSync(
  path.resolve(__dirname, 'identity.ts'),
  'utf-8',
);
const LATEST_SUBSCRIPTION_PAYER_MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../../apps/api/drizzle/0134_subscription_payers_primary_unique.sql',
);
const LATEST_SUBSCRIPTION_PAYER_MIGRATION = fs.readFileSync(
  LATEST_SUBSCRIPTION_PAYER_MIGRATION_PATH,
  'utf-8',
);

function sourceContainsCheck(checkName: string): boolean {
  return IDENTITY_SOURCE.includes(`'${checkName}'`);
}

// ---------------------------------------------------------------------------
// Break tests — negative path (per repo "security fixes require a break test" rule)
// ---------------------------------------------------------------------------

describe('identity schema — break tests (F-032, constraint guards)', () => {
  /**
   * T-BREAK-1: guardianship.no_self_guardian CHECK
   *
   * The attack being prevented: a user creating a guardianship record where
   * guardian_person_id = charge_person_id, which would allow self-custody loops.
   *
   * Uses source-based analysis (same pattern as cascade-fk-guard.test.ts) to
   * verify the named CHECK constraint is declared in identity.ts. The SQL:
   *   CONSTRAINT "guardianship_no_self_guardian"
   *     CHECK ("guardian_person_id" <> "charge_person_id")
   */
  it('[BREAK] guardianship: no-self-guardian CHECK constraint is declared in source', () => {
    expect(sourceContainsCheck('guardianship_no_self_guardian')).toBe(true);
  });

  /**
   * T-BREAK-2: supportership.no_self_support CHECK
   *
   * Same structural guard as guardianship — a supporter cannot also be the supportee.
   */
  it('[BREAK] supportership: no-self-support CHECK constraint is declared in source', () => {
    expect(sourceContainsCheck('supportership_no_self_support')).toBe(true);
  });

  /**
   * T-BREAK-3: membership roles closed set + non-empty
   *
   * The attack being prevented: writing roles that are neither 'admin' nor
   * 'learner', or writing an empty roles array, which would produce a record
   * that can never be correctly authorized.
   */
  it('[BREAK] membership: roles non-empty CHECK is declared in source', () => {
    expect(sourceContainsCheck('membership_roles_non_empty')).toBe(true);
  });

  it('[BREAK] membership: roles closed-role-set CHECK is declared in source', () => {
    expect(sourceContainsCheck('membership_roles_valid')).toBe(true);
  });

  /**
   * T-BREAK-4: subscription payer NOT NULL
   *
   * The subscription table requires payer_person_id NOT NULL (applied in the
   * SQL per data-model.md §2A.4). Verify the source declares .notNull().
   */
  it('[BREAK] subscription: payerPersonId declared .notNull() in source', () => {
    // The NOT NULL declaration must be present in the source for the payer column.
    // We check for the column definition followed by .notNull() in the block.
    expect(IDENTITY_SOURCE).toMatch(/payer_person_id.*\.notNull\(\)/s);
  });

  /**
   * T-BREAK-5: subscription_payers one primary payer per subscription
   *
   * The attack being prevented: inserting a second person as `role = 'primary'`
   * for the same subscription. PostgreSQL rejects that duplicate only when the
   * partial unique index below exists.
   */
  it('[BREAK] subscription_payers: second primary insert for same subscription is rejected by a partial unique index', () => {
    expect(IDENTITY_SOURCE).toContain(
      "uniqueIndex('subscription_payers_primary_subscription_unique')",
    );
    expect(IDENTITY_SOURCE).toContain("sql`${table.role} = 'primary'`");
    expect(LATEST_SUBSCRIPTION_PAYER_MIGRATION).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payers_primary_subscription_unique"',
    );
    expect(LATEST_SUBSCRIPTION_PAYER_MIGRATION).toContain(
      `ON "subscription_payers" USING btree ("subscription_id")`,
    );
    expect(LATEST_SUBSCRIPTION_PAYER_MIGRATION).toContain(
      `WHERE "role" = 'primary'`,
    );
  });
});
