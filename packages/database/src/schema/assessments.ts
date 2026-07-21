import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  jsonb,
  pgEnum,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { numericAsNumber } from './_numeric-as-number';
import { person } from './identity';
import { subjects, curriculumTopics } from './subjects';
import { learningSessions } from './sessions';
import { generateUUIDv7 } from '../utils/uuid';
import type { ChatExchange, RecallFeedback } from '@eduagent/schemas';

export const verificationDepthEnum = pgEnum('verification_depth', [
  'recall',
  'explain',
  'transfer',
]);

export const assessmentStatusEnum = pgEnum('assessment_status', [
  'in_progress',
  'passed',
  'failed',
  'borderline',
  'failed_exhausted',
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
  'pending_review',
  'resolved',
]);

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
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
    masteryScore: numericAsNumber('mastery_score', { precision: 3, scale: 2 }),
    masteryChallengeVerifiedAt: timestamp('mastery_challenge_verified_at', {
      withTimezone: true,
    }),
    qualityRating: integer('quality_rating'),
    // [BUG-391] $type<ChatExchange[]> is TS-only; callers MUST pass the raw
    // value through parseAssessmentExchangeHistory() from @eduagent/schemas/db-jsonb
    // before treating it as typed — the parser returns [] on schema failure so
    // the read path can degrade gracefully to an empty-history assessment.
    exchangeHistory: jsonb('exchange_history')
      .notNull()
      .default([])
      .$type<ChatExchange[]>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('assessments_profile_topic_idx').on(table.profileId, table.topicId),
    index('assessments_topic_id_idx').on(table.topicId),
    // [BUG-393 / migration 0086] Standalone profile_id FK index. Redundant with
    // the leftmost prefix of assessments_profile_topic_idx for query planning,
    // but it exists in the database (migration 0086_bug393_fk_indexes.sql) so
    // the schema must declare it to stay in sync — otherwise a `drizzle-kit
    // generate`/`push` would emit a DROP.
    index('assessments_profile_id_idx').on(table.profileId),
    check(
      'assessments_mastery_score_range',
      sql`${table.masteryScore} IS NULL OR (${table.masteryScore} >= 0 AND ${table.masteryScore} <= 1)`,
    ),
  ],
);

export const retentionCards = pgTable(
  'retention_cards',
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
    easeFactor: numericAsNumber('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default(2.5),
    intervalDays: integer('interval_days').notNull().default(1),
    repetitions: integer('repetitions').notNull().default(0),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    masteredAt: timestamp('mastered_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
    xpStatus: xpStatusEnum('xp_status').notNull().default('pending'),
    evaluateDifficultyRung: integer('evaluate_difficulty_rung'),
    // [WI-2114] Last graded recall's answer-specific feedback, so a follow-up
    // that is cooldown-blocked (never re-graded) can still receive a direct
    // explanation of the prior answer instead of the generic prompt. Stores
    // ONLY the grader-owned structured {strengths, gaps, nextStep} — never the
    // learner's verbatim answer (AC-7; ropa.md row 7 / MMT-ADR-0036 line 43).
    // $type is TS-only; the write site is the sole producer and always passes a
    // RecallFeedback, so no read-time parse is needed.
    lastRecallFeedback: jsonb('last_recall_feedback').$type<RecallFeedback>(),
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
      table.topicId,
    ),
    index('retention_cards_review_idx').on(table.profileId, table.nextReviewAt),
    // [BUG-393 / migration 0086] Standalone profile_id FK index. Redundant with
    // the leftmost prefix of retention_cards_profile_topic_unique /
    // retention_cards_review_idx for query planning, but it exists in the
    // database (migration 0086_bug393_fk_indexes.sql) so the schema must declare
    // it to stay in sync — otherwise a `drizzle-kit generate`/`push` would emit
    // a DROP.
    index('retention_cards_profile_id_idx').on(table.profileId),
    check(
      'retention_cards_interval_days_positive',
      sql`${table.intervalDays} >= 1`,
    ),
  ],
);

export const needsDeepeningTopics = pgTable(
  'needs_deepening_topics',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
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
    source: text('source').notNull().default('system_signal'),
    concept: text('concept'),
    misconception: text('misconception'),
    correction: text('correction'),
    pendingExpiresAt: timestamp('pending_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('needs_deepening_profile_topic_idx').on(
      table.profileId,
      table.topicId,
    ),
    index('needs_deepening_topic_id_idx').on(table.topicId),
    // [BUG-393 / migration 0086] Standalone profile_id FK index. Redundant with
    // the leftmost prefix of needs_deepening_profile_topic_idx for query
    // planning, but it exists in the database (migration
    // 0086_bug393_fk_indexes.sql) so the schema must declare it to stay in sync
    // — otherwise a `drizzle-kit generate`/`push` would emit a DROP.
    index('needs_deepening_topics_profile_id_idx').on(table.profileId),
  ],
);

export const analogyDomainEnum = pgEnum('analogy_domain', [
  'cooking',
  'sports',
  'building',
  'music',
  'nature',
  'gaming',
]);

export const teachingPreferences = pgTable(
  'teaching_preferences',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    method: teachingMethodEnum('method').notNull(),
    analogyDomain: analogyDomainEnum('analogy_domain'),
    nativeLanguage: text('native_language'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('teaching_preferences_profile_subject_unique').on(
      table.profileId,
      table.subjectId,
    ),
    // [BUG-393 / migration 0086] Standalone profile_id FK index. Redundant with
    // the leftmost prefix of teaching_preferences_profile_subject_unique for
    // query planning, but it exists in the database (migration
    // 0086_bug393_fk_indexes.sql) so the schema must declare it to stay in sync
    // — otherwise a `drizzle-kit generate`/`push` would emit a DROP.
    index('teaching_preferences_profile_id_idx').on(table.profileId),
  ],
);
