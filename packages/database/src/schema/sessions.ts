import {
  pgTable,
  uuid,
  text,
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
  sessionId: uuid('session_id').notNull(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id),
  topicId: uuid('topic_id').references(() => curriculumTopics.id),
  eventType: sessionEventTypeEnum('event_type').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
