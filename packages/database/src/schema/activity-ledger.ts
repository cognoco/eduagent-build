import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';
import { generateUUIDv7 } from '../utils/uuid';

export const ledgerVisibilityEnum = pgEnum('ledger_visibility', [
  'self',
  'supporter',
  'both',
]);

export const mentorActivityLedger = pgTable(
  'mentor_activity_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    // ADR-0022 keeps S4 ledger visibility self-only; relationship visibility is read-time derived.
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    actorJob: text('actor_job').notNull(),
    kind: text('kind').notNull(),
    templateKey: text('template_key').notNull(),
    params: jsonb('params')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
    visibility: ledgerVisibilityEnum('visibility').notNull().default('self'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    surfacedAt: timestamp('surfaced_at', { withTimezone: true }),
  },
  (table) => [
    index('mentor_activity_ledger_pending_idx')
      .on(table.profileId, table.createdAt)
      .where(sql`${table.surfacedAt} IS NULL`),
    index('mentor_activity_ledger_profile_id_idx').on(table.profileId),
  ],
).enableRLS();
