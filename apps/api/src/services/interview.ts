import { eq, and } from 'drizzle-orm';
import {
  onboardingDrafts,
  curricula,
  curriculumTopics,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { routeAndCall, type ChatMessage } from './llm';
import { generateCurriculum } from './curriculum';
import type {
  InterviewContext,
  InterviewResult,
  OnboardingDraft,
  ChatExchange,
  DraftStatus,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Interview service — pure business logic, no Hono imports
// ---------------------------------------------------------------------------

const INTERVIEW_SYSTEM_PROMPT = `You are EduAgent, an AI tutor conducting a brief assessment interview.
Ask about the learner's goals, prior experience, and current knowledge level for the given subject.
Keep questions conversational and brief. After 3-5 exchanges when you have enough signal,
respond with the special marker [INTERVIEW_COMPLETE] at the end of your response.`;

// ---------------------------------------------------------------------------
// Row mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapDraftRow(
  row: typeof onboardingDrafts.$inferSelect
): OnboardingDraft {
  return {
    id: row.id,
    profileId: row.profileId,
    subjectId: row.subjectId,
    exchangeHistory: (row.exchangeHistory ??
      []) as OnboardingDraft['exchangeHistory'],
    extractedSignals: (row.extractedSignals ?? {}) as Record<string, unknown>,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Signal extraction prompt
// ---------------------------------------------------------------------------

const SIGNAL_EXTRACTION_PROMPT = `You are EduAgent's signal extractor. Analyze the interview conversation and extract structured signals.

Return a JSON object with this exact structure:
{
  "goals": ["goal1", "goal2"],
  "experienceLevel": "beginner|intermediate|advanced",
  "currentKnowledge": "Brief description of what the learner already knows"
}

Be concise. Extract only what's clearly stated or strongly implied.`;

// ---------------------------------------------------------------------------
// Signal extraction — extracts structured learner data from interview
// ---------------------------------------------------------------------------

export async function extractSignals(exchangeHistory: ChatExchange[]): Promise<{
  goals: string[];
  experienceLevel: string;
  currentKnowledge: string;
}> {
  const conversationText = exchangeHistory
    .map((e) => `${e.role}: ${e.content}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: SIGNAL_EXTRACTION_PROMPT },
    {
      role: 'user',
      content: `Extract signals from this interview:\n\n${conversationText}`,
    },
  ];

  const result = await routeAndCall(messages, 2);

  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        goals: Array.isArray(parsed.goals)
          ? (parsed.goals as unknown[]).map(String)
          : [],
        experienceLevel: String(parsed.experienceLevel ?? 'beginner'),
        currentKnowledge: String(parsed.currentKnowledge ?? ''),
      };
    }
  } catch {
    // Fall through to default
  }

  return { goals: [], experienceLevel: 'beginner', currentKnowledge: '' };
}

// ---------------------------------------------------------------------------
// LLM interview exchange
// ---------------------------------------------------------------------------

export async function processInterviewExchange(
  context: InterviewContext,
  userMessage: string
): Promise<InterviewResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: ${context.subjectName}`,
    },
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content: e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const result = await routeAndCall(messages, 1);
  const isComplete = result.response.includes('[INTERVIEW_COMPLETE]');
  const cleanResponse = result.response
    .replace('[INTERVIEW_COMPLETE]', '')
    .trim();

  if (isComplete) {
    const signals = await extractSignals([
      ...context.exchangeHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: cleanResponse },
    ]);
    return { response: cleanResponse, isComplete, extractedSignals: signals };
  }

  return { response: cleanResponse, isComplete };
}

// ---------------------------------------------------------------------------
// Draft persistence
// ---------------------------------------------------------------------------

export async function getOrCreateDraft(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<OnboardingDraft> {
  const repo = createScopedRepository(db, profileId);
  const existing = await repo.onboardingDrafts.findFirst(
    and(
      eq(onboardingDrafts.subjectId, subjectId),
      eq(onboardingDrafts.status, 'in_progress')
    )
  );
  if (existing) return mapDraftRow(existing);

  const [row] = await db
    .insert(onboardingDrafts)
    .values({
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();
  return mapDraftRow(row);
}

export async function getDraftState(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<OnboardingDraft | null> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.onboardingDrafts.findFirst(
    eq(onboardingDrafts.subjectId, subjectId)
  );
  return row ? mapDraftRow(row) : null;
}

export async function updateDraft(
  db: Database,
  profileId: string,
  draftId: string,
  updates: {
    exchangeHistory?: ChatExchange[];
    extractedSignals?: Record<string, unknown>;
    status?: DraftStatus;
  }
): Promise<void> {
  await db
    .update(onboardingDrafts)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(onboardingDrafts.id, draftId),
        eq(onboardingDrafts.profileId, profileId)
      )
    );
}

// ---------------------------------------------------------------------------
// Curriculum persistence (called on interview completion)
// ---------------------------------------------------------------------------

export async function persistCurriculum(
  db: Database,
  subjectId: string,
  subjectName: string,
  draft: OnboardingDraft
): Promise<void> {
  const summary = draft.exchangeHistory.map((e) => e.content).join('\n');
  const signals = draft.extractedSignals as {
    goals?: string[];
    experienceLevel?: string;
  };

  const topics = await generateCurriculum({
    subjectName,
    interviewSummary: summary,
    goals: signals.goals ?? [],
    experienceLevel: signals.experienceLevel ?? 'beginner',
  });

  const [curriculum] = await db
    .insert(curricula)
    .values({
      subjectId,
      version: 1,
    })
    .returning();

  if (topics.length > 0) {
    await db.insert(curriculumTopics).values(
      topics.map((t, i) => ({
        curriculumId: curriculum.id,
        title: t.title,
        description: t.description,
        sortOrder: i,
        relevance: t.relevance,
        estimatedMinutes: t.estimatedMinutes,
      }))
    );
  }
}
