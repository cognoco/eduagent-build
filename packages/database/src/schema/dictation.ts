import {
  boolean,
  date,
  uniqueIndex,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const dictationModeEnum = pgEnum('dictation_mode', [
  'homework',
  'surprise',
]);

export const dictationResults = pgTable(
  'dictation_results',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    completionKey: uuid('completion_key').notNull(),
    date: date('date').notNull(),
    sentenceCount: integer('sentence_count').notNull(),
    mistakeCount: integer('mistake_count'),
    mode: dictationModeEnum('mode').notNull(),
    reviewed: boolean('reviewed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // [WI-84 rollout] Keep the legacy date/mode uniqueness during the expand
  // deploy so old Workers still have a backing ON CONFLICT target. A follow-up
  // contract migration can replace this with a non-unique read index once all
  // deployed Workers write against completionKey.
  (table) => [
    uniqueIndex('uniq_dictation_results_profile_completion_key').on(
      table.profileId,
      table.completionKey,
    ),
    uniqueIndex('uniq_dictation_results_profile_date_mode').on(
      table.profileId,
      table.date,
      table.mode,
    ),
  ],
);
