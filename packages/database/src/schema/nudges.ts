import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const nudgeTemplateEnum = pgEnum('nudge_template', [
  'you_got_this',
  'proud_of_you',
  'quick_session',
  'thinking_of_you',
  'thanks',
  'need_help',
  'proud_moment',
]);

export const nudgeDirectionEnum = pgEnum('nudge_direction', [
  'guardian_to_learner',
  'learner_to_guardian',
]);

export const nudges = pgTable(
  'nudges',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    fromProfileId: uuid('from_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    toProfileId: uuid('to_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    direction: nudgeDirectionEnum('direction')
      .notNull()
      .default('guardian_to_learner'),
    template: nudgeTemplateEnum('template').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    index('nudges_to_profile_read_at_idx').on(table.toProfileId, table.readAt),
    index('nudges_from_to_created_at_idx').on(
      table.fromProfileId,
      table.toProfileId,
      table.createdAt,
    ),
  ],
);

export type Nudge = typeof nudges.$inferSelect;
export type NewNudge = typeof nudges.$inferInsert;
