import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { person } from './identity';

export const childCapNotifications = pgTable(
  'child_cap_notifications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['daily_exceeded', 'monthly_exceeded'],
    }).notNull(),
    occurredOn: date('occurred_on').notNull(),
    resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('child_cap_notifications_dedup_idx').on(
      table.ownerProfileId,
      table.childProfileId,
      table.kind,
      table.occurredOn,
    ),
    index('child_cap_notifications_owner_active_idx').on(
      table.ownerProfileId,
      table.dismissedAt,
    ),
  ],
);

export type ChildCapNotificationRow = typeof childCapNotifications.$inferSelect;
export type NewChildCapNotificationRow =
  typeof childCapNotifications.$inferInsert;
