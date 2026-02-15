import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Parking Lot Management — Story 2.9
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Context for the parking lot feature */
export interface ParkingLotContext {
  sessionId: string;
  topicId?: string;
}

/** A single parked question */
export interface ParkingLotEntry {
  question: string;
  sessionId: string;
  topicId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum parked questions per topic */
export const MAX_PARKING_LOT_PER_TOPIC = 10;

// ---------------------------------------------------------------------------
// System prompt for tangent detection
// ---------------------------------------------------------------------------

const TANGENT_DETECTION_PROMPT = `You are a topic-relevance classifier. Given a current topic title and a learner's message, determine if the message is tangential (off-topic) or relevant.

A message is tangential if it:
- Asks about a completely different subject
- Introduces a new concept unrelated to the current topic
- Is a curiosity question that would derail the current lesson

A message is NOT tangential if it:
- Is related to the current topic even if it extends slightly
- Asks for clarification about the current material
- Builds on what was just discussed

Respond with ONLY "tangential" or "relevant" (one word, lowercase).`;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Determines whether a learner's message is tangential to the current topic.
 *
 * Uses routeAndCall with rung 1 (Gemini Flash is sufficient for classification).
 * Returns true if the question should be parked for later.
 */
export async function shouldParkQuestion(
  message: string,
  currentTopicTitle: string
): Promise<boolean> {
  const messages: ChatMessage[] = [
    { role: 'system', content: TANGENT_DETECTION_PROMPT },
    {
      role: 'user',
      content:
        `Current topic: ${currentTopicTitle}\n\n` +
        `Learner's message: ${message}`,
    },
  ];

  const result = await routeAndCall(messages, 1);
  const answer = result.response.toLowerCase().trim();

  return answer.includes('tangential');
}

/**
 * Formats parked questions for inclusion in prompt context.
 *
 * Returns a structured text block that can be injected into the system prompt
 * to remind the AI (and learner) of parked questions.
 */
export function formatParkedQuestionForContext(
  questions: Array<{ question: string }>
): string {
  if (questions.length === 0) {
    return '';
  }

  const lines = [
    'Parking Lot — questions the learner asked that are saved for later:',
  ];

  const limited = questions.slice(0, MAX_PARKING_LOT_PER_TOPIC);
  for (let i = 0; i < limited.length; i++) {
    lines.push(`${i + 1}. ${limited[i].question}`);
  }

  if (questions.length > MAX_PARKING_LOT_PER_TOPIC) {
    lines.push(
      `(${
        questions.length - MAX_PARKING_LOT_PER_TOPIC
      } additional questions not shown)`
    );
  }

  lines.push(
    '',
    'You may reference these when relevant, or suggest exploring them after the current topic.'
  );

  return lines.join('\n');
}
