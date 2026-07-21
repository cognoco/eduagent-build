// ---------------------------------------------------------------------------
// Retrieval events service — append-only recall log (review-continuity Flow 2).
//
// `RecallGrade` is the honest grading contract: the LLM grader either produces
// a structured verdict (`graded: true`) or is unavailable (`graded: false`).
// There is no third "guessed a passing score" state — callers MUST handle the
// fallback explicitly instead of advancing SM-2 on a fabricated number.
// ---------------------------------------------------------------------------

import {
  retrievalEvents,
  retrievalGraderEnum,
  retrievalNextActionEnum,
  retrievalVerdictEnum,
  type Database,
} from '@eduagent/database';
import type { RecallFeedback } from '@eduagent/schemas';

// Single-source the union types from the pgEnum tuples so adding a value to the
// schema can never silently drift from this service (the old hand-typed copies
// only surfaced a mismatch at runtime when the DB rejected the value).
export type RetrievalVerdict = (typeof retrievalVerdictEnum.enumValues)[number];

export type RetrievalNextAction =
  (typeof retrievalNextActionEnum.enumValues)[number];

export type RetrievalGrader = (typeof retrievalGraderEnum.enumValues)[number];

/**
 * The outcome of grading a recall answer.
 *
 * - `graded: true`  — the LLM grader returned a parseable verdict; `quality` is
 *   a real SM-2 grade (0–5) the caller may act on.
 * - `graded: false` — the grader was unavailable / unparseable. The caller MUST
 *   NOT advance SM-2 state; it records a `fallback_heuristic` row and either
 *   surfaces a retryable error (sync) or reschedules soon (async).
 */
export type RecallGrade =
  | {
      graded: true;
      quality: number;
      gradedBy: 'llm';
      verdict: RetrievalVerdict;
      rationale: string | null;
      misconception: string | null;
      rung: number | null;
      // [WI-2114] Answer-specific learner-facing feedback (mentor-prose in the
      // learner's conversation_language). null when the grader omitted it — the
      // caller then leaves response.feedback unset and the client falls back to
      // its generic copy.
      feedback: RecallFeedback | null;
    }
  | { graded: false; gradedBy: 'fallback_heuristic' };

export interface RecordRetrievalEventInput {
  /** Deterministic first-party receipt id for retry-safe call sites. */
  receiptId?: string;
  profileId: string;
  subjectId: string;
  topicId: string;
  /** Permanent log: null when the originating session was deleted. */
  sessionId?: string | null;
  /** Opaque session_events reference; no FK (may be transcript-purged). */
  answerEventId?: string | null;
  promptText: string;
  learnerAnswer: string;
  /** null for fallback_heuristic rows (no graded score). */
  quality?: number | null;
  verdict?: RetrievalVerdict | null;
  nextAction: RetrievalNextAction;
  gradedBy: RetrievalGrader;
  rubricRationale?: string | null;
  misconception?: string | null;
  evidenceUsed?: string[];
  llmRoutingRung?: number | null;
}

/**
 * Append one row to the recall log. Retry-safe callers may provide a receiptId;
 * the return is false when that receipt already exists and true when this call
 * inserted the row. Caller-facing failures are the caller's responsibility: at
 * non-core sites wrap this in `safeWrite` so a log failure never breaks the
 * learner's action.
 */
export async function recordRetrievalEvent(
  db: Database,
  input: RecordRetrievalEventInput,
): Promise<boolean> {
  const values = {
    ...(input.receiptId ? { id: input.receiptId } : {}),
    profileId: input.profileId,
    subjectId: input.subjectId,
    topicId: input.topicId,
    sessionId: input.sessionId ?? null,
    answerEventId: input.answerEventId ?? null,
    promptText: input.promptText,
    learnerAnswer: input.learnerAnswer,
    quality: input.quality ?? null,
    verdict: input.verdict ?? null,
    nextAction: input.nextAction,
    gradedBy: input.gradedBy,
    rubricRationale: input.rubricRationale ?? null,
    misconception: input.misconception ?? null,
    evidenceUsed: input.evidenceUsed ?? [],
    llmRoutingRung: input.llmRoutingRung ?? null,
  };

  if (!input.receiptId) {
    await db.insert(retrievalEvents).values(values);
    return true;
  }

  const inserted = await db
    .insert(retrievalEvents)
    .values(values)
    .onConflictDoNothing({ target: retrievalEvents.id })
    .returning({ id: retrievalEvents.id });
  return inserted.length === 1;
}
