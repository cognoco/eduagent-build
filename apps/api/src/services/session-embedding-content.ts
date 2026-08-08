// ---------------------------------------------------------------------------
// Session-embedding content — WI-3141
//
// The single source of the text that is allowed into
// `session_embeddings.content`. It is deliberately NOT the transcript.
// `session_embeddings` is a queryable, long-lived index; a verbatim learner
// transcript in it re-persists every special-category or safeguarding
// disclosure the learner made, in a second location beyond `session_events`
// (docs/compliance/memory-unlock-package/a5-art9-suppression.md, Gap 5).
//
// The summary-safe form built here is the SAME form the 30-day transcript
// purge rewrites the row to. `buildSummaryEmbeddingText` was moved out of
// transcript-purge.ts into this module precisely so the initial write and the
// purge rewrite share one definition and cannot drift apart.
//
// ---------------------------------------------------------------------------
// Ordering design (why reading the summary at embed time is sound)
// ---------------------------------------------------------------------------
// `session-completed` populates the summary before it embeds, in four
// sequentially awaited steps of the same Inngest function:
//
//   write-coaching-card      creates the session_summaries row
//                            (createPendingSessionSummary)
//   generate-learner-recap   writes learner_recap
//   generate-llm-summary     writes llm_summary
//   generate-embeddings      <- reads them back through this module
//
// So on the happy path the summary-safe form is available by the time the
// embedding is written, and no extra wait, sleep or event hop is needed.
//
// Every one of those upstream steps is soft (`runIsolated` / try-catch), so
// the summary can still be absent or partial. When it is, the caller must
// FAIL CLOSED — write no embedding row at all. There is no raw-transcript
// fallback anywhere: a missing summary means a missing row, never a raw one.
// The row is written later by the daily catch-up
// (inngest/functions/session-embedding-backfill.ts), which runs after the
// summary-reconciliation cron has repaired the summary.
// ---------------------------------------------------------------------------

import { and, eq } from 'drizzle-orm';
import { sessionSummaries, type Database } from '@eduagent/database';
import { llmSummarySchema, type LlmSummary } from '@eduagent/schemas';

export function buildSummaryEmbeddingText(
  summary: LlmSummary,
  learnerRecap: string | null,
): string {
  const lines = [
    `Narrative: ${summary.narrative}`,
    `Topics: ${summary.topicsCovered.join(', ')}`,
    `Session state: ${summary.sessionState}`,
  ];
  if (learnerRecap) {
    lines.push(`Learner recap: ${learnerRecap}`);
  }
  lines.push(`Resume here: ${summary.reEntryRecommendation}`);
  return lines.join('\n');
}

/**
 * Why the summary-safe form could not be built. Every reason is a fail-closed
 * outcome for the caller — none of them licenses writing raw text instead.
 */
export type SummarySafeContentUnavailableReason =
  | 'summary_missing'
  | 'missing_llm_summary'
  | 'invalid_llm_summary'
  | 'already_purged';

export type SummarySafeEmbeddingContent =
  | { status: 'ok'; content: string; topicId: string | null }
  | { status: 'unavailable'; reason: SummarySafeContentUnavailableReason };

/**
 * Builds the summary-safe embedding text for one session, or reports why it
 * cannot be built yet.
 *
 * A valid `llm_summary` is the requirement; `learner_recap` is included when
 * present and omitted when not. The purge insists on both because it is the
 * last rewrite that row will ever get, but the initial write must not: the
 * recap needs at least four transcript turns
 * (`generateLearnerRecap`, services/session-recap.ts), so requiring it would
 * leave every short session permanently unembedded — the deferral would never
 * resolve. `llm_summary` alone is abstractive LLM prose about the session, so
 * the summary-safety property does not depend on the recap line.
 *
 * `already_purged` is reported rather than rebuilt: the purge has itself
 * written the summary-derived row, so re-embedding would only spend a Voyage
 * call to produce the same content.
 */
export async function loadSummarySafeEmbeddingContent(
  db: Database,
  sessionId: string,
  profileId: string,
): Promise<SummarySafeEmbeddingContent> {
  const row = await db.query.sessionSummaries.findFirst({
    where: and(
      eq(sessionSummaries.sessionId, sessionId),
      eq(sessionSummaries.profileId, profileId),
    ),
    columns: {
      topicId: true,
      llmSummary: true,
      learnerRecap: true,
      purgedAt: true,
    },
  });

  if (!row) {
    return { status: 'unavailable', reason: 'summary_missing' };
  }
  if (row.purgedAt) {
    return { status: 'unavailable', reason: 'already_purged' };
  }
  if (row.llmSummary == null) {
    return { status: 'unavailable', reason: 'missing_llm_summary' };
  }

  const parsed = llmSummarySchema.safeParse(row.llmSummary);
  if (!parsed.success) {
    return { status: 'unavailable', reason: 'invalid_llm_summary' };
  }

  return {
    status: 'ok',
    content: buildSummaryEmbeddingText(parsed.data, row.learnerRecap ?? null),
    topicId: row.topicId ?? null,
  };
}
