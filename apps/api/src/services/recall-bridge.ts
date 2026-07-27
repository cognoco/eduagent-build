// ---------------------------------------------------------------------------
// Recall Bridge — Story 2.7 (UX-15)
// Brief recall warmup after homework success. Pure business logic, no Hono.
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  learningSessions,
  curriculumTopics,
  curriculumBooks,
  subjects,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  ConversationLanguage,
  RecallBridgeResult,
} from '@eduagent/schemas';
import { routeAndCall, type ChatMessage, type EscalationRung } from './llm';
import { sanitizeXmlValue } from './llm/sanitize';
import { getPersonAgeBracket } from './identity-v2/helpers';

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
  sessionId: string,
  options?: { conversationLanguage?: ConversationLanguage },
): Promise<RecallBridgeResult> {
  const repo = createScopedRepository(db, profileId);
  const session = await repo.sessions.findFirst(
    eq(learningSessions.id, sessionId),
  );

  if (!session || !session.topicId) {
    return { questions: [], topicId: '', topicTitle: '' };
  }

  // Scope through parent chain: curriculumTopics → curriculumBooks → subjects.
  // Defense-in-depth: session.topicId is already profile-owned (session was
  // fetched via scoped repo), but the DB query itself enforces profileId so
  // a bug in session creation can never silently leak a foreign topic into the
  // LLM prompt.
  const [topic] = await db
    .select({
      id: curriculumTopics.id,
      title: curriculumTopics.title,
      description: curriculumTopics.description,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
    .where(
      and(
        eq(curriculumTopics.id, session.topicId),
        eq(subjects.profileId, profileId),
      ),
    )
    .limit(1);

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
  // [WI-2432] This caller has no age data of its own (no options/context
  // threading it in) — source it the same way other identity-v2 callers do:
  // getPersonAgeBracket(db, profileId), the exact-date bracket helper built
  // for exactly this purpose (WI-367). Both db and profileId are already in
  // scope. Without this, the router's under-18 Gemini/Vertex vendor
  // exclusion can't fire for this flow on the legacy routing path.
  const ageBracket = await getPersonAgeBracket(db, profileId);
  const result = await routeAndCall(messages, rung, {
    flow: 'recall.bridge',
    sessionId,
    conversationLanguage: options?.conversationLanguage,
    ageBracket,
  });

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
  topicDescription: string,
): string {
  return (
    'You are MentoMate, a calm, clear tutor.\n\n' +
    'The learner just successfully solved a homework problem. ' +
    'Generate exactly 2 brief recall questions about the underlying concept.\n\n' +
    'Rules:\n' +
    '- Questions should test understanding of the METHOD, not the specific homework problem\n' +
    '- Keep questions short (1-2 sentences each)\n' +
    '- Frame positively — this is a celebration of their success\n' +
    '- Questions should be answerable in 1-2 sentences\n' +
    `- Topic: <topic_title>${sanitizeXmlValue(
      topicTitle,
      200,
    )}</topic_title>\n` +
    `- Description: <topic_description>${sanitizeXmlValue(
      topicDescription,
      500,
    )}</topic_description>\n\n` +
    'Return exactly 2 questions, one per line.'
  );
}
