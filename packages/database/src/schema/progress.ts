import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';
import { curriculumTopics, subjects } from './subjects.js';
import { xpStatusEnum } from './assessments.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export const learningModeEnum = pgEnum('learning_mode', ['serious', 'casual']);

export const streaks = pgTable('streaks', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' })
    .unique(),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActivityDate: text('last_activity_date'),
  gracePeriodStartDate: text('grace_period_start_date'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    status: xpStatusEnum('status').notNull().default('pending'),
    earnedAt: timestamp('earned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('xp_ledger_profile_id_idx').on(table.profileId),
    index('xp_ledger_topic_id_idx').on(table.topicId),
  ]
);

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' })
    .unique(),
  reviewReminders: boolean('review_reminders').notNull().default(false),
  dailyReminders: boolean('daily_reminders').notNull().default(false),
  pushEnabled: boolean('push_enabled').notNull().default(false),
  maxDailyPush: integer('max_daily_push').notNull().default(3),
  expoPushToken: text('expo_push_token'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationTypeEnum = pgEnum('notification_type', [
  'review_reminder',
  'daily_reminder',
  'trial_expiry',
  'streak_warning',
  'consent_request',
  'consent_reminder',
  'consent_warning',
  'consent_expired',
  'subscribe_request',
]);

export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    ticketId: text('ticket_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notification_log_profile_sent_idx').on(
      table.profileId,
      table.sentAt
    ),
  ]
);

export const learningModes = pgTable('learning_modes', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' })
    .unique(),
  mode: learningModeEnum('mode').notNull().default('serious'),
  consecutiveSummarySkips: integer('consecutive_summary_skips')
    .notNull()
    .default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const coachingCardCache = pgTable('coaching_card_cache', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' })
    .unique(),
  cardData: jsonb('card_data').notNull(),
  contextHash: text('context_hash'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
