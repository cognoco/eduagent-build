import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import type {
  CoachingCardCacheData,
  CoachingCardPendingCelebrations,
} from '@eduagent/schemas';
import { person } from './identity';
import { curriculumTopics, subjects } from './subjects';
import { learningSessions } from './sessions';
import { xpStatusEnum } from './assessments';
import { generateUUIDv7 } from '../utils/uuid';

export const celebrationLevelEnum = pgEnum('celebration_level', [
  'all',
  'big_only',
  'off',
]);

export const streaks = pgTable('streaks', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => person.id, { onDelete: 'cascade' })
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
      .references(() => person.id, { onDelete: 'cascade' }),
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
    reflectionMultiplierApplied: boolean('reflection_multiplier_applied')
      .notNull()
      .default(false),
    reflectionAppliedBySessionId: uuid(
      'reflection_applied_by_session_id',
    ).references(() => learningSessions.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('xp_ledger_profile_id_idx').on(table.profileId),
    index('xp_ledger_topic_id_idx').on(table.topicId),
    // Enforce one XP entry per (profile, topic) at the DB level. Application
    // logic in insertSessionXpEntry already dedupes via findFirst, but two
    // concurrent session closes could both pass the check and insert. With
    // this unique constraint in place, insertSessionXpEntry uses
    // onConflictDoNothing to make the check+insert atomic. Without it,
    // applyReflectionMultiplier would non-deterministically pick a row.
    uniqueIndex('xp_ledger_profile_topic_unique').on(
      table.profileId,
      table.topicId,
    ),
  ],
);

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => person.id, { onDelete: 'cascade' })
    .unique(),
  reviewReminders: boolean('review_reminders').notNull().default(false),
  dailyReminders: boolean('daily_reminders').notNull().default(false),
  weeklyProgressPush: boolean('weekly_progress_push').notNull().default(true),
  // Email channel flags (default true — matches push defaults; transactional, not marketing).
  // Settings UI to opt out is a follow-up. Until then everyone with a known email gets the digest.
  weeklyProgressEmail: boolean('weekly_progress_email').notNull().default(true),
  monthlyProgressEmail: boolean('monthly_progress_email')
    .notNull()
    .default(true),
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
  'payment_failed',
  'streak_warning',
  'consent_request',
  'consent_reminder',
  'consent_warning',
  'consent_expired',
  'consent_archived',
  'subscribe_request',
  'recall_nudge',
  'notice_recheck',
  'weekly_progress',
  'monthly_report',
  'progress_refresh',
  'struggle_noticed',
  'struggle_flagged',
  'struggle_resolved',
  'dictation_review',
  'session_filing_failed',
  // 'interview_ready': retained in DB enum (removal needs destructive migration); removed from typed payload union — no sender exists.
  'interview_ready',
  'nudge',
  // [WI-179] Rate-limit marker for /v1/support/outbox-spillover. Never
  // dispatched as a user notification — recorded only so the existing
  // notification_log-backed rate limiter can enforce per-profile budgets
  // on outbox spillover writes.
  'support_outbox_spillover',
]);

export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    ticketId: text('ticket_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // [L10.L5 / BUG-673] Daily-reminder, review-due-scan, recall-nudge,
    // and weekly-progress-push all filter notification_log by
    // (profileId, type, sentAt). The original (profile_id, sent_at) index
    // forced a full scan of every prior notification for the profile and
    // only filtered on type after the fact. Lead with profile_id + type
    // so the planner jumps straight to the (profile, type) bucket and only
    // range-scans the per-day slice of sent_at within it.
    index('notification_log_profile_type_sent_idx').on(
      table.profileId,
      table.type,
      table.sentAt,
    ),
  ],
);

export const learningModes = pgTable('learning_modes', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => person.id, { onDelete: 'cascade' })
    .unique(),
  medianResponseSeconds: integer('median_response_seconds'),
  celebrationLevel: celebrationLevelEnum('celebration_level')
    .notNull()
    .default('all'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// [BUG-220 / P1-HIGH] coaching_card_cache.card_data and .pending_celebrations
// are jsonb columns whose runtime shape must be validated on read. Drizzle's
// $type<…>() is TS-only and provides no runtime guarantee. Consumers MUST
// pass the raw value through one of:
//   • parseCoachingCardCacheData(raw)        — for cardData
//   • coachingCardPendingCelebrationsSchema  — for pendingCelebrations
// from @eduagent/schemas/db-jsonb before treating the value as the typed
// shape. The $type<…> annotation here is purely a TS hint so the read site
// gets autocomplete; it does NOT skip the parse step.
export const coachingCardCache = pgTable('coaching_card_cache', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => person.id, { onDelete: 'cascade' })
    .unique(),
  cardData: jsonb('card_data').notNull().$type<CoachingCardCacheData>(),
  pendingCelebrations: jsonb('pending_celebrations')
    .notNull()
    .default([])
    .$type<CoachingCardPendingCelebrations>(),
  celebrationsSeenByChild: timestamp('celebrations_seen_by_child', {
    withTimezone: true,
  }),
  celebrationsSeenByParent: timestamp('celebrations_seen_by_parent', {
    withTimezone: true,
  }),
  contextHash: text('context_hash'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
