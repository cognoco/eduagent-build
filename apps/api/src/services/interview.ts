import { eq, and, desc } from 'drizzle-orm';
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

const INTERVIEW_SYSTEM_PROMPT = `You are MentoMate, an AI learning mate conducting a brief assessment interview.
Ask about the learner's goals, prior experience, and current knowledge level for the given subject.
Keep questions conversational and brief. After 3-5 exchanges when you have enough signal,
respond with the special marker [INTERVIEW_COMPLETE] at the end of your response.`;

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

async function loadLatestDraftRow(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<typeof onboardingDrafts.$inferSelect | undefined> {
  const repo = createScopedRepository(db, profileId);
  return repo.onboardingDrafts.findFirst(
    eq(onboardingDrafts.subjectId, subjectId),
    desc(onboardingDrafts.updatedAt)
  );
}

function isDraftExpired(row: typeof onboardingDrafts.$inferSelect): boolean {
  return (
    row.status === 'in_progress' &&
    row.expiresAt != null &&
    row.expiresAt.getTime() <= Date.now()
  );
}

export function buildDraftResumeSummary(
  draft: Pick<OnboardingDraft, 'exchangeHistory' | 'extractedSignals'>
): string {
  const signals = draft.extractedSignals as {
    goals?: unknown;
    experienceLevel?: unknown;
    currentKnowledge?: unknown;
  };
  const goals = Array.isArray(signals.goals)
    ? signals.goals
        .map((goal) => String(goal).trim())
        .filter((goal) => goal.length > 0)
    : [];
  const experienceLevel =
    typeof signals.experienceLevel === 'string'
      ? signals.experienceLevel.trim()
      : '';
  const currentKnowledge =
    typeof signals.currentKnowledge === 'string'
      ? signals.currentKnowledge.trim()
      : '';

  const parts: string[] = [];
  if (goals.length > 0) {
    parts.push(`We already talked about your goals: ${goals.join(', ')}.`);
  }
  if (experienceLevel) {
    parts.push(`You described your current level as ${experienceLevel}.`);
  }
  if (currentKnowledge) {
    parts.push(`You also mentioned: ${currentKnowledge}.`);
  }

  if (parts.length > 0) {
    return parts.join(' ');
  }

  const learnerMessages = draft.exchangeHistory
    .filter((exchange) => exchange.role === 'user')
    .map((exchange) => exchange.content.trim())
    .filter((content) => content.length > 0)
    .slice(0, 2);

  if (learnerMessages.length > 0) {
    return `We already talked about ${learnerMessages.join(' and ')}.`;
  }

  return 'We already started talking about your goals, background, and current level.';
}

// ---------------------------------------------------------------------------
// Signal extraction prompt
// ---------------------------------------------------------------------------

const SIGNAL_EXTRACTION_PROMPT = `You are MentoMate's signal extractor. Analyze the interview conversation and extract structured signals.

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
  const existing = await loadLatestDraftRow(db, profileId, subjectId);
  if (existing?.status === 'in_progress') {
    if (!isDraftExpired(existing)) {
      return mapDraftRow(existing);
    }

    await db
      .update(onboardingDrafts)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(onboardingDrafts.id, existing.id),
          eq(onboardingDrafts.profileId, profileId)
        )
      );
  }

  const [row] = await db
    .insert(onboardingDrafts)
    .values({
      profileId,
      subjectId,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'in_progress',
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    })
    .returning();
  return mapDraftRow(row!);
}

export async function getDraftState(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<OnboardingDraft | null> {
  const row = await loadLatestDraftRow(db, profileId, subjectId);
  if (!row) return null;

  if (!isDraftExpired(row)) {
    return mapDraftRow(row);
  }

  const now = new Date();
  await db
    .update(onboardingDrafts)
    .set({
      status: 'expired',
      updatedAt: now,
    })
    .where(
      and(
        eq(onboardingDrafts.id, row.id),
        eq(onboardingDrafts.profileId, profileId)
      )
    );

  return mapDraftRow({
    ...row,
    status: 'expired',
    updatedAt: now,
  });
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
  const nextStatus = updates.status;
  const nextExpiresAt =
    nextStatus === 'completed' || nextStatus === 'expired'
      ? undefined
      : new Date(Date.now() + DRAFT_TTL_MS);

  await db
    .update(onboardingDrafts)
    .set({
      ...updates,
      ...(nextExpiresAt ? { expiresAt: nextExpiresAt } : {}),
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
        curriculumId: curriculum!.id,
        title: t.title,
        description: t.description,
        sortOrder: i,
        relevance: t.relevance,
        estimatedMinutes: t.estimatedMinutes,
      }))
    );
  }
}
