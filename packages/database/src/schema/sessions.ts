import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';
import { subjects, curriculumTopics } from './subjects.js';

export const draftStatusEnum = pgEnum('draft_status', [
  'in_progress',
  'completed',
  'expired',
]);

export const sessionEventTypeEnum = pgEnum('session_event_type', [
  'user_message',
  'ai_response',
  'understanding_check',
  'session_start',
  'session_end',
  'hint',
  'escalation',
  'flag',
  'check_response',
  'summary_submission',
  'parking_lot_add',
]);

export const sessionTypeEnum = pgEnum('session_type', ['learning', 'homework']);

export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'paused',
  'completed',
  'auto_closed',
]);

export const summaryStatusEnum = pgEnum('summary_status', [
  'pending',
  'submitted',
  'accepted',
  'skipped',
  'auto_closed',
]);

export const onboardingDrafts = pgTable('onboarding_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  exchangeHistory: jsonb('exchange_history').notNull().default([]),
  extractedSignals: jsonb('extracted_signals').notNull().default({}),
  status: draftStatusEnum('status').notNull().default('in_progress'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessionEvents = pgTable('session_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => learningSessions.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => curriculumTopics.id, {
    onDelete: 'cascade',
  }),
  eventType: sessionEventTypeEnum('event_type').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const learningSessions = pgTable('learning_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => curriculumTopics.id, {
    onDelete: 'cascade',
  }),
  sessionType: sessionTypeEnum('session_type').notNull().default('learning'),
  status: sessionStatusEnum('status').notNull().default('active'),
  escalationRung: integer('escalation_rung').notNull().default(1),
  exchangeCount: integer('exchange_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessionSummaries = pgTable('session_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => learningSessions.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => curriculumTopics.id, {
    onDelete: 'cascade',
  }),
  content: text('content'),
  aiFeedback: text('ai_feedback'),
  status: summaryStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const parkingLotItems = pgTable('parking_lot_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => learningSessions.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').references(() => curriculumTopics.id, {
    onDelete: 'cascade',
  }),
  question: text('question').notNull(),
  explored: boolean('explored').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
