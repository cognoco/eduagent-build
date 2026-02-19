// ---------------------------------------------------------------------------
// Recall Bridge — Story 2.7 (UX-15)
// Brief recall warmup after homework success. Pure business logic, no Hono.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  learningSessions,
  curriculumTopics,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type { RecallBridgeResult } from '@eduagent/schemas';
import { routeAndCall, type ChatMessage, type EscalationRung } from './llm';

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Generates 1-2 recall bridge questions for a homework session's topic.
 *
 * The recall bridge is a brief warmup on the underlying concept/method
 * after a learner successfully solves a homework problem. It's positioned
 * as a celebration, not extra work.
 *
 * Returns empty questions array if:
 * - Session has no topic
 * - Topic cannot be found
 */
export async function generateRecallBridge(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<RecallBridgeResult> {
  const repo = createScopedRepository(db, profileId);
  const session = await repo.sessions.findFirst(
    eq(learningSessions.id, sessionId)
  );

  if (!session || !session.topicId) {
    return { questions: [], topicId: '', topicTitle: '' };
  }

  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, session.topicId),
  });

  if (!topic) {
    return { questions: [], topicId: session.topicId, topicTitle: '' };
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildRecallBridgePrompt(topic.title, topic.description),
    },
    {
      role: 'user',
      content:
        'Generate recall bridge questions for this topic. Return ONLY the questions, one per line, no numbering or prefixes.',
    },
  ];

  const rung: EscalationRung = 1; // cheapest model — simple recall questions
  const result = await routeAndCall(messages, rung);

  const questions = result.response
    .split('\n')
    .map((q) => q.trim())
    .filter((q) => q.length > 0)
    .slice(0, 2); // max 2 questions

  return {
    questions,
    topicId: topic.id,
    topicTitle: topic.title,
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildRecallBridgePrompt(
  topicTitle: string,
  topicDescription: string
): string {
  return (
    'You are EduAgent, a personalised AI tutor.\n\n' +
    'The learner just successfully solved a homework problem. ' +
    'Generate exactly 2 brief recall questions about the underlying concept.\n\n' +
    'Rules:\n' +
    '- Questions should test understanding of the METHOD, not the specific homework problem\n' +
    '- Keep questions short (1-2 sentences each)\n' +
    '- Frame positively — this is a celebration of their success\n' +
    '- Questions should be answerable in 1-2 sentences\n' +
    `- Topic: ${topicTitle}\n` +
    `- Description: ${topicDescription}\n\n` +
    'Return exactly 2 questions, one per line.'
  );
}
