import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { person } from './identity';
import { subjects } from './subjects';
import { learningSessions } from './sessions';
import { generateUUIDv7 } from '../utils/uuid';

// WI-1777: repeat-after-me/shadowing attempt persistence. Deterministic
// server-computed score only (see apps/api's speaking-practice/scoring.ts) —
// no raw audio column (WI-1549 AC4). Modeled on `sessionEvents`'s
// profile+subject+session triple-FK, cascade-delete, composite-index shape
// (packages/database/src/schema/sessions.ts) — the closest existing
// precedent for this scoping shape.
export const speakingPracticeAttempts = pgTable(
  'speaking_practice_attempts',
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
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(), // 'repeat_after_me' | 'shadowing'
    targetText: text('target_text').notNull(),
    transcript: text('transcript').notNull(),
    locale: text('locale').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    lexicalMatchScore: real('lexical_match_score').notNull(),
    missingWords: jsonb('missing_words').$type<string[]>().notNull(),
    extraWords: jsonb('extra_words').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('speaking_practice_attempts_session_id_idx').on(table.sessionId),
    index('speaking_practice_attempts_profile_created_idx').on(
      table.profileId,
      table.createdAt,
    ),
  ],
);
