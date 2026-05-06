import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
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
    uniqueIndex('session_embeddings_session_profile_uq').on(
      table.sessionId,
      table.profileId
    ),
    index('embeddings_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);
