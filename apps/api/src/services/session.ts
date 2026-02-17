// ---------------------------------------------------------------------------
// Session Service — Story 2.1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
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
  type ExchangeContext,
} from './exchanges';
import { evaluateEscalation } from './escalation';
import { evaluateSummary } from './summaries';
import { getSubject } from './subject';
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

export async function startSession(
  db: Database,
  profileId: string,
  subjectId: string,
  input: SessionStartInput
): Promise<LearningSession> {
  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId: input.topicId ?? null,
      sessionType: 'learning',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
    })
    .returning();
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
// Shared exchange preparation (used by processMessage + streamMessage)
// ---------------------------------------------------------------------------

interface ExchangePrep {
  session: LearningSession;
  context: ExchangeContext;
  effectiveRung: EscalationRung;
}

async function prepareExchangeContext(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string
): Promise<ExchangePrep> {
  // 1. Load session
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // 2. Load subject name for system prompt
  const subject = await getSubject(db, profileId, session.subjectId);

  // 3. Load exchange history from session_events
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: asc(sessionEvents.createdAt),
  });
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

  // 4. Evaluate escalation
  const escalationDecision = evaluateEscalation(
    {
      currentRung: session.escalationRung as EscalationRung,
      hintCount: 0,
      questionsAtCurrentRung: 0,
      totalExchanges: session.exchangeCount,
    },
    userMessage
  );
  const effectiveRung = escalationDecision.shouldEscalate
    ? escalationDecision.newRung
    : (session.escalationRung as EscalationRung);

  // 5. Build ExchangeContext
  const context: ExchangeContext = {
    sessionId,
    profileId,
    subjectName: subject?.name ?? 'Unknown',
    topicTitle: undefined,
    sessionType: session.sessionType as 'learning' | 'homework',
    escalationRung: effectiveRung,
    exchangeHistory,
    personaType: 'LEARNER',
  };

  return { session, context, effectiveRung };
}

async function persistExchangeResult(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
  userMessage: string,
  aiResponse: string,
  effectiveRung: EscalationRung
): Promise<number> {
  // Persist events: user_message + ai_response
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
    },
  ]);

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
  input: SessionMessageInput
): Promise<{
  response: string;
  escalationRung: number;
  isUnderstandingCheck: boolean;
  exchangeCount: number;
}> {
  const { session, context, effectiveRung } = await prepareExchangeContext(
    db,
    profileId,
    sessionId,
    input.message
  );

  const result = await processExchange(context, input.message);

  const newExchangeCount = await persistExchangeResult(
    db,
    profileId,
    sessionId,
    session,
    input.message,
    result.response,
    effectiveRung
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
  input: SessionMessageInput
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: (
    fullResponse: string
  ) => Promise<{ exchangeCount: number; escalationRung: number }>;
}> {
  const { session, context, effectiveRung } = await prepareExchangeContext(
    db,
    profileId,
    sessionId,
    input.message
  );

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
        effectiveRung
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
): Promise<{ message: string; sessionId: string }> {
  void input;
  const session = await getSession(db, profileId, sessionId);
  const now = new Date();
  const durationSeconds = session
    ? Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000)
    : null;

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

  return { message: 'Session closed', sessionId };
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

  await db.insert(sessionEvents).values({
    sessionId,
    profileId,
    subjectId: session?.subjectId ?? sessionId, // fallback if session not found
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
    .where(eq(sessionSummaries.id, row.id));

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
