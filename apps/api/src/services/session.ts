// ---------------------------------------------------------------------------
// Session Service — Story 2.1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc, inArray } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
  curriculumTopics,
  profiles,
  retentionCards,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  SessionStartInput,
  SessionMessageInput,
  SessionCloseInput,
  ContentFlagInput,
  SummarySubmitInput,
  LearningSession,
  SessionSummary,
} from '@eduagent/schemas';
import {
  processExchange,
  streamExchange,
  detectUnderstandingCheck,
  type ExchangeContext,
} from './exchanges';
import { evaluateEscalation } from './escalation';
import { evaluateSummary } from './summaries';
import { getSubject } from './subject';
import { fetchPriorTopics, buildPriorLearningContext } from './prior-learning';
import { retrieveRelevantMemory } from './memory';
import { getTeachingPreference } from './retention-data';
import { shouldTriggerEvaluate } from './evaluate';
import { shouldTriggerTeachBack } from './teach-back';
import type { EscalationRung } from './llm';

// ---------------------------------------------------------------------------
// Mappers — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapSessionRow(
  row: typeof learningSessions.$inferSelect
): LearningSession {
  return {
    id: row.id,
    subjectId: row.subjectId,
    topicId: row.topicId ?? null,
    sessionType: row.sessionType,
    verificationType:
      (row.verificationType as 'standard' | 'evaluate' | 'teach_back') ?? null,
    status: row.status,
    escalationRung: row.escalationRung,
    exchangeCount: row.exchangeCount,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds ?? null,
  };
}

function mapSummaryRow(
  row: typeof sessionSummaries.$inferSelect
): SessionSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    content: row.content ?? '',
    aiFeedback: row.aiFeedback ?? null,
    status: row.status,
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export class SubjectInactiveError extends Error {
  constructor(public readonly subjectStatus: 'paused' | 'archived') {
    const action = subjectStatus === 'paused' ? 'resume' : 'restore';
    super(
      `Subject is ${subjectStatus} \u2014 ${action} it before starting a session`
    );
    this.name = 'SubjectInactiveError';
  }
}

export async function startSession(
  db: Database,
  profileId: string,
  subjectId: string,
  input: SessionStartInput
): Promise<LearningSession> {
  // Verify subject belongs to this profile (horizontal privilege guard)
  const subject = await getSubject(db, profileId, subjectId);
  if (!subject) {
    throw new Error('Subject not found');
  }

  // Enforce subject lifecycle — only active subjects may start sessions
  if (subject.status !== 'active') {
    throw new SubjectInactiveError(subject.status as 'paused' | 'archived');
  }

  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId: input.topicId ?? null,
      sessionType: input.sessionType ?? 'learning',
      verificationType: input.verificationType ?? null,
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
    })
    .returning();

  // Record session_start event for the audit log
  await db.insert(sessionEvents).values({
    sessionId: row.id,
    profileId,
    subjectId,
    eventType: 'session_start' as const,
    content: '',
  });

  return mapSessionRow(row);
}

export async function getSession(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<LearningSession | null> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  return row ? mapSessionRow(row) : null;
}

// ---------------------------------------------------------------------------
// Behavioral metrics data contract — UX-18 (process visibility)
// ---------------------------------------------------------------------------

/** Per-exchange behavioral metrics stored in ai_response event metadata */
export interface ExchangeBehavioralMetrics {
  escalationRung: number;
  isUnderstandingCheck: boolean;
  timeToAnswerMs: number | null;
  hintCountInSession: number;
}

// ---------------------------------------------------------------------------
// Shared exchange preparation (used by processMessage + streamMessage)
// ---------------------------------------------------------------------------

interface ExchangePrep {
  session: LearningSession;
  context: ExchangeContext;
  effectiveRung: EscalationRung;
  hintCount: number;
  lastAiResponseAt: Date | null;
}

async function prepareExchangeContext(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string,
  options?: { voyageApiKey?: string }
): Promise<ExchangePrep> {
  // 1. Load session
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const isInterleaved = session.sessionType === 'interleaved';

  // 2. Load all supplementary data in parallel (all independent after session load)
  const [
    subject,
    topicRows,
    profileRows,
    retentionRows,
    events,
    priorTopics,
    memory,
    teachingPref,
    metadataRows,
  ] = await Promise.all([
    getSubject(db, profileId, session.subjectId),
    session.topicId
      ? db
          .select()
          .from(curriculumTopics)
          .where(eq(curriculumTopics.id, session.topicId))
          .limit(1)
      : Promise.resolve([]),
    db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1),
    session.topicId
      ? db
          .select()
          .from(retentionCards)
          .where(
            and(
              eq(retentionCards.topicId, session.topicId),
              eq(retentionCards.profileId, profileId)
            )
          )
          .limit(1)
      : Promise.resolve([]),
    db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.profileId, profileId)
      ),
      orderBy: asc(sessionEvents.createdAt),
    }),
    fetchPriorTopics(db, profileId, session.subjectId),
    retrieveRelevantMemory(db, profileId, userMessage, options?.voyageApiKey),
    // FR58: Load teaching method preference for adaptive teaching
    getTeachingPreference(db, profileId, session.subjectId),
    // FR92: Load session metadata for interleaved topic list
    isInterleaved
      ? db
          .select({ metadata: learningSessions.metadata })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId)
            )
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const topic = topicRows[0];
  const [profile] = profileRows;
  const retentionCard = retentionRows[0];

  // Determine verification type: explicit from session, or auto-select from retention card
  let verificationType: 'standard' | 'evaluate' | 'teach_back' | undefined;
  if (session.verificationType && session.verificationType !== 'standard') {
    verificationType = session.verificationType as 'evaluate' | 'teach_back';
  } else if (
    retentionCard &&
    !isInterleaved &&
    session.sessionType === 'learning'
  ) {
    const ease = Number(retentionCard.easeFactor);
    const reps = retentionCard.repetitions;
    if (shouldTriggerEvaluate(ease, reps)) {
      verificationType = 'evaluate';
    } else if (shouldTriggerTeachBack(ease, reps)) {
      verificationType = 'teach_back';
    }
  }

  // Load evaluateDifficultyRung from retention card for evaluate sessions
  const evaluateDifficultyRung =
    verificationType === 'evaluate' && retentionCard
      ? ((retentionCard.evaluateDifficultyRung ?? 1) as 1 | 2 | 3 | 4)
      : undefined;

  // FR92: Resolve interleaved topic details (titles + descriptions)
  let interleavedTopics: ExchangeContext['interleavedTopics'];
  if (isInterleaved && metadataRows[0]?.metadata) {
    const meta = metadataRows[0].metadata as {
      interleavedTopics?: Array<{
        topicId: string;
        topicTitle: string;
        subjectId: string;
      }>;
    };
    const topicIds = meta.interleavedTopics?.map((t) => t.topicId) ?? [];
    if (topicIds.length > 0) {
      const topicDetails = await db
        .select({
          id: curriculumTopics.id,
          title: curriculumTopics.title,
          description: curriculumTopics.description,
        })
        .from(curriculumTopics)
        .where(inArray(curriculumTopics.id, topicIds));
      const detailMap = new Map(topicDetails.map((t) => [t.id, t]));
      interleavedTopics = topicIds.map((id) => {
        const detail = detailMap.get(id);
        const metaTopic = meta.interleavedTopics!.find((t) => t.topicId === id);
        return {
          topicId: id,
          title: detail?.title ?? metaTopic?.topicTitle ?? 'Unknown',
          description: detail?.description ?? undefined,
        };
      });
    }
  }

  const workedExampleLevel: 'full' | 'fading' | 'problem_first' = retentionCard
    ? retentionCard.repetitions <= 1
      ? 'full'
      : retentionCard.repetitions <= 4
      ? 'fading'
      : 'problem_first'
    : 'full'; // default for new topics
  const exchangeHistory = events
    .filter(
      (e) => e.eventType === 'user_message' || e.eventType === 'ai_response'
    )
    .map((e) => ({
      role: (e.eventType === 'user_message' ? 'user' : 'assistant') as
        | 'user'
        | 'assistant',
      content: e.content,
    }));

  // 3b. Count questions at the current escalation rung + compute hint count
  const aiResponseEvents = events.filter((e) => e.eventType === 'ai_response');
  const questionsAtCurrentRung = aiResponseEvents.filter(
    (e) =>
      (e.metadata as Record<string, unknown> | null)?.escalationRung ===
      session.escalationRung
  ).length;
  // Hint = AI response at escalation rung >= 2 (beyond basic Socratic)
  const hintCount = aiResponseEvents.filter((e) => {
    const rung = (e.metadata as Record<string, unknown> | null)?.escalationRung;
    return typeof rung === 'number' && rung >= 2;
  }).length;
  const lastAiResponseAt =
    aiResponseEvents.length > 0
      ? aiResponseEvents[aiResponseEvents.length - 1].createdAt
      : null;

  // 4. Evaluate escalation
  const escalationDecision = evaluateEscalation(
    {
      currentRung: session.escalationRung as EscalationRung,
      hintCount,
      questionsAtCurrentRung,
      totalExchanges: session.exchangeCount,
    },
    userMessage
  );
  const effectiveRung = escalationDecision.shouldEscalate
    ? escalationDecision.newRung
    : (session.escalationRung as EscalationRung);

  // 5. Build prior learning context (FR40 — bridge FR)
  const priorLearning = buildPriorLearningContext(priorTopics);

  // 6. Build ExchangeContext
  // For interleaved sessions: use the topic list, clear single-topic fields
  const context: ExchangeContext = {
    sessionId,
    profileId,
    subjectName: subject?.name ?? 'Unknown',
    topicTitle: interleavedTopics ? undefined : topic?.title,
    topicDescription: interleavedTopics ? undefined : topic?.description,
    sessionType: session.sessionType as 'learning' | 'homework' | 'interleaved',
    escalationRung: effectiveRung,
    exchangeHistory,
    personaType:
      (profile?.personaType as 'TEEN' | 'LEARNER' | 'PARENT') ?? 'LEARNER',
    workedExampleLevel: interleavedTopics ? undefined : workedExampleLevel,
    priorLearningContext: priorLearning.contextText || undefined,
    embeddingMemoryContext: memory.context || undefined,
    teachingPreference: teachingPref?.method,
    analogyDomain: teachingPref?.analogyDomain ?? undefined,
    interleavedTopics,
    verificationType,
    evaluateDifficultyRung,
  };

  return { session, context, effectiveRung, hintCount, lastAiResponseAt };
}

async function persistExchangeResult(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
  userMessage: string,
  aiResponse: string,
  effectiveRung: EscalationRung,
  behavioral?: Partial<ExchangeBehavioralMetrics>
): Promise<number> {
  const previousRung = session.escalationRung;

  // Build ai_response metadata — always includes escalationRung,
  // enriched with behavioral metrics when available (UX-18)
  const aiMetadata: Record<string, unknown> = {
    escalationRung: effectiveRung,
    ...(behavioral && {
      isUnderstandingCheck: behavioral.isUnderstandingCheck,
      timeToAnswerMs: behavioral.timeToAnswerMs,
      hintCountInSession: behavioral.hintCountInSession,
    }),
  };

  // Persist events: user_message + ai_response (with behavioral metadata)
  await db.insert(sessionEvents).values([
    {
      sessionId,
      profileId,
      subjectId: session.subjectId,
      eventType: 'user_message' as const,
      content: userMessage,
    },
    {
      sessionId,
      profileId,
      subjectId: session.subjectId,
      eventType: 'ai_response' as const,
      content: aiResponse,
      metadata: aiMetadata,
    },
  ]);

  // Record escalation event if rung changed
  if (previousRung !== effectiveRung) {
    await db.insert(sessionEvents).values({
      sessionId,
      profileId,
      subjectId: session.subjectId,
      eventType: 'escalation' as const,
      content: `Escalated from rung ${previousRung} to ${effectiveRung}`,
      metadata: { fromRung: previousRung, toRung: effectiveRung },
    });
  }

  // Update session state
  const newExchangeCount = session.exchangeCount + 1;
  const now = new Date();
  await db
    .update(learningSessions)
    .set({
      exchangeCount: newExchangeCount,
      escalationRung: effectiveRung,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );

  return newExchangeCount;
}

// ---------------------------------------------------------------------------
// Core exchange functions
// ---------------------------------------------------------------------------

/**
 * Processes a learner message through the full LLM pipeline:
 * load session → load history → evaluate escalation → call LLM → persist events → update session
 */
export async function processMessage(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionMessageInput,
  options?: { voyageApiKey?: string }
): Promise<{
  response: string;
  escalationRung: number;
  isUnderstandingCheck: boolean;
  exchangeCount: number;
}> {
  const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
    await prepareExchangeContext(
      db,
      profileId,
      sessionId,
      input.message,
      options
    );

  const result = await processExchange(context, input.message);

  // Compute time-to-answer: ms between last AI response and now
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() - lastAiResponseAt.getTime()
    : null;

  const newExchangeCount = await persistExchangeResult(
    db,
    profileId,
    sessionId,
    session,
    input.message,
    result.response,
    effectiveRung,
    {
      isUnderstandingCheck: result.isUnderstandingCheck,
      timeToAnswerMs,
      hintCountInSession: hintCount,
    }
  );

  return {
    response: result.response,
    escalationRung: effectiveRung,
    isUnderstandingCheck: result.isUnderstandingCheck,
    exchangeCount: newExchangeCount,
  };
}

/**
 * Streaming variant of processMessage — returns an async iterable of chunks.
 * Used by the SSE endpoint to stream responses in real-time.
 */
export async function streamMessage(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionMessageInput,
  options?: { voyageApiKey?: string }
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: (
    fullResponse: string
  ) => Promise<{ exchangeCount: number; escalationRung: number }>;
}> {
  const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
    await prepareExchangeContext(
      db,
      profileId,
      sessionId,
      input.message,
      options
    );

  // Compute time-to-answer before streaming begins
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() - lastAiResponseAt.getTime()
    : null;

  const result = await streamExchange(context, input.message);

  return {
    stream: result.stream,
    async onComplete(fullResponse: string) {
      const newExchangeCount = await persistExchangeResult(
        db,
        profileId,
        sessionId,
        session,
        input.message,
        fullResponse,
        effectiveRung,
        {
          isUnderstandingCheck: detectUnderstandingCheck(fullResponse),
          timeToAnswerMs,
          hintCountInSession: hintCount,
        }
      );
      return { exchangeCount: newExchangeCount, escalationRung: effectiveRung };
    },
  };
}

export async function closeSession(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionCloseInput
): Promise<{
  message: string;
  sessionId: string;
  topicId: string | null;
  subjectId: string;
  sessionType: string;
  interleavedTopicIds?: string[];
}> {
  void input;
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const now = new Date();
  const durationSeconds = Math.round(
    (now.getTime() - new Date(session.startedAt).getTime()) / 1000
  );

  await db
    .update(learningSessions)
    .set({
      status: 'completed',
      endedAt: now,
      durationSeconds,
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );

  // FR92: Extract interleaved topic IDs from session metadata
  let interleavedTopicIds: string[] | undefined;
  if (session.sessionType === 'interleaved') {
    const [row] = await db
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId)
        )
      )
      .limit(1);
    if (row?.metadata) {
      const meta = row.metadata as {
        interleavedTopics?: Array<{ topicId: string }>;
      };
      interleavedTopicIds = meta.interleavedTopics?.map((t) => t.topicId);
    }
  }

  return {
    message: 'Session closed',
    sessionId,
    topicId: session.topicId ?? null,
    subjectId: session.subjectId,
    sessionType: session.sessionType,
    interleavedTopicIds,
  };
}

export async function flagContent(
  db: Database,
  profileId: string,
  sessionId: string,
  input: ContentFlagInput
): Promise<{ message: string }> {
  void input;

  // Look up the session to get its subjectId
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  await db.insert(sessionEvents).values({
    sessionId,
    profileId,
    subjectId: session.subjectId,
    eventType: 'flag',
    content: 'Content flagged',
  });

  return { message: 'Content flagged for review. Thank you!' };
}

export async function getSessionSummary(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<SessionSummary | null> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessionSummaries.findFirst(
    eq(sessionSummaries.sessionId, sessionId)
  );
  return row ? mapSummaryRow(row) : null;
}

export async function submitSummary(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SummarySubmitInput
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string;
    status: 'accepted' | 'submitted';
  };
}> {
  // Fetch session for topicId and subject name
  const session = await getSession(db, profileId, sessionId);
  const subject = session
    ? await getSubject(db, profileId, session.subjectId)
    : null;

  const [row] = await db
    .insert(sessionSummaries)
    .values({
      sessionId,
      profileId,
      topicId: session?.topicId ?? null,
      content: input.content,
      status: 'submitted',
    })
    .returning();

  // Evaluate summary via LLM
  const evaluation = await evaluateSummary(
    subject?.name ?? 'Unknown topic',
    'Session learning content',
    input.content
  );

  // Update summary with AI feedback and status
  const finalStatus = evaluation.isAccepted ? 'accepted' : 'submitted';
  await db
    .update(sessionSummaries)
    .set({
      aiFeedback: evaluation.feedback,
      status: finalStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sessionSummaries.id, row.id),
        eq(sessionSummaries.profileId, profileId)
      )
    );

  return {
    summary: {
      id: row.id,
      sessionId: row.sessionId,
      content: row.content ?? input.content,
      aiFeedback: evaluation.feedback,
      status: finalStatus,
    },
  };
}
