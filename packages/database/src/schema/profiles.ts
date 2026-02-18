import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid.js';

export const personaTypeEnum = pgEnum('persona_type', [
  'TEEN',
  'LEARNER',
  'PARENT',
]);
export const consentTypeEnum = pgEnum('consent_type', ['GDPR', 'COPPA']);
export const consentStatusEnum = pgEnum('consent_status', [
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
  'CONSENTED',
  'WITHDRAWN',
]);

export const accounts = pgTable('accounts', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
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

export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  birthDate: timestamp('birth_date', { mode: 'date' }),
  personaType: personaTypeEnum('persona_type').notNull().default('LEARNER'),
  isOwner: boolean('is_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
