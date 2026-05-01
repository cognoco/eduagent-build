import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { generateUUIDv7 } from '../utils/uuid';

export const pedagogyModeEnum = pgEnum('pedagogy_mode', [
  'socratic',
  'four_strands',
]);

export const subjectStatusEnum = pgEnum('subject_status', [
  'active',
  'paused',
  'archived',
]);

export const topicRelevanceEnum = pgEnum('topic_relevance', [
  'core',
  'recommended',
  'contemporary',
  'emerging',
]);

export const curriculumTopicSourceEnum = pgEnum('curriculum_topic_source', [
  'generated',
  'user',
]);

export const filedFromEnum = pgEnum('filed_from', [
  'pre_generated',
  'session_filing',
  'freeform_filing',
]);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rawInput: text('raw_input'),
    status: subjectStatusEnum('status').notNull().default('active'),
    pedagogyMode: pedagogyModeEnum('pedagogy_mode')
      .notNull()
      .default('socratic'),
    languageCode: text('language_code'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Epic 7: Urgency boost for upcoming tests/deadlines
    urgencyBoostUntil: timestamp('urgency_boost_until', {
      withTimezone: true,
    }),
    urgencyBoostReason: text('urgency_boost_reason'),
  },
  (table) => [
    index('subjects_profile_id_idx').on(table.profileId),
    // [CR-FIL-DEDUP-INDEX-12-FOLLOWUP] Concurrent-write dedup for shelf creation.
    // Defined in migration 0044_shelf_book_dedup_unique_indexes.sql as
    //   CREATE UNIQUE INDEX subjects_profile_name_lower_active_uq
    //     ON subjects (profile_id, lower(name)) WHERE status = 'active'
    // — drizzle's index() builder does not support expression-based indexes
    // (lower(name)) with WHERE predicates, so this lives in raw SQL only.
    // DO NOT add a uniqueIndex(...) here — it would be a different, weaker
    // index and would not enforce the dedup contract. The migration is the
    // source of truth; this comment is a pointer.
  ]
);

export const curricula = pgTable(
  'curricula',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('curricula_subject_version_idx').on(
      table.subjectId,
      table.version
    ),
  ]
);

export const curriculumBooks = pgTable(
  'curriculum_books',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji'),
    sortOrder: integer('sort_order').notNull(),
    topicsGenerated: boolean('topics_generated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('curriculum_books_subject_sort_order_uq').on(
      table.subjectId,
      table.sortOrder
    ),
    // [CR-FIL-DEDUP-INDEX-12-FOLLOWUP] Concurrent-write dedup for book creation.
    // Defined in migration 0044_shelf_book_dedup_unique_indexes.sql as
    //   CREATE UNIQUE INDEX curriculum_books_subject_title_lower_uq
    //     ON curriculum_books (subject_id, lower(title))
    // — drizzle's index() builder does not support expression-based indexes
    // (lower(title)), so this lives in raw SQL only. DO NOT add a
    // uniqueIndex(...) here; it would be a different index and would not
    // enforce the dedup contract. The migration is the source of truth;
    // this comment is a pointer.
  ]
);

export const curriculumTopics = pgTable(
  'curriculum_topics',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    curriculumId: uuid('curriculum_id')
      .notNull()
      .references(() => curricula.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull(),
    relevance: topicRelevanceEnum('relevance').notNull().default('core'),
    source: curriculumTopicSourceEnum('source').notNull().default('generated'),
    estimatedMinutes: integer('estimated_minutes').notNull(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => curriculumBooks.id, { onDelete: 'cascade' }),
    chapter: text('chapter'),
    skipped: boolean('skipped').notNull().default(false),
    cefrLevel: text('cefr_level'),
    cefrSublevel: text('cefr_sublevel'),
    targetWordCount: integer('target_word_count'),
    targetChunkCount: integer('target_chunk_count'),
    filedFrom: filedFromEnum('filed_from').notNull().default('pre_generated'),
    sessionId: uuid('session_id'),
    // FK to learning_sessions(id) is defined in migration SQL only.
    // DO NOT add a JS .references(() => learningSessions.id) here —
    // sessions.ts already imports from subjects.ts, creating a circular dep.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('curriculum_topics_book_sort_order_uq').on(
      table.curriculumId,
      table.bookId,
      table.sortOrder
    ),
    index('curriculum_topics_book_id_idx').on(table.bookId),
    // [CR-FIL-DEDUP-INDEX-12] Concurrent-write dedup. Defined in migration
    // 0043_topic_dedup_unique_index.sql as
    //   CREATE UNIQUE INDEX curriculum_topics_book_title_lower_uq
    //     ON curriculum_topics (book_id, lower(title))
    // — drizzle's index() builder does not support expression-based
    // indexes (lower(title)), so this lives in raw SQL only. DO NOT add
    // a uniqueIndex(...) here without the lower() expression; it would
    // be a different index and would not enforce the dedup contract.
    // The migration is the source of truth; this comment is a pointer.
  ]
);

export const topicConnections = pgTable('topic_connections', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  topicAId: uuid('topic_a_id')
    .notNull()
    .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  topicBId: uuid('topic_b_id')
    .notNull()
    .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const curriculumAdaptations = pgTable('curriculum_adaptations', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  skipReason: text('skip_reason'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bookSuggestions = pgTable(
  'book_suggestions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    emoji: text('emoji'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    pickedAt: timestamp('picked_at', { withTimezone: true }),
  },
  (table) => [index('book_suggestions_subject_id_idx').on(table.subjectId)]
);

export const topicSuggestions = pgTable(
  'topic_suggestions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    bookId: uuid('book_id')
      .notNull()
      .references(() => curriculumBooks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [index('topic_suggestions_book_id_idx').on(table.bookId)]
);
