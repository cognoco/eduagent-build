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
    // [WI-1658] Artifact-source marker. Nullable, additive, no DB-level enum —
    // forward-compatible with the fuller artifactSource vocabulary WI-1704 owns
    // (docs/specs/2026-07-06-verified-learning-loop.md, "Artifact Provenance
    // Contract"). Today only 'challenge_drafted_note' is ever written, by the
    // Challenge-Round finalize path (session-exchange.ts) on verified-outcome
    // rounds only. Existing rows are NULL (ordinary learner/session-summary notes).
    artifactSource: text('artifact_source'),
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
