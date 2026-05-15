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
    date: date('date').notNull(),
    sentenceCount: integer('sentence_count').notNull(),
    mistakeCount: integer('mistake_count'),
    mode: dictationModeEnum('mode').notNull(),
    reviewed: boolean('reviewed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // [BUG-4] Unique on (profile_id, date, mode) so a client retry of the same
  // dictation completion is idempotent at the DB layer. A learner can still
  // legitimately do two dictations on the same day in different modes
  // (homework + surprise) — those land in separate rows. The index also
  // backs the streak query, which scans by (profile_id, date desc).
  (table) => [
    uniqueIndex('uniq_dictation_results_profile_date_mode').on(
      table.profileId,
      table.date,
      table.mode,
    ),
  ],
);
