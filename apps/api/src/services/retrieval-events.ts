// ---------------------------------------------------------------------------
// Retrieval events service — append-only recall log (review-continuity Flow 2).
//
// `RecallGrade` is the honest grading contract: the LLM grader either produces
// a structured verdict (`graded: true`) or is unavailable (`graded: false`).
// There is no third "guessed a passing score" state — callers MUST handle the
// fallback explicitly instead of advancing SM-2 on a fabricated number.
// ---------------------------------------------------------------------------

import { retrievalEvents, type Database } from '@eduagent/database';

export type RetrievalVerdict =
  | 'solid'
  | 'partial'
  | 'missing'
  | 'misconception';

export type RetrievalNextAction =
  | 'advance'
  | 'reschedule_soon'
  | 'relearn'
  | 'redirect_to_library';

export type RetrievalGrader = 'llm' | 'fallback_heuristic';

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
    }
  | { graded: false; gradedBy: 'fallback_heuristic' };

export interface RecordRetrievalEventInput {
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
 * Append one row to the recall log. Caller-facing failures are the caller's
 * responsibility: at non-core sites wrap this in `safeWrite` so a log failure
 * never breaks the learner's action.
 */
export async function recordRetrievalEvent(
  db: Database,
  input: RecordRetrievalEventInput,
): Promise<void> {
  await db.insert(retrievalEvents).values({
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
  });
}
