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
import { sql } from 'drizzle-orm';
import { person } from './identity';
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
  'parent_bridge',
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
      .references(() => person.id, { onDelete: 'cascade' }),
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
    bookSuggestionsLastGenerationAttemptedAt: timestamp(
      'book_suggestions_last_generation_attempted_at',
      { withTimezone: true },
    ),
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
  ],
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
      table.version,
    ),
  ],
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
    // [books topicsGenerated ordering] Single-flight claim marker for the
    // SYNCHRONOUS generate-topics route. The CAS in claimBookForGeneration
    // sets this to NOW() to win the race; `topics_generated` is reserved for
    // "topics actually persisted" and is only flipped true by
    // persistBookTopics AFTER the topic rows land. A worker evicted mid-LLM
    // (before persist) therefore leaves topics_generated=false with a stamped
    // started_at; the next claim reclaims it once started_at passes the
    // 15-min stale window. NULL = not currently claimed.
    topicsGenerationStartedAt: timestamp('topics_generation_started_at', {
      withTimezone: true,
    }),
    // [WI-125] Atomic single-flight claim flag for the
    // subject-retry-curriculum Inngest function. Set true before the LLM
    // call via a guarded UPDATE; reset false in a finally block. Prevents
    // duplicate concurrent retries from burning the LLM call twice when
    // the dispatch fires multiple events for the same bookId.
    retryInFlight: boolean('retry_in_flight').notNull().default(false),
    // [WI-125] Timestamp when retry_in_flight was set true. Used by the
    // claim UPDATE to reclaim stale locks (>15 min) so a worker that crashed
    // before releasing the flag does not permanently lock the book out of
    // future retries. Set to NOW() alongside retry_in_flight=true; reset to
    // NULL alongside retry_in_flight=false in the release step.
    retryClaimedAt: timestamp('retry_claimed_at', { withTimezone: true }),
    masteredAt: timestamp('mastered_at', { withTimezone: true }),
    // Persisted TERMINAL FAILURE signal for curriculum topic generation. We
    // deliberately persist only the failure terminal and DERIVE everything
    // transient: `topics_generated=true` already means "ready", and "preparing"
    // is simply (not generated AND not failed). Persisting a `generating`/`pending`
    // flag would be liveness-coupled — a worker that dies mid-flight (deploy,
    // timeout, OOM, the Inngest SDK-block stale-deploy trap this repo has hit)
    // would strand the row "in progress" forever with no reconciler, re-creating
    // the exact "stuck looks like in-progress" disease in the DB. Failure is
    // monotonic and self-healing instead: set when generation terminally fails,
    // cleared on the next retry-claim / successful (re)generation.
    //
    // `failed_at` is the signal (NOT NULL ⟺ terminally failed while not
    // generated); `failed_reason` is observability metadata ('empty_topics',
    // 'generation_error'). NOTE: consent-blocked is intentionally NOT recorded
    // here — a consent-gated curriculum is not broken, it is waiting on the
    // identity-v2 consent gate (a different domain); calling it "failed" would
    // offer a Retry button that cannot fix a parent-consent problem.
    failedReason: text('failed_reason'),
    failedAt: timestamp('failed_at', { withTimezone: true }),
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
      table.sortOrder,
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
  ],
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
    sourceChildProfileId: uuid('source_child_profile_id').references(
      () => person.id,
      { onDelete: 'set null' },
    ),
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
      table.sortOrder,
    ),
    index('curriculum_topics_book_id_idx').on(table.bookId),
    index('idx_curriculum_topics_source_child')
      .on(table.sourceChildProfileId)
      .where(sql`${table.sourceChildProfileId} IS NOT NULL`),
    // [CR-FIL-DEDUP-INDEX-12] Concurrent-write dedup. Defined in migration
    // 0043_topic_dedup_unique_index.sql as
    //   CREATE UNIQUE INDEX curriculum_topics_book_title_lower_uq
    //     ON curriculum_topics (book_id, lower(title))
    // — drizzle's index() builder does not support expression-based
    // indexes (lower(title)), so this lives in raw SQL only. DO NOT add
    // a uniqueIndex(...) here without the lower() expression; it would
    // be a different index and would not enforce the dedup contract.
    // The migration is the source of truth; this comment is a pointer.
  ],
);

export const topicConnections = pgTable(
  'topic_connections',
  {
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
  },
  // [BUG-393] FK indexes — `topic_a_id` and `topic_b_id` are used in the
  // hot-path read at `services/curriculum.ts:1095-1096` (resolving
  // connection edges by either side via `inArray`). Without indexes the
  // planner falls back to a sequential scan whose cost grows with TOTAL
  // table size, not per-profile. Both directions are queried so both
  // columns need their own index.
  (table) => [
    index('topic_connections_topic_a_id_idx').on(table.topicAId),
    index('topic_connections_topic_b_id_idx').on(table.topicBId),
  ],
);

// [BUG-226 / P3] topic_connections has NO profileId column and no RLS policy.
// Ownership today is enforced TRANSITIVELY via the parent chain:
//   topic_connections.topic_a_id → curriculum_topics
//   topic_connections.topic_b_id → curriculum_topics
//   curriculum_topics.book_id    → curriculum_books
//   curriculum_books.subject_id  → subjects
//   subjects.profile_id          → person.id
//
// Every reader MUST resolve topicIds via the profile-scoped curriculum_topics
// path BEFORE querying topic_connections (canonical example:
//   apps/api/src/services/curriculum.ts:1080-1098 — filters by topicIds that
//   were themselves resolved through a profile-scoped curriculum read).
//
// Direct reads against topic_connections without a parent-chain pre-filter
// are forbidden and would leak cross-profile connection edges.
//
// Status as of 2026-05-18 (Worker W15 — packages/database review):
//   • All current readers go through the parent chain (verified via grep).
//   • No new RLS migration is shipped in this batch — adding profileId would
//     require: (1) a backfill from topic_a_id → topics → books → subjects,
//     (2) a check constraint that topic_a and topic_b share the same
//     profileId (no cross-profile edges), (3) an RLS policy mirroring
//     subjects'. Migration is non-trivial and product-shaped (cross-profile
//     "shared curriculum" features could change the answer).
//
// Path forward (deferred to a dedicated migration):
//   1. ALTER TABLE topic_connections ADD COLUMN profile_id uuid;
//   2. UPDATE topic_connections SET profile_id = (
//        SELECT s.profile_id FROM curriculum_topics t
//          JOIN curriculum_books b ON b.id = t.book_id
//          JOIN subjects s ON s.id = b.subject_id
//          WHERE t.id = topic_a_id
//      );
//   3. ALTER TABLE topic_connections ALTER COLUMN profile_id SET NOT NULL,
//                                    ADD CONSTRAINT topic_connections_same_profile
//                                      CHECK (...) — requires fn or trigger.
//   4. ALTER TABLE topic_connections ENABLE ROW LEVEL SECURITY;
//   5. CREATE POLICY topic_connections_profile_isolation ON topic_connections
//        USING (profile_id = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);

export const curriculumAdaptations = pgTable(
  'curriculum_adaptations',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
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
  },
  // [BUG-393] FK indexes — `profile_id` is the scoped-repo read predicate
  // (`packages/database/src/repository.ts:353-361`). `subject_id` and
  // `topic_id` carry FK constraints that fire cascade deletes when the
  // parent row is removed — without indexes each cascade probe is a
  // sequential scan over the full adaptations table.
  (table) => [
    index('curriculum_adaptations_profile_id_idx').on(table.profileId),
    index('curriculum_adaptations_subject_id_idx').on(table.subjectId),
    index('curriculum_adaptations_topic_id_idx').on(table.topicId),
  ],
);

export const bookSuggestionCategoryEnum = pgEnum('book_suggestion_category', [
  'related',
  'explore',
]);

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
    category: bookSuggestionCategoryEnum('category'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    pickedAt: timestamp('picked_at', { withTimezone: true }),
  },
  (table) => [
    index('book_suggestions_subject_id_idx').on(table.subjectId),
    // Race-safe dedup: partial unique index on (subject_id, lower(title))
    // WHERE picked_at IS NULL is declared in the generated migration only —
    // drizzle's index() builder does not support expression-based indexes
    // with a WHERE predicate. Migration name:
    //   0070_omniscient_landau.sql
    // index name: book_suggestions_subject_title_unique_unpicked
  ],
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
  (table) => [index('topic_suggestions_book_id_idx').on(table.bookId)],
);
