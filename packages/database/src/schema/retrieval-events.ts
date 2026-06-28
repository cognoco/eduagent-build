import {
  pgTable,
  uuid,
  smallint,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { subjects, curriculumTopics } from './subjects';
import { learningSessions } from './sessions';
import { generateUUIDv7 } from '../utils/uuid';

// ---------------------------------------------------------------------------
// Retrieval events — append-only recall log (review-continuity Flow 2 / RR-9).
//
// One row per graded recall attempt. Captures the honest grading outcome
// (or an explicit fallback marker when the LLM grader was unavailable — never
// a fabricated advancing score). EU-3: free text + structured fields are
// TTL'd together at 37 days by retrieval-events-retention-cron (whole-row
// delete; nothing durable on a minor).
// ---------------------------------------------------------------------------

export const retrievalVerdictEnum = pgEnum('retrieval_verdict', [
  'solid',
  'partial',
  'missing',
  'misconception',
]);

export const retrievalNextActionEnum = pgEnum('retrieval_next_action', [
  'advance',
  'reschedule_soon',
  // Reserved forward-compat value: no producer yet. The current write sites
  // (retention-data.ts, review-calibration-grade.ts) only ever emit the other
  // three. A future relearn-routing flow (RR queue → dedicated relearn action)
  // will activate it; kept in the enum now so that flow needs no DB migration.
  // Activating plan: docs/plans/2026-06-27-recall-log-and-merged-relearn-queue.md
  'relearn',
  'redirect_to_library',
]);

export const retrievalGraderEnum = pgEnum('retrieval_grader', [
  'llm',
  'fallback_heuristic',
]);

export const retrievalEvents = pgTable(
  'retrieval_events',
  {
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
    // Permanent log, not session-owned: if the session is deleted the recall
    // record survives with a null pointer (set null, not cascade).
    sessionId: uuid('session_id').references(() => learningSessions.id, {
      onDelete: 'set null',
    }),
    // Opaque reference to the learner-answer session_events row. No FK — the
    // referenced event may be transcript-purged before this row is TTL'd.
    answerEventId: uuid('answer_event_id'),
    promptText: text('prompt_text').notNull(),
    learnerAnswer: text('learner_answer').notNull(),
    // Nullable: a fallback_heuristic row has no graded quality/verdict.
    quality: smallint('quality'),
    verdict: retrievalVerdictEnum('verdict'),
    nextAction: retrievalNextActionEnum('next_action').notNull(),
    gradedBy: retrievalGraderEnum('graded_by').notNull(),
    rubricRationale: text('rubric_rationale'),
    misconception: text('misconception'),
    evidenceUsed: jsonb('evidence_used')
      .notNull()
      .default([])
      .$type<string[]>(),
    llmRoutingRung: smallint('llm_routing_rung'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('retrieval_events_profile_topic_idx').on(
      table.profileId,
      table.topicId,
    ),
    index('retrieval_events_profile_created_idx').on(
      table.profileId,
      table.createdAt,
    ),
  ],
);
