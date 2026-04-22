import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { subjects, curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    // Stored as raw IDs instead of FKs so bookmarks survive session/event TTL cleanup.
    sessionId: uuid('session_id').notNull(),
    eventId: uuid('event_id').notNull(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => curriculumTopics.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('bookmarks_profile_id_idx').on(table.profileId),
    index('bookmarks_session_id_idx').on(table.sessionId),
    uniqueIndex('bookmarks_profile_event_unique').on(
      table.profileId,
      table.eventId
    ),
  ]
);
