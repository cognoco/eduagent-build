import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';
import { quizActivityTypeEnum } from './quiz';

export const quizMasteryItems = pgTable(
  'quiz_mastery_items',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityType: quizActivityTypeEnum('activity_type').notNull(),
    itemKey: text('item_key').notNull(),
    itemAnswer: text('item_answer').notNull(),
    easeFactor: numeric('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default('2.5'),
    interval: integer('interval').notNull().default(1),
    repetitions: integer('repetitions').notNull().default(0),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).notNull(),
    mcSuccessCount: integer('mc_success_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('uq_quiz_mastery_profile_activity_key').on(
      table.profileId,
      table.activityType,
      table.itemKey
    ),
    index('idx_quiz_mastery_due').on(
      table.profileId,
      table.activityType,
      table.nextReviewAt
    ),
  ]
);
