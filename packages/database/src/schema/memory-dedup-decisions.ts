import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const memoryDedupDecisions = pgTable(
  'memory_dedup_decisions',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    pairKey: text('pair_key').notNull(),
    decision: text('decision', {
      enum: ['merge', 'supersede', 'keep_both', 'discard_new'],
    }).notNull(),
    mergedText: text('merged_text'),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.pairKey] })],
);
