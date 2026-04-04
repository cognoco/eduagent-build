import { eq, and, desc, asc } from 'drizzle-orm';
import {
  curricula,
  curriculumTopics,
  curriculumAdaptations,
  subjects,
  onboardingDrafts,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { routeAndCall, type ChatMessage } from './llm';
import type {
  CurriculumInput,
  GeneratedTopic,
  Curriculum,
  CurriculumTopicAddInput,
  CurriculumTopicAddResponse,
  CurriculumTopicPreview,
  CurriculumAdaptRequest,
  CurriculumAdaptResponse,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Curriculum generation service — pure business logic, no Hono imports
// ---------------------------------------------------------------------------

const CURRICULUM_SYSTEM_PROMPT = `You are MentoMate's curriculum designer. Based on the assessment interview,
generate a personalized learning curriculum. Return a JSON array of topics with this structure:
[{"title": "Topic Name", "description": "What the learner will learn", "relevance": "core|recommended|contemporary|emerging", "estimatedMinutes": 30}]
Order topics pedagogically. Include 8-15 topics.`;

const ADD_TOPIC_PREVIEW_PROMPT = `You are helping a learner add one topic to an existing curriculum.
Given a subject name and the learner's rough topic idea, normalize it into a clear topic title,
write a short description, and estimate how long the topic should take.

Return ONLY JSON:
{"title":"Clear Topic Title","description":"Short learner-friendly description","estimatedMinutes":30}

Rules:
- Keep the title concise and specific
- Keep description under 120 characters
- estimatedMinutes must be an integer between 5 and 240
- Do not reject valid school topics just because they are niche`;

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

function fallbackTopicPreview(
  subjectName: string,
  rawTitle: string
): CurriculumTopicPreview {
  const normalizedTitle = rawTitle
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());

  return {
    title: normalizedTitle,
    description: `Study ${normalizedTitle} in ${subjectName} with guided practice.`,
    estimatedMinutes: 30,
  };
}

export async function previewCurriculumTopic(
  subjectName: string,
  rawTitle: string
): Promise<CurriculumTopicPreview> {
  const trimmedTitle = rawTitle.trim();
  const messages: ChatMessage[] = [
    { role: 'system', content: ADD_TOPIC_PREVIEW_PROMPT },
    {
      role: 'user',
      content: `Subject: ${subjectName}\nTopic idea: ${trimmedTitle}`,
    },
  ];

  try {
    const result = await routeAndCall(messages, 1);
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackTopicPreview(subjectName, trimmedTitle);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const preview = {
      title: String(parsed.title ?? trimmedTitle).trim(),
      description: String(parsed.description ?? '').trim(),
      estimatedMinutes: Number(parsed.estimatedMinutes ?? 30),
    };

    if (
      preview.title.length === 0 ||
      preview.description.length === 0 ||
      !Number.isFinite(preview.estimatedMinutes)
    ) {
      return fallbackTopicPreview(subjectName, trimmedTitle);
    }

    return {
      title: preview.title.slice(0, 200),
      description: preview.description.slice(0, 500),
      estimatedMinutes: Math.max(
        5,
        Math.min(240, Math.round(preview.estimatedMinutes))
      ),
    };
  } catch {
    return fallbackTopicPreview(subjectName, trimmedTitle);
  }
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
      source: t.source,
    })),
    generatedAt: curriculum.generatedAt.toISOString(),
  };
}

export async function addCurriculumTopic(
  db: Database,
  profileId: string,
  subjectId: string,
  input: CurriculumTopicAddInput
): Promise<CurriculumTopicAddResponse> {
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) throw new Error('Subject not found');

  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) throw new Error('Curriculum not found');

  if (input.mode === 'preview') {
    const preview = await previewCurriculumTopic(subject.name, input.title);
    return {
      mode: 'preview',
      preview,
    };
  }

  const existingTopics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
    orderBy: desc(curriculumTopics.sortOrder),
  });
  const nextSortOrder =
    existingTopics.length > 0 ? existingTopics[0]!.sortOrder + 1 : 0;

  const [createdTopic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum.id,
      title: input.title.trim(),
      description: input.description.trim(),
      sortOrder: nextSortOrder,
      relevance: 'recommended',
      source: 'user',
      estimatedMinutes: input.estimatedMinutes,
    })
    .returning();

  await db
    .update(curricula)
    .set({ updatedAt: new Date() })
    .where(eq(curricula.id, curriculum.id));

  return {
    mode: 'create',
    topic: {
      id: createdTopic!.id,
      title: createdTopic!.title,
      description: createdTopic!.description,
      sortOrder: createdTopic!.sortOrder,
      relevance: createdTopic!.relevance,
      estimatedMinutes: createdTopic!.estimatedMinutes,
      skipped: createdTopic!.skipped,
      source: createdTopic!.source,
    },
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
// Unskip (restore) a topic (with ownership verification)
// ---------------------------------------------------------------------------

export async function unskipTopic(
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

  if (!topic.skipped) throw new Error('Topic is not skipped');

  await db
    .update(curriculumTopics)
    .set({
      skipped: false,
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
    skipReason: 'User restored',
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
  const latestDraft = await db.query.onboardingDrafts.findFirst({
    where: and(
      eq(onboardingDrafts.profileId, profileId),
      eq(onboardingDrafts.subjectId, subjectId)
    ),
    orderBy: desc(onboardingDrafts.updatedAt),
  });

  const extractedSignals =
    latestDraft?.extractedSignals &&
    typeof latestDraft.extractedSignals === 'object' &&
    !Array.isArray(latestDraft.extractedSignals)
      ? (latestDraft.extractedSignals as {
          goals?: unknown;
          experienceLevel?: unknown;
          currentKnowledge?: unknown;
        })
      : {};
  const draftGoals = Array.isArray(extractedSignals.goals)
    ? extractedSignals.goals
        .map((goal) => String(goal).trim())
        .filter((goal) => goal.length > 0)
    : [];
  const draftExperienceLevel =
    typeof extractedSignals.experienceLevel === 'string' &&
    extractedSignals.experienceLevel.trim().length > 0
      ? extractedSignals.experienceLevel.trim()
      : 'beginner';
  const draftConversation = Array.isArray(latestDraft?.exchangeHistory)
    ? latestDraft.exchangeHistory
        .map((exchange) => String(exchange?.content ?? '').trim())
        .filter((content) => content.length > 0)
        .join('\n')
    : '';
  const currentKnowledge =
    typeof extractedSignals.currentKnowledge === 'string' &&
    extractedSignals.currentKnowledge.trim().length > 0
      ? extractedSignals.currentKnowledge.trim()
      : '';
  const interviewSummary = [
    draftConversation,
    currentKnowledge ? `Current knowledge: ${currentKnowledge}` : '',
    `Learner feedback for regeneration: ${feedback.trim()}`,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  // Generate new curriculum with feedback
  const topics = await generateCurriculum({
    subjectName: subject.name,
    interviewSummary,
    goals: draftGoals,
    experienceLevel: draftExperienceLevel,
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
        curriculumId: newCurriculum!.id,
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
        'You are MentoMate, explaining why a topic appears at its position in a personalized curriculum. Be concise (2-3 sentences).',
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

// ---------------------------------------------------------------------------
// Performance-driven curriculum adaptation (FR21)
// ---------------------------------------------------------------------------

export async function adaptCurriculumFromPerformance(
  db: Database,
  profileId: string,
  subjectId: string,
  request: CurriculumAdaptRequest
): Promise<CurriculumAdaptResponse> {
  const curriculum = await getCurriculum(db, profileId, subjectId);
  if (!curriculum) {
    return {
      adapted: false,
      topicOrder: [],
      explanation: 'No curriculum found.',
    };
  }

  const targetTopic = curriculum.topics.find((t) => t.id === request.topicId);
  if (!targetTopic) {
    return {
      adapted: false,
      topicOrder: curriculum.topics.map((t) => t.id),
      explanation: 'Topic not found in curriculum.',
    };
  }

  // Reorder: move struggling/too_hard topics later, mastered/too_easy earlier
  const remaining = curriculum.topics.filter((t) => !t.skipped);
  const targetIndex = remaining.findIndex((t) => t.id === request.topicId);

  const reordered = [...remaining];
  if (targetIndex >= 0) {
    const [topic] = reordered.splice(targetIndex, 1);
    if (topic) {
      switch (request.signal) {
        case 'struggling':
        case 'too_hard':
          reordered.splice(
            Math.min(targetIndex + 2, reordered.length),
            0,
            topic
          );
          break;
        case 'mastered':
        case 'too_easy':
          reordered.splice(Math.max(targetIndex - 2, 0), 0, topic);
          break;
      }
    }
  }

  // Persist new sort order + adaptation record atomically.
  // Without a transaction, a mid-loop connection drop leaves
  // topics in a partially-reordered state with no rollback.
  await db.transaction(async (tx) => {
    for (let i = 0; i < reordered.length; i++) {
      const entry = reordered[i]!;
      await tx
        .update(curriculumTopics)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(curriculumTopics.id, entry.id),
            eq(curriculumTopics.curriculumId, curriculum.id)
          )
        );
    }

    await tx.insert(curriculumAdaptations).values({
      profileId,
      subjectId,
      topicId: request.topicId,
      sortOrder: reordered.findIndex((t) => t.id === request.topicId),
      skipReason: `Performance adaptation: ${request.signal}${
        request.context ? ' — ' + request.context : ''
      }`,
    });
  });

  const explanation =
    request.signal === 'struggling' || request.signal === 'too_hard'
      ? `Moved "${targetTopic.title}" later to give you more preparation time.`
      : `Moved "${targetTopic.title}" earlier since you're ready.`;

  return {
    adapted: true,
    topicOrder: reordered.map((t) => t.id),
    explanation,
  };
}
