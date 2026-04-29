import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const quizActivityTypeEnum = pgEnum('quiz_activity_type', [
  'capitals',
  'vocabulary',
  'guess_who',
]);

export const quizRoundStatusEnum = pgEnum('quiz_round_status', [
  'active',
  'completed',
  'abandoned',
]);

export const quizRounds = pgTable(
  'quiz_rounds',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: quizActivityTypeEnum('activity_type').notNull(),
    theme: text('theme').notNull(),
    questions: jsonb('questions').notNull().default([]),
    results: jsonb('results').notNull().default([]),
    score: integer('score'),
    total: integer('total').notNull(),
    xpEarned: integer('xp_earned'),
    libraryQuestionIndices: jsonb('library_question_indices')
      .notNull()
      .default([]),
    status: quizRoundStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // [BUG-926] Per-language stats: language being practised for vocabulary
    // rounds. NULL for capitals and guess_who (not language-specific).
    languageCode: text('language_code'),
  },
  (table) => [
    index('idx_quiz_rounds_profile_activity').on(
      table.profileId,
      table.activityType
    ),
    index('idx_quiz_rounds_profile_status').on(table.profileId, table.status),
  ]
);

export const quizMissedItems = pgTable(
  'quiz_missed_items',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: quizActivityTypeEnum('activity_type').notNull(),
    questionText: text('question_text').notNull(),
    correctAnswer: text('correct_answer').notNull(),
    sourceRoundId: uuid('source_round_id')
      .notNull()
      .references(() => quizRounds.id, { onDelete: 'cascade' }),
    surfaced: boolean('surfaced').notNull().default(false),
    convertedToTopic: boolean('converted_to_topic').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_quiz_missed_items_profile').on(
      table.profileId,
      table.activityType,
      table.surfaced
    ),
  ]
);
