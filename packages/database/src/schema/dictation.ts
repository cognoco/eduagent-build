import {
  boolean,
  date,
  jsonb,
  uniqueIndex,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    completionKey: uuid('completion_key')
      .notNull()
      .default(sql`gen_random_uuid()`),
    date: date('date').notNull(),
    sentenceCount: integer('sentence_count').notNull(),
    mistakeCount: integer('mistake_count'),
    mode: dictationModeEnum('mode').notNull(),
    reviewed: boolean('reviewed').notNull().default(false),
    // [WI-902] Source sentence texts of the dictation exercise, so learners can
    // review the full text of past dictations (not just aggregate counts).
    // Nullable + no default → additive/safe; pre-existing rows and old clients
    // that omit it read back as NULL and the UI falls back to a count summary.
    sentences: jsonb('sentences').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Uniqueness is keyed on (profile_id, completion_key) so distinct dictation
  // sessions on the same day in the same mode persist as separate rows instead
  // of overwriting each other. The legacy (profile_id, date, mode) unique index
  // was the overwrite source and is dropped in the same migration.
  (table) => [
    uniqueIndex('idx_dictation_results_profile_completion_key').on(
      table.profileId,
      table.completionKey,
    ),
  ],
);
