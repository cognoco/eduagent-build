import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { generateUUIDv7 } from '../utils/uuid';
import { person } from './identity';
import { learningSessions, sessionEvents } from './sessions';
import { curriculumTopics, subjects } from './subjects';

export const mentorNoticeStatusEnum = pgEnum('mentor_notice_status', [
  'open',
  'locked_in',
  'dismissed',
  'faded',
]);

export const mentorNoticeNudgeStatusEnum = pgEnum(
  'mentor_notice_nudge_status',
  ['pending', 'sent', 'skipped', 'suppressed'],
);

export const mentorNoticeRecheckOutcomeEnum = pgEnum(
  'mentor_notice_recheck_outcome',
  ['locked_in', 'not_yet', 'dismissed', 'deferred'],
);

export const mentorNotices = pgTable(
  'mentor_notices',
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
    topicId: uuid('topic_id').references(() => curriculumTopics.id, {
      onDelete: 'set null',
    }),
    sourceSessionId: uuid('source_session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    // [WI-2500] The validated learner-answer event this notice's evidence is
    // anchored to. Nullable only because rows created before this column
    // existed have no honest value to backfill (their original evidence was
    // never persisted) — every new notice always carries one; see state.ts's
    // acceptMentorNotice. Never null-able as a domain matter, only as a
    // migration-safety one.
    answerEventId: uuid('answer_event_id').references(() => sessionEvents.id, {
      onDelete: 'set null',
    }),
    concept: text('concept').notNull(),
    correctionHint: text('correction_hint'),
    status: mentorNoticeStatusEnum('status').notNull().default('open'),
    lastOfferedSessionId: uuid('last_offered_session_id').references(
      () => learningSessions.id,
      { onDelete: 'set null' },
    ),
    lastOfferedAt: timestamp('last_offered_at', { withTimezone: true }),
    lastDeferredAt: timestamp('last_deferred_at', { withTimezone: true }),
    offerCount: integer('offer_count').notNull().default(0),
    recheckAttemptCount: integer('recheck_attempt_count').notNull().default(0),
    firstRecheckAt: timestamp('first_recheck_at', { withTimezone: true }),
    lastRecheckAt: timestamp('last_recheck_at', { withTimezone: true }),
    lastRecheckOutcome: mentorNoticeRecheckOutcomeEnum('last_recheck_outcome'),
    nudgeStatus: mentorNoticeNudgeStatusEnum('nudge_status')
      .notNull()
      .default('pending'),
    nudgedAt: timestamp('nudged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    // [WI-2500] Composite, evidence-aware replacement for the old
    // source-session-only unique constraint (clause 4 — durable identity
    // includes source session PLUS validated answer-event evidence). Postgres
    // compares NULLs as equal under nullsNotDistinct() for the WHOLE tuple,
    // not per column, so a legacy NULL-evidence row only collides with
    // ANOTHER NULL-evidence row in the SAME session — exactly the invariant
    // the old constraint already enforced, so no backfill is needed. A retry
    // of the same (session, answerEventId) is idempotent; a second,
    // differently-evidenced notice in the same session is now allowed.
    unique('mentor_notices_source_session_answer_event_unique')
      .on(table.sourceSessionId, table.answerEventId)
      .nullsNotDistinct(),
    index('mentor_notices_profile_status_created_idx').on(
      table.profileId,
      table.status,
      table.createdAt,
    ),
    index('mentor_notices_subject_status_created_idx').on(
      table.subjectId,
      table.status,
      table.createdAt,
    ),
    index('mentor_notices_topic_id_idx').on(table.topicId),
    index('mentor_notices_last_offered_session_id_idx').on(
      table.lastOfferedSessionId,
    ),
    check(
      'mentor_notices_offer_count_nonnegative',
      sql`${table.offerCount} >= 0`,
    ),
    check(
      'mentor_notices_recheck_attempt_count_nonnegative',
      sql`${table.recheckAttemptCount} >= 0`,
    ),
  ],
).enableRLS();
