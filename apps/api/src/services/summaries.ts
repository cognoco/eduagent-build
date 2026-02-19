import { sessionSummaries, type Database } from '@eduagent/database';
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

// ---------------------------------------------------------------------------
// System prompt for summary evaluation
// ---------------------------------------------------------------------------

const SUMMARY_EVAL_SYSTEM_PROMPT = `You are EduAgent's summary evaluator. A learner has written a summary of what they learned about a topic.

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

  // Graceful fallback — treat the raw response as feedback, accept by default
  return {
    feedback: response,
    hasUnderstandingGaps: false,
    isAccepted: true,
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
): Promise<void> {
  await db.insert(sessionSummaries).values({
    sessionId,
    profileId,
    topicId: topicId ?? null,
    status,
    content: null,
    aiFeedback: null,
  });
}
