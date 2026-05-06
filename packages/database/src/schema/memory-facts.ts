import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { vector } from './_pgvector';
import { generateUUIDv7 } from '../utils/uuid';

export const memoryFacts = pgTable(
  'memory_facts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    text: text('text').notNull(),
    textNormalized: text('text_normalized').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    sourceSessionIds: uuid('source_session_ids')
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    sourceEventIds: uuid('source_event_ids')
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    supersededBy: uuid('superseded_by'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    embedding: vector('embedding'),
    confidence: text('confidence', {
      enum: ['low', 'medium', 'high'],
    })
      .notNull()
      .default('medium'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededBy],
      foreignColumns: [table.id],
      name: 'memory_facts_superseded_by_fk',
    }).onDelete('set null'),
    index('memory_facts_profile_category_idx').on(
      table.profileId,
      table.category
    ),
    index('memory_facts_profile_created_idx').on(
      table.profileId,
      table.createdAt
    ),
    index('memory_facts_active_idx')
      .on(table.profileId, table.category)
      .where(sql`${table.supersededBy} IS NULL`),
    index('memory_facts_profile_text_normalized_idx').on(
      table.profileId,
      table.textNormalized
    ),
    index('memory_facts_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .where(sql`${table.supersededBy} IS NULL`),
    uniqueIndex('memory_facts_active_unique_idx')
      .on(
        table.profileId,
        table.category,
        sql`COALESCE(${table.metadata}->>'subject', '')`,
        sql`COALESCE(${table.metadata}->>'context', '')`,
        table.textNormalized
      )
      .where(sql`${table.supersededBy} IS NULL`),
  ]
);
