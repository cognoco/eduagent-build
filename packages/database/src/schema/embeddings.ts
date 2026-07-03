import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { person } from './identity';
import { learningSessions } from './sessions';
import { curriculumTopics } from './subjects';
import { vector } from './_pgvector';
import { generateUUIDv7 } from '../utils/uuid';

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
      .references(() => person.id, { onDelete: 'cascade' }),
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
    uniqueIndex('session_embeddings_session_profile_uq').on(
      table.sessionId,
      table.profileId,
    ),
    // [BUG-393 / migration 0086] Standalone profile_id FK index. NOT covered by
    // session_embeddings_session_profile_uq (profile_id is the second column
    // there). Created in the database by migration 0086_bug393_fk_indexes.sql;
    // declared here to keep the schema in sync with the applied migration.
    index('session_embeddings_profile_id_idx').on(table.profileId),
    index('embeddings_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);
