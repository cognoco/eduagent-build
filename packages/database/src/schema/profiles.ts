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
    // [WI-367] Optional full birth date components. birthYear stays the NOT NULL
    // source of truth; month/day are nullable and, when present, let post-hoc
    // age reads (consent-revocation COPPA boundary, add-child adult gate) compute
    // exact age instead of year-only — eliminating the up-to-11-month
    // overestimate. NULL = unknown → callers fall back to year-only. The v2
    // `person.birth_date` column already carries full-date precision; these two
    // columns close the same gap on the legacy `profiles` path.
    birthMonth: integer('birth_month'),
    birthDay: integer('birth_day'),
    birthYearSetBy: uuid('birth_year_set_by'),
    location: locationTypeEnum('location'),
    isOwner: boolean('is_owner').notNull().default(false),
    hasPremiumLlm: boolean('has_premium_llm').notNull().default(false),
    defaultAppContext: text('default_app_context'),
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
      sql`${table.conversationLanguage} IN ('en','cs','es','fr','de','it','pt','pl','ja','nb')`,
    ),
    // [BUG-978 / CCR-PR123-DB-1] DB-layer enforcement of the 32-char pronouns
    // cap. The Zod validator is primary; this CHECK closes the gap for any
    // path that bypasses the API layer (raw SQL, seed scripts, admin tools).
    check(
      'profiles_pronouns_length_check',
      sql`${table.pronouns} IS NULL OR char_length(${table.pronouns}) <= 32`,
    ),
    check(
      'profiles_default_app_context_check',
      sql`${table.defaultAppContext} IS NULL OR ${table.defaultAppContext} IN ('study','family')`,
    ),
    // [WI-367] DB-layer guards for the optional full-date components. The Zod
    // schema (profileCreateSchema) is primary; these close the gap for paths
    // that bypass the API (raw SQL, seed scripts, admin tools).
    check(
      'profiles_birth_month_range_check',
      sql`${table.birthMonth} IS NULL OR (${table.birthMonth} BETWEEN 1 AND 12)`,
    ),
    check(
      'profiles_birth_day_range_check',
      sql`${table.birthDay} IS NULL OR (${table.birthDay} BETWEEN 1 AND 31)`,
    ),
    // Both-or-neither: a month without a day (or vice versa) is a client bug;
    // exact-age computation needs both. Mirrors the v2 materialization guard
    // (`birthMonth != null && birthDay != null`).
    check(
      'profiles_birth_month_day_pairwise_check',
      sql`(${table.birthMonth} IS NULL) = (${table.birthDay} IS NULL)`,
    ),
  ],
);

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
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: pendingNoticeTypeEnum('type').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (table) => [
    index('pending_notices_owner_unseen_idx').on(
      table.ownerProfileId,
      table.seenAt,
    ),
  ],
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
      table.childProfileId,
    ),
    check(
      'family_links_no_self_link',
      sql`${table.parentProfileId} != ${table.childProfileId}`,
    ),
  ],
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
    // [WI-374] Separately-capped count of recipient changes. The resend cap
    // (resendCount) is request-keyed; changing the recipient email is a
    // distinct action with its own cap so rotating the recipient cannot reset
    // the resend cap to bomb arbitrary addresses.
    recipientChangeCount: integer('recipient_change_count')
      .notNull()
      .default(0),
    // [Bug #872] GDPR / COPPA audit metadata. Without these fields a consent
    // record cannot be re-derived from logs once Cloudflare access logs roll
    // over: regulators ask "which policy version did this parent consent to,
    // from what device" and the answer is "we no longer know". Captured on
    // requestConsent (request_ip/user_agent of the parent action that
    // initiated the request) and overwritten on processConsentResponse with
    // the IP/UA of the parent click that approved or denied. Policy version
    // is read from the typed config (CONSENT_POLICY_VERSION).
    policyVersion: text('policy_version'),
    requestIp: text('request_ip'),
    userAgent: text('user_agent'),
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
      table.consentType,
    ),
    // [L7-F4] Supports getConsentStatus() — orderBy desc(requestedAt) per
    // profileId. Without this index, the query falls back to a sequential
    // scan of all consent rows for the profile.
    index('consent_states_profile_requested_idx').on(
      table.profileId,
      table.requestedAt,
    ),
    // [L7-F5] Supports processConsentResponse() + getChildNameByToken()
    // token-lookup hot path. Partial WHERE clause skips the (large) set of
    // rows whose token has been cleared after a response.
    index('consent_states_token_idx')
      .on(table.consentToken)
      .where(sql`${table.consentToken} IS NOT NULL`),
  ],
);
