import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    flow: text('flow').notNull(),
    surfaceKey: text('surface_key').notNull(),
    content: text('content').notNull(),
    attempts: integer('attempts').notNull(),
    firstAttemptedAt: timestamp('first_attempted_at', {
      withTimezone: true,
    }).notNull(),
    escalatedAt: timestamp('escalated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    failureReason: text('failure_reason'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    index('support_messages_profile_idx').on(table.profileId),
    uniqueIndex('support_messages_profile_client_id_uniq').on(
      table.profileId,
      table.clientId
    ),
  ]
);
