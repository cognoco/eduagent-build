import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  check,
  unique,
} from 'drizzle-orm/pg-core';

import { generateUUIDv7 } from '../utils/uuid';
import { organizations, profiles, membershipRoleEnum } from './profiles';

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    invitedRoles: membershipRoleEnum('invited_roles').array().notNull(),
    targetProfileId: uuid('target_profile_id').references(() => profiles.id, {
      onDelete: 'cascade',
    }),
    tokenHash: text('token_hash').notNull(),
    emailHint: text('email_hint'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByProfileId: uuid('accepted_by_profile_id').references(
      () => profiles.id,
      { onDelete: 'set null' },
    ),
  },
  (table) => [
    unique('organization_invitations_token_hash_unique').on(table.tokenHash),
    check(
      'organization_invitations_kind_check',
      sql`${table.kind} IN ('invite', 'claim')`,
    ),
    check(
      'organization_invitations_status_check',
      sql`${table.status} IN ('pending', 'accepted', 'revoked', 'expired')`,
    ),
    check(
      'organization_invitations_roles_non_empty',
      sql`cardinality(${table.invitedRoles}) >= 1`,
    ),
  ],
);

export type OrganizationInvitation =
  typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation =
  typeof organizationInvitations.$inferInsert;
