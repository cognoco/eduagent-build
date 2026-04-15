import {
  createScopedRepository,
  sessionSummaries,
  type Database,
} from '@eduagent/database';
import { and, eq } from 'drizzle-orm';
import type { SummaryStatus } from '@eduagent/schemas';
import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Summary Production & Evaluation — Story 2.8
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Result of evaluating a learner's "Your Words" summary */
export interface SummaryEvaluation {
  feedback: string;
  hasUnderstandingGaps: boolean;
  gapAreas?: string[];
  isAccepted: boolean;
}

type SessionSummaryRow = typeof sessionSummaries.$inferSelect;

const SUMMARY_STATUS_PRIORITY: Record<SummaryStatus, number> = {
  pending: 0,
  auto_closed: 1,
  skipped: 2,
  submitted: 3,
  accepted: 4,
};

async function findSessionSummaryRow(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<SessionSummaryRow | undefined> {
  const repo = createScopedRepository(db, profileId);
  return repo.sessionSummaries.findFirst(
    eq(sessionSummaries.sessionId, sessionId)
  );
}

function mergeSummaryStatus(
  existingStatus: SummaryStatus,
  incomingStatus: SummaryStatus
): SummaryStatus {
  return SUMMARY_STATUS_PRIORITY[incomingStatus] >
    SUMMARY_STATUS_PRIORITY[existingStatus]
    ? incomingStatus
    : existingStatus;
}

// ---------------------------------------------------------------------------
// System prompt for summary evaluation
// ---------------------------------------------------------------------------

const SUMMARY_EVAL_SYSTEM_PROMPT = `You are MentoMate's summary evaluator. A learner has written a summary of what they learned about a topic.

Your job is to evaluate the summary for understanding and completeness.

Rules:
- NEVER use the words "wrong", "incorrect", or "mistake".
- Use "Not yet" framing — if the learner missed something, they haven't got it *yet*.
- Acknowledge what the learner got right before noting gaps.
- Be encouraging and specific.

Respond in this exact JSON format:
{
  "feedback": "Your feedback to the learner (2-4 sentences)",
  "hasUnderstandingGaps": true/false,
  "gapAreas": ["area 1", "area 2"] or [],
  "isAccepted": true/false
}

Set isAccepted to true if the summary demonstrates reasonable understanding, even if not perfect.
Set hasUnderstandingGaps to true if there are significant conceptual misunderstandings or major omissions.
List specific gap areas only if hasUnderstandingGaps is true.`;

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Evaluates a learner's summary of a topic.
 *
 * Uses routeAndCall with rung 2 (Gemini Flash is sufficient for evaluation).
 * Returns structured feedback with gap detection.
 */
export async function evaluateSummary(
  topicTitle: string,
  topicDescription: string,
  summary: string
): Promise<SummaryEvaluation> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SUMMARY_EVAL_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Topic: ${topicTitle}\n` +
        `Topic description: ${topicDescription}\n\n` +
        `Learner's summary:\n${summary}`,
    },
  ];

  const result = await routeAndCall(messages, 2);

  return parseSummaryEvaluation(result.response);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Parses the LLM response into a SummaryEvaluation.
 * Falls back to a graceful default if JSON parsing fails.
 */
function parseSummaryEvaluation(response: string): SummaryEvaluation {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        feedback: String(parsed.feedback ?? response),
        hasUnderstandingGaps: Boolean(parsed.hasUnderstandingGaps),
        gapAreas: Array.isArray(parsed.gapAreas) ? parsed.gapAreas : undefined,
        isAccepted: Boolean(parsed.isAccepted),
      };
    }
  } catch {
    // Fall through to default
  }

  // Fallback — LLM response was unparseable. Do NOT accept — the summary was
  // not actually evaluated. isAccepted=false is consistent with the feedback:
  // the submission was saved but evaluation is unavailable (no contradictory checkmark).
  return {
    feedback:
      "Your summary was saved. We couldn't provide AI feedback right now — you can try submitting again.",
    hasUnderstandingGaps: false,
    isAccepted: false,
  };
}

// ---------------------------------------------------------------------------
// DB-aware session summary creation (used by inngest/functions/session-completed.ts)
// ---------------------------------------------------------------------------

/**
 * Creates a pending session summary record.
 * The LLM-generated feedback is filled in later when routeAndCall() is wired.
 */
export async function createPendingSessionSummary(
  db: Database,
  sessionId: string,
  profileId: string,
  topicId: string | null,
  status: SummaryStatus
): Promise<SessionSummaryRow> {
  const existing = await findSessionSummaryRow(db, profileId, sessionId);

  if (!existing) {
    const [row] = await db
      .insert(sessionSummaries)
      .values({
        sessionId,
        profileId,
        topicId: topicId ?? null,
        status,
        content: null,
        aiFeedback: null,
      })
      .returning();

    if (!row) throw new Error('Insert session summary did not return a row');
    return row;
  }

  const nextStatus = mergeSummaryStatus(existing.status, status);
  const nextTopicId = existing.topicId ?? topicId ?? null;
  const now = new Date();

  if (existing.status !== nextStatus || existing.topicId !== nextTopicId) {
    await db
      .update(sessionSummaries)
      .set({
        topicId: nextTopicId,
        status: nextStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(sessionSummaries.id, existing.id),
          eq(sessionSummaries.profileId, profileId)
        )
      );
  }

  return {
    ...existing,
    topicId: nextTopicId,
    status: nextStatus,
    updatedAt: now,
  };
}
