import {
  boolean,
  date,
  index,
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
  // [WI-84 DS-115] Idempotency is per completion, not per date/mode. A learner
  // can legitimately complete multiple same-mode dictations on the same day;
  // client retries reuse completionKey and upsert this row.
  (table) => [
    uniqueIndex('uniq_dictation_results_profile_completion_key').on(
      table.profileId,
      table.completionKey,
    ),
    index('idx_dictation_results_profile_date_mode').on(
      table.profileId,
      table.date,
      table.mode,
    ),
  ],
);
