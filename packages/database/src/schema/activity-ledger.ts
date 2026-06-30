import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';
import { generateUUIDv7 } from '../utils/uuid';

// MMT-ADR-0022 (activity feed = derive-on-read + thin seen-state): the table is
// a narrow seen-state store. Visibility is self-only, enforced by profile scope
// + RLS — there is no stored visibility column or `ledger_visibility` enum.
// Display copy is resolved at read time by /now, so there is no stored
// `template_key` column either.
export const mentorActivityLedger = pgTable(
  'mentor_activity_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    actorJob: text('actor_job').notNull(),
    kind: text('kind').notNull(),
    params: jsonb('params')
      .notNull()
      .default({})
      .$type<Record<string, unknown>>(),
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
