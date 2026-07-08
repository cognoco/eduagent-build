import {
  pgTable,
  uuid,
  timestamp,
  boolean,
  pgEnum,
  index,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { person } from './identity';

export const withdrawalArchivePreferenceEnum = pgEnum(
  'withdrawal_archive_preference',
  ['auto', 'always', 'never'],
);

// BUG-571: pending_notices.type — was text + CHECK constraint, migrated to
// pgEnum so the value set is enforced at the type system and adding a new
// notice type requires a coordinated schema + migration change (instead of
// failing silently at insert time with a generic CHECK violation). Keep the
// member list in lockstep with `pendingNoticeTypeSchema` in
// `@eduagent/schemas/progress.ts`.
export const pendingNoticeTypeEnum = pgEnum('pending_notice_type', [
  'consent_deleted',
  'consent_archived',
]);

// [WI-569] The T1 `organizations` / `memberships` tables (migration 0106,
// REFERENCE ONLY) were removed here as part of the MMT-ADR-0012 baseline
// reset. The replacement singular `organization` / `membership` tables are
// created by 0108_identity_foundation_baseline.sql; their Drizzle schema
// definitions land with the identity-foundation schema work (WI-570).

export const withdrawalArchivePreferences = pgTable(
  'withdrawal_archive_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' })
      .unique(),
    preference: withdrawalArchivePreferenceEnum('preference')
      .notNull()
      .default('auto'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('withdrawal_archive_preferences_owner_profile_id_idx').on(
      table.ownerProfileId,
    ),
  ],
);

export const familyPreferences = pgTable(
  'family_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' })
      .unique(),
    poolBreakdownShared: boolean('pool_breakdown_shared')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('family_preferences_owner_profile_id_idx').on(table.ownerProfileId),
  ],
);

export type FamilyPreferences = typeof familyPreferences.$inferSelect;
export type NewFamilyPreferences = typeof familyPreferences.$inferInsert;

export const pendingNotices = pgTable(
  'pending_notices',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    type: pendingNoticeTypeEnum('type').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('pending_notices_owner_type_payload_uq').on(
      table.ownerProfileId,
      table.type,
      table.payloadJson,
    ),
    index('pending_notices_owner_unseen_idx').on(
      table.ownerProfileId,
      table.seenAt,
    ),
  ],
);
