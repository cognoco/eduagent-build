import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { curriculumTopics } from './subjects';
import { profiles } from './profiles';
import { learningSessions } from './sessions';
import { generateUUIDv7 } from '../utils/uuid';

export const topicNotes = pgTable(
  'topic_notes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => learningSessions.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('topic_notes_topic_profile_idx').on(t.topicId, t.profileId),
    // Idempotency lookup in services/notes.ts insertNoteWithCap scans
    // (profileId, sessionId) on retry. Without this index the query is a
    // sequential scan within profile scope — fine while the per-topic note
    // cap is 50, but degrades as the cap rises or note volume grows.
    index('topic_notes_session_id_idx').on(t.sessionId),
    index('topic_notes_content_trgm_idx').using(
      'gin',
      sql`${t.content} gin_trgm_ops`
    ),
  ]
);
