import { and, asc, eq, gt, ilike, or, sql } from 'drizzle-orm';
import {
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  retentionCards,
  sessionEvents,
  type Database,
} from '@eduagent/database';
import { learnerRecapResponseSchema } from '@eduagent/schemas';
import { extractFirstJsonObject, routeAndCall } from './llm';
import { createLogger } from './logger';

const logger = createLogger();

interface RecapInput {
  sessionId: string;
  profileId: string;
  topicId: string | null;
  subjectId: string;
  exchangeCount: number;
  birthYear: number | null;
}

export interface LearnerRecapResult {
  closingLine: string;
  learnerRecap: string;
  nextTopicId: string | null;
  nextTopicReason: string | null;
}

interface TopicSuggestion {
  id: string;
  title: string;
}

export function getAgeVoiceTierLabel(birthYear: number | null): string {
  if (birthYear == null) return 'teen (14-17): peer-adjacent, brief, sharp';

  const age = new Date().getFullYear() - birthYear;
  return age < 14
    ? 'early teen (11-13): friendly, concrete, warm'
    : 'teen (14-17): peer-adjacent, brief, sharp';
}

export function buildRecapPrompt(
  ageVoiceTier: string,
  nextTopicTitle: string | null
): string {
  const basePrompt = [
    'You are reviewing a completed tutoring session transcript for a learner.',
    'Return exactly one JSON object with this shape:',
    '{ "closingLine": string, "takeaways": string[], "nextTopicReason": string | null }',
    '',
    'closingLine rules:',
    '- One sentence that mirrors what the learner specifically did in this session',
    '- Mention the concept or skill they worked through',
    '- Not a grade and not generic praise',
    `- Tone: ${ageVoiceTier}`,
    '- Max 150 characters',
    '',
    'takeaways rules:',
    '- 2 to 4 items',
    '- Each item is a single sentence in second person',
    '- Each item names a specific concept, connection, or skill from the transcript',
    '- No markdown bullets in the JSON; return plain strings',
    `- Tone: ${ageVoiceTier}`,
    '- Max 200 characters per item',
  ];

  if (!nextTopicTitle) {
    basePrompt.push(
      '',
      'Set nextTopicReason to null because no next topic is provided.'
    );
    return basePrompt.join('\n');
  }

  basePrompt.push(
    '',
    `A likely next topic is "${nextTopicTitle}".`,
    'If the connection is genuinely clear, set nextTopicReason to one sentence explaining why it follows from this session.',
    'If the connection is weak or unclear, set nextTopicReason to null.',
    'Max 120 characters for nextTopicReason.'
  );

  return basePrompt.join('\n');
}

export async function resolveNextTopic(
  db: Database,
  profileId: string,
  topicId: string
): Promise<TopicSuggestion | null> {
  const [currentTopic] = await db
    .select({
      bookId: curriculumTopics.bookId,
      sortOrder: curriculumTopics.sortOrder,
    })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.id, topicId))
    .limit(1);

  if (!currentTopic) {
    return null;
  }

  const completedByRetention = await db
    .select({ topicId: retentionCards.topicId })
    .from(retentionCards)
    .where(eq(retentionCards.profileId, profileId));

  const completedBySession = await db
    .select({ topicId: learningSessions.topicId })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        sql`${learningSessions.topicId} IS NOT NULL`
      )
    );

  const completedTopicIds = new Set(
    [
      ...completedByRetention.map((row) => row.topicId),
      ...completedBySession.map((row) => row.topicId).filter(Boolean),
    ].filter((value): value is string => typeof value === 'string')
  );

  const candidates = await db
    .select({
      id: curriculumTopics.id,
      title: curriculumTopics.title,
    })
    .from(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.bookId, currentTopic.bookId),
        gt(curriculumTopics.sortOrder, currentTopic.sortOrder)
      )
    )
    .orderBy(asc(curriculumTopics.sortOrder));

  return (
    candidates.find((candidate) => !completedTopicIds.has(candidate.id)) ?? null
  );
}

export async function matchFreeformTopic(
  db: Database,
  subjectId: string,
  takeaways: string[]
): Promise<TopicSuggestion | null> {
  const stopWords = new Set([
    'about',
    'after',
    'back',
    'because',
    'connected',
    'explored',
    'figured',
    'from',
    'into',
    'just',
    'learned',
    'through',
    'with',
    'worked',
    'your',
    'you',
  ]);

  const keywords = [
    ...new Set(
      takeaways
        .flatMap((takeaway) => takeaway.split(/\s+/))
        .map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter((word) => word.length >= 4 && !stopWords.has(word))
    ),
  ].slice(0, 5);

  if (keywords.length === 0) {
    return null;
  }

  const matches = await db
    .select({
      id: curriculumTopics.id,
      title: curriculumTopics.title,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .where(
      and(
        eq(curriculumBooks.subjectId, subjectId),
        or(
          ...keywords.map((keyword) =>
            ilike(curriculumTopics.title, `%${keyword}%`)
          )
        )
      )
    )
    .limit(3);

  if (matches.length !== 1) {
    return matches.length > 0 ? matches[0] ?? null : null;
  }

  return matches[0] ?? null;
}

export async function generateLearnerRecap(
  db: Database,
  input: RecapInput
): Promise<LearnerRecapResult | null> {
  if (input.exchangeCount < 3) {
    return null;
  }

  const transcriptEvents = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, input.sessionId),
      eq(sessionEvents.profileId, input.profileId)
    ),
    orderBy: asc(sessionEvents.createdAt),
    columns: {
      eventType: true,
      content: true,
    },
  });

  const transcriptTurns = transcriptEvents.filter(
    (event) =>
      event.eventType === 'user_message' || event.eventType === 'ai_response'
  );

  if (transcriptTurns.length < 4) {
    return null;
  }

  const transcriptText = transcriptTurns
    .map(
      (event) =>
        `${event.eventType === 'user_message' ? 'Student' : 'Mentor'}: ${
          event.content
        }`
    )
    .join('\n\n');

  let nextTopic = input.topicId
    ? await resolveNextTopic(db, input.profileId, input.topicId)
    : null;

  const result = await routeAndCall(
    [
      {
        role: 'system',
        content: buildRecapPrompt(
          getAgeVoiceTierLabel(input.birthYear),
          nextTopic?.title ?? null
        ),
      },
      { role: 'user', content: transcriptText },
    ],
    1
  );

  const jsonObject = extractFirstJsonObject(result.response);
  if (!jsonObject) {
    logger.warn('Learner recap JSON extraction failed', {
      sessionId: input.sessionId,
      provider: result.provider,
      model: result.model,
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonObject);
  } catch (error) {
    logger.warn('Learner recap JSON parse failed', {
      sessionId: input.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const validated = learnerRecapResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger.warn('Learner recap schema validation failed', {
      sessionId: input.sessionId,
      error: validated.error.message,
    });
    return null;
  }

  const { closingLine, takeaways, nextTopicReason } = validated.data;

  if (!input.topicId && !nextTopic) {
    nextTopic = await matchFreeformTopic(db, input.subjectId, takeaways);
  }

  return {
    closingLine,
    learnerRecap: takeaways.map((takeaway) => `- ${takeaway}`).join('\n'),
    nextTopicId: nextTopic?.id ?? null,
    nextTopicReason: input.topicId ? nextTopicReason ?? null : null,
  };
}
