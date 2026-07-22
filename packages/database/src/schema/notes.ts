import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { curriculumTopics } from './subjects';
import { person } from './identity';
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
      .references(() => person.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => learningSessions.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    // Artifact source and verification state are required after the migration's
    // ordered backfill. SQL CHECK constraints own the narrow persisted vocabulary.
    artifactSource: text('artifact_source')
      .notNull()
      .default('learner_authored_note'),
    verificationState: text('verification_state')
      .notNull()
      .default('unverified'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('topic_notes_topic_profile_idx').on(t.topicId, t.profileId),
    // [BUG-393 / migration 0086] Standalone profile_id FK index. NOT covered by
    // topic_notes_topic_profile_idx (profile_id is the second column there).
    // Created in the database by migration 0086_bug393_fk_indexes.sql; declared
    // here to keep the schema in sync with the applied migration.
    index('topic_notes_profile_id_idx').on(t.profileId),
    // Idempotency lookup in services/notes.ts insertNoteWithCap scans
    // (profileId, sessionId) on retry. Without this index the query is a
    // sequential scan within profile scope — fine while the per-topic note
    // cap is 50, but degrades as the cap rises or note volume grows.
    index('topic_notes_session_id_idx').on(t.sessionId),
    index('topic_notes_content_trgm_idx').using(
      'gin',
      sql`${t.content} gin_trgm_ops`,
    ),
  ],
);
