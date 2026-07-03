import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { person } from './identity';

// BUG-363: `category` scopes pair_key to prevent cross-category false-positive
// dedup collisions (e.g. an 'interest' pair_key shadowing a 'struggle' decision).
export const memoryDedupDecisions = pgTable(
  'memory_dedup_decisions',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    pairKey: text('pair_key').notNull(),
    category: text('category').notNull().default('unknown'),
    decision: text('decision', {
      enum: ['merge', 'supersede', 'keep_both', 'discard_new'],
    }).notNull(),
    mergedText: text('merged_text'),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.pairKey, table.category] }),
    index('memory_dedup_decisions_profile_category_idx').on(
      table.profileId,
      table.category,
    ),
  ],
);
