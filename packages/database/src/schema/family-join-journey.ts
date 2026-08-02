import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { generateUUIDv7 } from '../utils/uuid';
import { guardianAuthorityRedemptions } from './guardian-authority-redemptions';
import { familyJoinInvite, organization, person } from './identity';
import { supportVisibilityContracts } from './visibility-contract';

/**
 * Durable, resumable workflow for an existing learner joining a family.
 *
 * The invite locates the journey but does not confer authority. The charge is
 * bound only after verified-email equality, and the current legal posture is
 * refreshed by the service before every state transition. Guardianship,
 * consent, membership, and visibility remain separate records.
 */
export const familyJoinJourney = pgTable(
  'family_join_journey',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    inviteId: uuid('invite_id')
      .notNull()
      .references(() => familyJoinInvite.id, { onDelete: 'cascade' }),
    chargePersonId: uuid('charge_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    familyOrgId: uuid('family_org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    policyVersion: text('policy_version').notNull(),
    authorizationForm: text('authorization_form').notNull(),
    learnerAssentedAt: timestamp('learner_assented_at', {
      withTimezone: true,
    }),
    learnerSupportershipPreference: text('learner_supportership_preference'),
    supportershipAuthority: text('supportership_authority').notNull(),
    supportershipDecision: text('supportership_decision'),
    guardianPersonId: uuid('guardian_person_id').references(() => person.id, {
      onDelete: 'set null',
    }),
    guardianAuthorityRedemptionId: uuid(
      'guardian_authority_redemption_id',
    ).references(() => guardianAuthorityRedemptions.id, {
      onDelete: 'set null',
    }),
    visibilityContractId: uuid('visibility_contract_id').references(
      () => supportVisibilityContracts.id,
      { onDelete: 'set null' },
    ),
    boundAt: timestamp('bound_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    guardianCompletedAt: timestamp('guardian_completed_at', {
      withTimezone: true,
    }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('family_join_journey_invite_unique').on(table.inviteId),
    uniqueIndex('family_join_journey_charge_active_unique')
      .on(table.chargePersonId)
      .where(sql`${table.state} IN ('awaiting_guardian','ready_to_join')`),
    index('family_join_journey_family_org_idx').on(table.familyOrgId),
    index('family_join_journey_guardian_idx')
      .on(table.guardianPersonId)
      .where(sql`${table.guardianPersonId} IS NOT NULL`),
    uniqueIndex('family_join_journey_guardian_redemption_unique')
      .on(table.guardianAuthorityRedemptionId)
      .where(sql`${table.guardianAuthorityRedemptionId} IS NOT NULL`),
    uniqueIndex('family_join_journey_visibility_contract_unique')
      .on(table.visibilityContractId)
      .where(sql`${table.visibilityContractId} IS NOT NULL`),
    check(
      'family_join_journey_state_valid',
      sql`${table.state} IN ('awaiting_guardian','ready_to_join','joined','declined','withdrawn')`,
    ),
    check(
      'family_join_journey_authorization_form_valid',
      sql`${table.authorizationForm} IS NULL OR ${table.authorizationForm} IN ('self','guardian','joint_child_guardian')`,
    ),
    check(
      'family_join_journey_learner_supportership_preference_valid',
      sql`${table.learnerSupportershipPreference} IS NULL OR ${table.learnerSupportershipPreference} IN ('accept','decline')`,
    ),
    check(
      'family_join_journey_supportership_authority_valid',
      sql`${table.supportershipAuthority} IS NULL OR ${table.supportershipAuthority} IN ('learner','guardian')`,
    ),
    check(
      'family_join_journey_supportership_decision_valid',
      sql`${table.supportershipDecision} IS NULL OR ${table.supportershipDecision} IN ('accept','decline')`,
    ),
    check(
      'family_join_journey_legal_posture_complete',
      sql`(${table.jurisdiction} IS NULL AND ${table.policyVersion} IS NULL AND ${table.authorizationForm} IS NULL) OR (${table.jurisdiction} IS NOT NULL AND ${table.policyVersion} IS NOT NULL AND ${table.authorizationForm} IS NOT NULL)`,
    ),
    check(
      'family_join_journey_decision_authority_complete',
      sql`${table.supportershipDecision} IS NULL OR ${table.supportershipAuthority} IS NOT NULL`,
    ),
    check(
      'family_join_journey_guardian_completion_complete',
      sql`${table.guardianCompletedAt} IS NULL OR ${table.state} = 'joined' OR (${table.guardianPersonId} IS NOT NULL AND ${table.guardianAuthorityRedemptionId} IS NOT NULL)`,
    ),
    check(
      'family_join_journey_posture_consistent',
      sql`(${table.state} = 'awaiting_guardian' AND ${table.learnerAssentedAt} IS NOT NULL AND ${table.learnerSupportershipPreference} IS NOT NULL AND ${table.authorizationForm} IN ('guardian','joint_child_guardian') AND ${table.supportershipAuthority} = 'guardian' AND ${table.supportershipDecision} IS NULL AND ${table.guardianCompletedAt} IS NULL) OR (${table.state} IN ('ready_to_join','joined') AND ${table.learnerAssentedAt} IS NOT NULL AND ${table.learnerSupportershipPreference} IS NOT NULL AND ${table.supportershipDecision} IS NOT NULL AND ((${table.supportershipAuthority} = 'learner' AND ${table.authorizationForm} = 'self') OR (${table.supportershipAuthority} = 'guardian' AND ${table.authorizationForm} IN ('guardian','joint_child_guardian') AND ${table.guardianCompletedAt} IS NOT NULL))) OR ${table.state} IN ('declined','withdrawn')`,
    ),
    check(
      'family_join_journey_terminal_timestamp_valid',
      sql`(${table.state} = 'joined') = (${table.joinedAt} IS NOT NULL) AND (${table.state} = 'declined') = (${table.declinedAt} IS NOT NULL) AND (${table.state} = 'withdrawn') = (${table.withdrawnAt} IS NOT NULL)`,
    ),
  ],
).enableRLS();

export type FamilyJoinJourney = typeof familyJoinJourney.$inferSelect;
export type NewFamilyJoinJourney = typeof familyJoinJourney.$inferInsert;
