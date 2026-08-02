import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUUIDv7 } from '../utils/uuid';
import { organization, person } from './identity';

/**
 * Durable, non-secret receipt for one guardian-verifier handle redemption.
 *
 * Raw provider handles and bearer tokens never enter storage. The unique
 * digests make the provider call single-winner locally, while the issued
 * assertion fields let an exact retry reconstruct the original token after a
 * response loss.
 */
export const guardianAuthorityRedemptions = pgTable(
  'guardian_authority_redemptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    verifierHandleDigest: text('verifier_handle_digest').notNull(),
    commandBindingDigest: text('command_binding_digest').notNull(),
    status: text('status').notNull().default('redeeming'),
    guardianPersonId: uuid('guardian_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    chargePersonId: uuid('charge_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    jurisdiction: text('jurisdiction').notNull(),
    policyVersion: text('policy_version').notNull(),
    authorizationForm: text('authorization_form').notNull(),
    purposeSetDigest: text('purpose_set_digest').notNull(),
    assuranceMethod: text('assurance_method'),
    evidenceId: text('evidence_id'),
    qualification: text('qualification'),
    learnerAssentAt: timestamp('learner_assent_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    notBefore: timestamp('not_before', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    authorityTokenDigest: text('authority_token_digest'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('guardian_authority_redemptions_handle_unique').on(
      table.verifierHandleDigest,
    ),
    uniqueIndex('guardian_authority_redemptions_evidence_unique')
      .on(table.evidenceId)
      .where(sql`${table.evidenceId} IS NOT NULL`),
    index('guardian_authority_redemptions_charge_idx').on(table.chargePersonId),
    index('guardian_authority_redemptions_expiry_idx').on(table.expiresAt),
    check(
      'guardian_authority_redemptions_handle_digest_valid',
      sql`${table.verifierHandleDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'guardian_authority_redemptions_binding_digest_valid',
      sql`${table.commandBindingDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'guardian_authority_redemptions_purpose_digest_valid',
      sql`${table.purposeSetDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'guardian_authority_redemptions_token_digest_valid',
      sql`${table.authorityTokenDigest} IS NULL OR ${table.authorityTokenDigest} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'guardian_authority_redemptions_status_valid',
      sql`${table.status} IN ('redeeming', 'issued', 'rejected')`,
    ),
    check(
      'guardian_authority_redemptions_authorization_form_valid',
      sql`${table.authorizationForm} IN ('guardian', 'joint_child_guardian')`,
    ),
    check(
      'guardian_authority_redemptions_issued_complete',
      sql`${table.status} <> 'issued' OR (${table.assuranceMethod} IS NOT NULL AND ${table.evidenceId} IS NOT NULL AND ${table.qualification} IS NOT NULL AND ${table.issuedAt} IS NOT NULL AND ${table.notBefore} IS NOT NULL AND ${table.expiresAt} IS NOT NULL AND ${table.authorityTokenDigest} IS NOT NULL)`,
    ),
    check(
      'guardian_authority_redemptions_unissued_has_no_token',
      sql`${table.status} = 'issued' OR ${table.authorityTokenDigest} IS NULL`,
    ),
    check(
      'guardian_authority_redemptions_window_valid',
      sql`${table.expiresAt} IS NULL OR (${table.notBefore} IS NOT NULL AND ${table.issuedAt} IS NOT NULL AND ${table.expiresAt} > ${table.notBefore} AND ${table.notBefore} >= ${table.issuedAt})`,
    ),
  ],
);
