import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  EvidenceLinkFromKind,
  EvidenceLinkToKind,
} from '@eduagent/schemas';
import { person } from './identity';
import { generateUUIDv7 } from '../utils/uuid';

// Links deliberately use raw IDs without target FKs: evidence targets may be
// purged under transcript retention, and the remaining metadata must degrade
// safely instead of cascading or retaining transcript content.
export const evidenceLinks = pgTable(
  'evidence_links',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    fromKind: text('from_kind').$type<EvidenceLinkFromKind>().notNull(),
    fromId: uuid('from_id').notNull(),
    toKind: text('to_kind').$type<EvidenceLinkToKind>().notNull(),
    toId: uuid('to_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('evidence_links_profile_from_idx').on(
      table.profileId,
      table.fromKind,
      table.fromId,
    ),
    index('evidence_links_profile_to_idx').on(
      table.profileId,
      table.toKind,
      table.toId,
    ),
    uniqueIndex('evidence_links_profile_endpoints_unique').on(
      table.profileId,
      table.fromKind,
      table.fromId,
      table.toKind,
      table.toId,
    ),
  ],
).enableRLS();
