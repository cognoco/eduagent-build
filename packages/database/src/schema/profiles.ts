import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  unique,
  index,
  check,
  foreignKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUUIDv7 } from '../utils/uuid';

export const locationTypeEnum = pgEnum('location_type', ['EU', 'US', 'OTHER']);
export const consentTypeEnum = pgEnum('consent_type', ['GDPR', 'COPPA']);
export const consentStatusEnum = pgEnum('consent_status', [
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
  'CONSENTED',
  'WITHDRAWN',
]);
export const withdrawalArchivePreferenceEnum = pgEnum(
  'withdrawal_archive_preference',
  ['auto', 'always', 'never']
);

export const accounts = pgTable('accounts', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  timezone: text('timezone'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletionScheduledAt: timestamp('deletion_scheduled_at', {
    withTimezone: true,
  }),
  deletionCancelledAt: timestamp('deletion_cancelled_at', {
    withTimezone: true,
  }),
});

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    birthYear: integer('birth_year').notNull(),
    birthYearSetBy: uuid('birth_year_set_by'),
    location: locationTypeEnum('location'),
    isOwner: boolean('is_owner').notNull().default(false),
    hasPremiumLlm: boolean('has_premium_llm').notNull().default(false),
    // BKT-C.1 — tutor's speaking language. NOT NULL default 'en' so existing
    // rows backfill to English without a behavioral change. CHECK enforces the
    // supported language list at the DB layer.
    conversationLanguage: text('conversation_language').notNull().default('en'),
    // BKT-C.1 — optional, learner-owned free text up to 32 chars. The Zod
    // schema is the primary boundary; the DB CHECK below (BUG-978) is the
    // last-resort guard for paths that bypass the API (raw SQL, seed scripts,
    // admin patches).
    pronouns: text('pronouns'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('profiles_account_id_idx').on(table.accountId),
    foreignKey({
      columns: [table.birthYearSetBy],
      foreignColumns: [table.id],
    }).onDelete('set null'),
    check(
      'profiles_conversation_language_check',
      sql`${table.conversationLanguage} IN ('en','cs','es','fr','de','it','pt','pl','ja','nb')`
    ),
    // [BUG-978 / CCR-PR123-DB-1] DB-layer enforcement of the 32-char pronouns
    // cap. The Zod validator is primary; this CHECK closes the gap for any
    // path that bypasses the API layer (raw SQL, seed scripts, admin tools).
    check(
      'profiles_pronouns_length_check',
      sql`${table.pronouns} IS NULL OR char_length(${table.pronouns}) <= 32`
    ),
  ]
);

export const withdrawalArchivePreferences = pgTable(
  'withdrawal_archive_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' })
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
      table.ownerProfileId
    ),
  ]
);

export const familyPreferences = pgTable(
  'family_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' })
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
  ]
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
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (table) => [
    index('pending_notices_owner_unseen_idx').on(
      table.ownerProfileId,
      table.seenAt
    ),
  ]
);

export const familyLinks = pgTable(
  'family_links',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    parentProfileId: uuid('parent_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('family_links_child_profile_id_idx').on(table.childProfileId),
    unique('family_links_parent_child_unique').on(
      table.parentProfileId,
      table.childProfileId
    ),
    check(
      'family_links_no_self_link',
      sql`${table.parentProfileId} != ${table.childProfileId}`
    ),
  ]
);

export const consentStates = pgTable(
  'consent_states',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    consentType: consentTypeEnum('consent_type').notNull(),
    status: consentStatusEnum('status').notNull().default('PENDING'),
    parentEmail: text('parent_email'),
    consentToken: text('consent_token'),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    resendCount: integer('resend_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('consent_states_profile_type_unique').on(
      table.profileId,
      table.consentType
    ),
  ]
);
