import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { learningSessions } from './sessions';
import { curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

/** Custom pgvector type for Drizzle ORM — 1024 dimensions (Voyage AI voyage-3.5) */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1024)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

export const sessionEmbeddings = pgTable(
  'session_embeddings',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => curriculumTopics.id, {
      onDelete: 'cascade',
    }),
    embedding: vector('embedding').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('embeddings_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);
