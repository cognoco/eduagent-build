import { eq, and, desc } from 'drizzle-orm';
import {
  onboardingDrafts,
  curriculumBooks,
  curriculumTopics,
  subjects,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import {
  routeAndCall,
  routeAndStream,
  parseEnvelope,
  teeEnvelopeStream,
  type ChatMessage,
} from './llm';
import { createLogger } from './logger';
import {
  generateCurriculum,
  ensureCurriculum,
  ensureDefaultBook,
} from './curriculum';
import { getProfileAge } from './profile';
import type {
  InterviewContext,
  InterviewResult,
  OnboardingDraft,
  ChatExchange,
  DraftStatus,
} from '@eduagent/schemas';
import {
  INTERVIEW_SYSTEM_PROMPT,
  SIGNAL_EXTRACTION_PROMPT,
} from './interview-prompts';

// ---------------------------------------------------------------------------
// Interview service — pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Look up a curriculum book's title, verifying ownership through the subject→profile chain. */
export async function getBookTitle(
  db: Database,
  profileId: string,
  bookId: string,
  subjectId: string
): Promise<string | undefined> {
  // Join through subjects to verify the subject belongs to this profile,
  // preventing IDOR where an attacker passes a bookId from another user's subject.
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) return undefined;

  const row = await db.query.curriculumBooks.findFirst({
    where: and(
      eq(curriculumBooks.id, bookId),
      eq(curriculumBooks.subjectId, subjectId)
    ),
    columns: { title: true },
  });
  return row?.title;
}

// Re-export prompt constants for backward compatibility
export {
  INTERVIEW_SYSTEM_PROMPT,
  SIGNAL_EXTRACTION_PROMPT,
} from './interview-prompts';

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
// Signal extraction — extracts structured learner data from interview
// ---------------------------------------------------------------------------

// Hard cap on extracted interests. Matches the prompt's "max 8" rule so a
// verbose LLM response can't overflow what the mobile picker can render.
const MAX_EXTRACTED_INTERESTS = 8;

export async function extractSignals(exchangeHistory: ChatExchange[]): Promise<{
  goals: string[];
  experienceLevel: string;
  currentKnowledge: string;
  interests: string[];
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
      // Coerce and dedupe interests defensively — the LLM occasionally emits
      // duplicates with different capitalization. Per-label length-cap at 60.
      const rawInterests = Array.isArray(parsed.interests)
        ? (parsed.interests as unknown[])
            .map((v) => String(v).trim())
            .filter((v) => v.length > 0 && v.length <= 60)
        : [];
      const seen = new Set<string>();
      const interests: string[] = [];
      for (const label of rawInterests) {
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        interests.push(label);
        if (interests.length >= MAX_EXTRACTED_INTERESTS) break;
      }
      return {
        goals: Array.isArray(parsed.goals)
          ? (parsed.goals as unknown[]).map(String)
          : [],
        experienceLevel: String(parsed.experienceLevel ?? 'beginner'),
        currentKnowledge: String(parsed.currentKnowledge ?? ''),
        interests,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    goals: [],
    experienceLevel: 'beginner',
    currentKnowledge: '',
    interests: [],
  };
}

// ---------------------------------------------------------------------------
// LLM interview exchange
// ---------------------------------------------------------------------------

/**
 * Server-side hard cap: force interview completion after this many user exchanges.
 * Belt + suspenders — the state machine fail-safes the "model never declares
 * done" case even if the LLM returns ready_to_finish: false forever.
 * [BUG-464] [BUG-470] [F-042]
 */
const MAX_INTERVIEW_EXCHANGES = 4;

const logger = createLogger();

/**
 * Interpret an interview LLM response under the envelope contract.
 *
 * If envelope parse fails, fall through with readyToFinish=false — the
 * MAX_INTERVIEW_EXCHANGES cap in the caller guarantees the flow still
 * terminates. The raw response is surfaced as the reply so the learner
 * sees something (rather than an error); any stray JSON braces are
 * stripped as a best-effort defensive cleanup.
 */
function interpretInterviewResponse(params: {
  rawResponse: string;
  profileId: string | undefined;
  flow: 'processInterviewExchange' | 'streamInterviewExchange';
}): {
  cleanResponse: string;
  readyToFinish: boolean;
} {
  const { rawResponse, profileId, flow } = params;

  const parse = parseEnvelope(rawResponse);
  if (parse.ok) {
    return {
      cleanResponse: parse.envelope.reply.trim(),
      readyToFinish: parse.envelope.signals?.ready_to_finish === true,
    };
  }

  logger.warn('interview.envelope_parse_failed', {
    flow,
    profile_id: profileId ?? 'unknown',
    reason: parse.reason,
  });
  // Best-effort surface of the raw text so the learner isn't stuck — the
  // MAX_INTERVIEW_EXCHANGES cap still forces eventual completion.
  return {
    cleanResponse: rawResponse.trim(),
    readyToFinish: false,
  };
}

export async function processInterviewExchange(
  context: InterviewContext,
  userMessage: string,
  options?: { exchangeCount?: number; profileId?: string }
): Promise<InterviewResult> {
  const focusLine = context.bookTitle
    ? `\nFocus area: <book_title>${context.bookTitle}</book_title>\nScope your questions to this specific focus area within the subject, not the entire subject.`
    : '';
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: <subject_name>${context.subjectName}</subject_name>${focusLine}`,
    },
    // Re-wrap assistant turns in the interview envelope so history is
    // consistent with the JSON format the system prompt demands. DB stores
    // cleanResponse (prose only); without re-wrapping, the LLM sees
    // contradictory history and may produce malformed output.
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content:
        e.role === 'assistant'
          ? JSON.stringify({
              reply: e.content,
              signals: { ready_to_finish: false },
            })
          : e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const result = await routeAndCall(messages, 1);
  const { cleanResponse, readyToFinish } = interpretInterviewResponse({
    rawResponse: result.response,
    profileId: options?.profileId,
    flow: 'processInterviewExchange',
  });

  // Server-side cap — force completion regardless of model signal.
  // `exchangeCount` from the route is the 1-indexed number of the current
  // user turn (including this one). [F-042] This is belt + suspenders: even
  // if the LLM returns ready_to_finish: false forever, the interview ends.
  const currentExchangeCount = options?.exchangeCount ?? 0;
  const isComplete =
    readyToFinish || currentExchangeCount >= MAX_INTERVIEW_EXCHANGES;

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
// Streaming interview exchange (FR14 — real SSE streaming)
// ---------------------------------------------------------------------------

export async function streamInterviewExchange(
  context: InterviewContext,
  userMessage: string,
  options?: { exchangeCount?: number; profileId?: string }
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: (fullResponse: string) => Promise<InterviewResult>;
}> {
  const focusLine = context.bookTitle
    ? `\nFocus area: <book_title>${context.bookTitle}</book_title>\nScope your questions to this specific focus area within the subject, not the entire subject.`
    : '';
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${INTERVIEW_SYSTEM_PROMPT}\n\nSubject: <subject_name>${context.subjectName}</subject_name>${focusLine}`,
    },
    // Re-wrap assistant turns — same rationale as processInterviewExchange.
    ...context.exchangeHistory.map((e) => ({
      role: e.role as 'user' | 'assistant',
      content:
        e.role === 'assistant'
          ? JSON.stringify({
              reply: e.content,
              signals: { ready_to_finish: false },
            })
          : e.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const streamResult = await routeAndStream(messages, 1);
  const currentExchangeCount = options?.exchangeCount ?? 0;

  // Tee the provider stream: mobile sees only the envelope `reply` chars,
  // while the accumulator captures the full raw envelope for signal parsing
  // at close. [F1.1 cutover]
  const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
    streamResult.stream
  );

  const onComplete = async (
    _fullResponse: string
  ): Promise<InterviewResult> => {
    const rawResponse = await rawResponsePromise;
    const { cleanResponse, readyToFinish } = interpretInterviewResponse({
      rawResponse,
      profileId: options?.profileId,
      flow: 'streamInterviewExchange',
    });

    const isComplete =
      readyToFinish || currentExchangeCount >= MAX_INTERVIEW_EXCHANGES;

    if (isComplete) {
      const signals = await extractSignals([
        ...context.exchangeHistory,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: cleanResponse },
      ]);
      return { response: cleanResponse, isComplete, extractedSignals: signals };
    }

    return { response: cleanResponse, isComplete };
  };

  return { stream: cleanReplyStream, onComplete };
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

    // Write: raw drizzle with explicit profileId guard is correct here —
    // createScopedRepository only provides read methods (findFirst/findMany).
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

  // Write: raw drizzle insert with profileId bound in values — correct pattern.
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
  if (!row)
    throw new Error('Insert into onboarding drafts did not return a row');
  return mapDraftRow(row);
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
  // Write: raw drizzle with explicit profileId guard is correct here —
  // createScopedRepository only provides read methods (findFirst/findMany).
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

  // Write: raw drizzle with explicit profileId guard is correct here —
  // createScopedRepository only provides read methods (findFirst/findMany).
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
  profileId: string,
  subjectId: string,
  subjectName: string,
  draft: OnboardingDraft,
  bookId?: string,
  bookTitle?: string
): Promise<void> {
  // Verify the subject belongs to this profile before inserting curriculum.
  // Uses scoped repo so profileId is automatically added to the WHERE clause.
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subject) {
    throw new Error(
      `Subject ${subjectId} does not belong to profile ${profileId}`
    );
  }

  const summary = draft.exchangeHistory.map((e) => e.content).join('\n');
  const signals = draft.extractedSignals as {
    goals?: string[];
    experienceLevel?: string;
    currentKnowledge?: string;
  };

  // Book-scoped path: generate topics for a specific book within the subject
  if (bookId && bookTitle) {
    const { generateBookTopics } = await import('./book-generation');
    const learnerAge = await getProfileAge(db, profileId);
    const priorKnowledge = signals.currentKnowledge ?? summary;
    const result = await generateBookTopics(
      bookTitle,
      '',
      learnerAge,
      priorKnowledge
    );

    const curriculum = await ensureCurriculum(db, subjectId);

    if (result.topics.length > 0) {
      await db.insert(curriculumTopics).values(
        result.topics.map((t, i) => ({
          curriculumId: curriculum.id,
          bookId,
          title: t.title,
          description: t.description,
          chapter: t.chapter ?? null,
          sortOrder: t.sortOrder ?? i,
          relevance: 'core' as const,
          estimatedMinutes: t.estimatedMinutes ?? 30,
        }))
      );
    }

    // Mark book topics as generated
    await db
      .update(curriculumBooks)
      .set({ topicsGenerated: true })
      .where(
        and(
          eq(curriculumBooks.id, bookId),
          eq(curriculumBooks.subjectId, subjectId)
        )
      );

    return;
  }

  // Full-curriculum generation flow
  const topics = await generateCurriculum({
    subjectName,
    interviewSummary: summary,
    goals: signals.goals ?? [],
    experienceLevel: signals.experienceLevel ?? 'beginner',
  });

  const curriculum = await ensureCurriculum(db, subjectId);

  if (topics.length > 0) {
    const bookId = await ensureDefaultBook(db, subjectId, subjectName);
    await db.insert(curriculumTopics).values(
      topics.map((t, i) => ({
        curriculumId: curriculum.id,
        bookId,
        title: t.title,
        description: t.description,
        sortOrder: i,
        relevance: t.relevance,
        estimatedMinutes: t.estimatedMinutes,
      }))
    );
  }
}
