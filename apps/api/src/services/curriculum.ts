import { eq, and, desc, asc } from 'drizzle-orm';
import {
  curricula,
  curriculumTopics,
  curriculumAdaptations,
  subjects,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { routeAndCall, type ChatMessage } from './llm';
import type {
  CurriculumInput,
  GeneratedTopic,
  Curriculum,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Curriculum generation service — pure business logic, no Hono imports
// ---------------------------------------------------------------------------

const CURRICULUM_SYSTEM_PROMPT = `You are EduAgent's curriculum designer. Based on the assessment interview,
generate a personalized learning curriculum. Return a JSON array of topics with this structure:
[{"title": "Topic Name", "description": "What the learner will learn", "relevance": "core|recommended|contemporary|emerging", "estimatedMinutes": 30}]
Order topics pedagogically. Include 8-15 topics.`;

export async function generateCurriculum(
  input: CurriculumInput
): Promise<GeneratedTopic[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: CURRICULUM_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Subject: ${input.subjectName}
Goals: ${input.goals.join(', ')}
Experience Level: ${input.experienceLevel}
Interview Summary: ${input.interviewSummary}`,
    },
  ];

  const result = await routeAndCall(messages, 2);

  // Parse the JSON response
  const jsonMatch = result.response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse curriculum from LLM response');
  }

  return JSON.parse(jsonMatch[0]) as GeneratedTopic[];
}

// ---------------------------------------------------------------------------
// Persistence types
// ---------------------------------------------------------------------------

// CurriculumWithTopics is now Curriculum from @eduagent/schemas

// ---------------------------------------------------------------------------
// Get the latest curriculum for a subject, with ownership verification
// ---------------------------------------------------------------------------

export async function getCurriculum(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<Curriculum | null> {
  // Verify subject belongs to profile via scoped repository
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return null;

  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) return null;

  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
    orderBy: asc(curriculumTopics.sortOrder),
  });

  return {
    id: curriculum.id,
    subjectId: curriculum.subjectId,
    version: curriculum.version,
    topics: topics.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      sortOrder: t.sortOrder,
      relevance: t.relevance,
      estimatedMinutes: t.estimatedMinutes,
      skipped: t.skipped,
    })),
    generatedAt: curriculum.generatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Skip a topic (with ownership verification)
// ---------------------------------------------------------------------------

export async function skipTopic(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<void> {
  // Verify ownership through scoped repository
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) throw new Error('Subject not found');

  // Verify topic belongs to this subject's curriculum
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) throw new Error('Curriculum not found');

  const topic = await db.query.curriculumTopics.findFirst({
    where: and(
      eq(curriculumTopics.id, topicId),
      eq(curriculumTopics.curriculumId, curriculum.id)
    ),
  });
  if (!topic) throw new Error('Topic not found in curriculum');

  await db
    .update(curriculumTopics)
    .set({
      skipped: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(curriculumTopics.id, topicId),
        eq(curriculumTopics.curriculumId, curriculum.id)
      )
    );

  // Record the adaptation
  await db.insert(curriculumAdaptations).values({
    profileId,
    subjectId,
    topicId,
    sortOrder: 0,
    skipReason: 'User skipped',
  });
}

// ---------------------------------------------------------------------------
// Challenge and regenerate a curriculum
// ---------------------------------------------------------------------------

export async function challengeCurriculum(
  db: Database,
  profileId: string,
  subjectId: string,
  feedback: string
): Promise<Curriculum> {
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) throw new Error('Subject not found');

  // Load current curriculum to determine new version
  const current = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });

  const newVersion = current ? current.version + 1 : 1;

  // Generate new curriculum with feedback
  const topics = await generateCurriculum({
    subjectName: subject.name,
    interviewSummary: feedback,
    goals: [],
    experienceLevel: 'intermediate',
  });

  const [newCurriculum] = await db
    .insert(curricula)
    .values({
      subjectId,
      version: newVersion,
    })
    .returning();

  if (topics.length > 0) {
    await db.insert(curriculumTopics).values(
      topics.map((t, i) => ({
        curriculumId: newCurriculum.id,
        title: t.title,
        description: t.description,
        sortOrder: i,
        relevance: t.relevance,
        estimatedMinutes: t.estimatedMinutes,
      }))
    );
  }

  // Return the newly generated curriculum
  const result = await getCurriculum(db, profileId, subjectId);
  if (!result) {
    throw new Error('Failed to retrieve generated curriculum');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Explain why a topic is in a given position
// ---------------------------------------------------------------------------

export async function explainTopicOrdering(
  db: Database,
  profileId: string,
  subjectId: string,
  topicId: string
): Promise<string> {
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) throw new Error('Subject not found');

  const topic = await db.query.curriculumTopics.findFirst({
    where: eq(curriculumTopics.id, topicId),
  });
  if (!topic) throw new Error('Topic not found');

  // Load surrounding topics for context
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });

  const allTopics = curriculum
    ? await db.query.curriculumTopics.findMany({
        where: eq(curriculumTopics.curriculumId, curriculum.id),
        orderBy: asc(curriculumTopics.sortOrder),
      })
    : [];

  const topicList = allTopics
    .map((t) => `${t.sortOrder + 1}. ${t.title}`)
    .join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are EduAgent, explaining why a topic appears at its position in a personalized curriculum. Be concise (2-3 sentences).',
    },
    {
      role: 'user',
      content: `Subject: ${
        subject.name
      }\nCurriculum order:\n${topicList}\n\nExplain why "${
        topic.title
      }" (position ${topic.sortOrder + 1}) is placed where it is.`,
    },
  ];

  const result = await routeAndCall(messages, 2);
  return result.response;
}
