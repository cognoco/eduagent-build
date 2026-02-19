import {
  pgTable,
  uuid,
  integer,
  timestamp,
  jsonb,
  numeric,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';
import { subjects, curriculumTopics } from './subjects.js';
import { learningSessions } from './sessions.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export const verificationDepthEnum = pgEnum('verification_depth', [
  'recall',
  'explain',
  'transfer',
]);

export const assessmentStatusEnum = pgEnum('assessment_status', [
  'in_progress',
  'passed',
  'failed',
]);

export const xpStatusEnum = pgEnum('xp_status', [
  'pending',
  'verified',
  'decayed',
]);

export const teachingMethodEnum = pgEnum('teaching_method', [
  'visual_diagrams',
  'step_by_step',
  'real_world_examples',
  'practice_problems',
]);

export const needsDeepeningStatusEnum = pgEnum('needs_deepening_status', [
  'active',
  'resolved',
]);

export const assessments = pgTable('assessments', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => learningSessions.id, {
    onDelete: 'cascade',
  }),
  verificationDepth: verificationDepthEnum('verification_depth')
    .notNull()
    .default('recall'),
  status: assessmentStatusEnum('status').notNull().default('in_progress'),
  masteryScore: numeric('mastery_score', { precision: 3, scale: 2 }),
  qualityRating: integer('quality_rating'),
  exchangeHistory: jsonb('exchange_history').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const retentionCards = pgTable(
  'retention_cards',
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
    easeFactor: numeric('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default('2.50'),
    intervalDays: integer('interval_days').notNull().default(1),
    repetitions: integer('repetitions').notNull().default(0),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
    xpStatus: xpStatusEnum('xp_status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('retention_cards_profile_topic_unique').on(
      table.profileId,
      table.topicId
    ),
    index('retention_cards_review_idx').on(table.profileId, table.nextReviewAt),
  ]
);

export const needsDeepeningTopics = pgTable('needs_deepening_topics', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  status: needsDeepeningStatusEnum('status').notNull().default('active'),
  consecutiveSuccessCount: integer('consecutive_success_count')
    .notNull()
    .default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teachingPreferences = pgTable('teaching_preferences', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  method: teachingMethodEnum('method').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
