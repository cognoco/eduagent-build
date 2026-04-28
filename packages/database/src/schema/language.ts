import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { numericAsNumber } from './_numeric-as-number';
import { profiles } from './profiles';
import { subjects, curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

export const vocabTypeEnum = pgEnum('vocab_type', ['word', 'chunk']);

export const vocabulary = pgTable(
  'vocabulary',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    termNormalized: text('term_normalized').notNull(),
    translation: text('translation').notNull(),
    type: vocabTypeEnum('type').notNull().default('word'),
    cefrLevel: text('cefr_level'),
    milestoneId: uuid('milestone_id').references(() => curriculumTopics.id, {
      onDelete: 'set null',
    }),
    mastered: boolean('mastered').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('vocabulary_profile_subject_term_unique').on(
      table.profileId,
      table.subjectId,
      table.termNormalized
    ),
    index('vocabulary_profile_subject_idx').on(
      table.profileId,
      table.subjectId
    ),
  ]
);

export const vocabularyRetentionCards = pgTable(
  'vocabulary_retention_cards',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
    easeFactor: numericAsNumber('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default(2.5),
    intervalDays: integer('interval_days').notNull().default(1),
    repetitions: integer('repetitions').notNull().default(0),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('vocab_retention_cards_vocabulary_unique').on(table.vocabularyId),
    index('vocab_retention_cards_review_idx').on(
      table.profileId,
      table.nextReviewAt
    ),
    check(
      'vocab_retention_cards_interval_days_positive',
      sql`${table.intervalDays} >= 1`
    ),
  ]
);
