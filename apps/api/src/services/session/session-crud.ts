// ---------------------------------------------------------------------------
// Session CRUD — core session lifecycle: start, get, close, transcript
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, gte, isNull, lt, sql } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
  subjects,
  curricula,
  curriculumTopics,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { z } from 'zod';
import type {
  CelebrationReason,
  LearningSession,
  SessionStartInput,
  SessionCloseInput,
  SessionAnalyticsEventInput,
  ContentFlagInput,
  TranscriptResponse,
} from '@eduagent/schemas';
import { celebrationReasonSchema, llmSummarySchema } from '@eduagent/schemas';
import { insertSessionEvent } from './session-events';
import { getSubject } from '../subject';
import { createPendingSessionSummary } from '../summaries';
import { incrementSummarySkips } from '../settings';
import { computeActiveSeconds } from './session-context-builders';
import { mapSessionRow } from './session-events';
import { clearSessionStaticContext } from './session-cache';
import { projectAiResponseContent } from '../llm/project-response';
import { createLogger } from '../logger';
import type { TimedEvent } from './session-context-builders';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Error classes
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

/** Maximum exchanges allowed per session (defense-in-depth — issue #15) */
export const MAX_EXCHANGES_PER_SESSION = 50;

export class SessionExchangeLimitError extends Error {
  constructor(public readonly exchangeCount: number) {
    super(
      `Session has reached the maximum of ${MAX_EXCHANGES_PER_SESSION} exchanges`
    );
    this.name = 'SessionExchangeLimitError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// [BUG-934 follow-up] projectAiResponseContent and stripMarkdownFence used to
// live here. They were extracted to services/llm/project-response.ts so 8+
// other read paths (bookmarks, GDPR export, learner-profile, homework-summary,
// recap, vocab extraction, session-insights, buildExchangeHistory,
// buildContinueSessionContext) can use the same projection without coupling
// to session CRUD. Re-exported below to keep existing test entry points
// (session-crud.test.ts) and any external imports working.
export {
  projectAiResponseContent,
  stripMarkdownFence,
} from '../llm/project-response';

function collectEscalationRungs(
  events: Array<TimedEvent>
): number[] | undefined {
  const rungs = Array.from(
    new Set(
      events
        .filter((event) => event.eventType === 'ai_response')
        .map((event) => {
          const metadata = event.metadata as Record<string, unknown> | null;
          return typeof metadata?.escalationRung === 'number'
            ? metadata.escalationRung
            : null;
        })
        .filter((rung): rung is number => rung != null)
    )
  ).sort((left, right) => left - right);

  return rungs.length > 0 ? rungs : undefined;
}

async function resolveInterleavedTopicIds(
  db: Database,
  profileId: string,
  sessionId: string,
  sessionType: string
): Promise<string[] | undefined> {
  if (sessionType !== 'interleaved') {
    return undefined;
  }

  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row?.metadata) {
    return undefined;
  }

  const interleavedMetaSchema = z.object({
    interleavedTopics: z
      .array(z.object({ topicId: z.string().uuid() }))
      .optional(),
  });
  const parsed = interleavedMetaSchema.safeParse(row.metadata);
  return parsed.success
    ? parsed.data.interleavedTopics?.map((t) => t.topicId)
    : undefined;
}

// ---------------------------------------------------------------------------
// Core CRUD functions
// ---------------------------------------------------------------------------

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

  // BS-04: verify topicId belongs to this subject's curriculum before use.
  // Full ownership chain: profileId → subject (verified via getSubject/scoped
  // repo above) → curriculum → topic. The subjects join + profileId filter
  // below is defense-in-depth so the query is self-contained even if the
  // getSubject guard is ever refactored away.
  if (input.topicId) {
    const [topic] = await db
      .select({ id: curriculumTopics.id })
      .from(curriculumTopics)
      .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
      .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
      .where(
        and(
          eq(curriculumTopics.id, input.topicId),
          eq(curricula.subjectId, subjectId),
          eq(subjects.profileId, profileId)
        )
      )
      .limit(1);
    if (!topic) {
      throw new Error('Topic not found in this subject');
    }
  }

  const [row] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      topicId: input.topicId ?? null,
      sessionType: input.sessionType ?? 'learning',
      verificationType: input.verificationType ?? null,
      inputMode: input.inputMode ?? 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {
        ...(input.metadata ?? {}),
        inputMode: input.inputMode ?? input.metadata?.inputMode ?? 'text',
      },
      rawInput: input.rawInput ?? null,
    })
    .returning();

  if (!row) throw new Error('Insert learning session did not return a row');

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
  verificationType: string | null;
  wallClockSeconds: number;
  summaryStatus:
    | 'pending'
    | 'submitted'
    | 'accepted'
    | 'skipped'
    | 'auto_closed';
  interleavedTopicIds?: string[];
  escalationRungs?: number[];
}> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const now = new Date();
  const sessionStartedAt = new Date(session.startedAt);
  const wallClockSeconds = Math.max(
    0,
    Math.round((now.getTime() - sessionStartedAt.getTime()) / 1000)
  );

  // FR210: Compute active time from session event gaps (internal analytics only)
  // [BUG-913 sweep] Tie-break by id when created_at collides — see
  // getSessionTranscript below for the full rationale. computeActiveSeconds
  // walks events in order, so a flapping order between batched events would
  // produce nondeterministic active-time values for the same session.
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
  });
  const durationSeconds = computeActiveSeconds(sessionStartedAt, events);
  const escalationRungs = collectEscalationRungs(events);
  const effectiveSummaryStatus =
    input.summaryStatus ??
    (input.reason === 'silence_timeout' ? 'auto_closed' : 'pending');
  const nextStatus =
    effectiveSummaryStatus === 'auto_closed' ||
    input.reason === 'silence_timeout'
      ? 'auto_closed'
      : 'completed';

  // BD-05: Compare-and-swap — only close if the session is still active.
  // Between the initial read and this write, the learner could resume the
  // session, so we guard the UPDATE with `status = 'active'` to prevent
  // closing a session that has already been resumed or closed.
  const [updated] = await db
    .update(learningSessions)
    .set({
      status: nextStatus,
      endedAt: now,
      durationSeconds,
      wallClockSeconds,
      metadata: {
        ...(((session.metadata as Record<string, unknown> | undefined) ??
          {}) as Record<string, unknown>),
        milestonesReached: input.milestonesReached ?? [],
      },
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.status, 'active')
      )
    )
    .returning({ id: learningSessions.id });

  // Session was already closed or resumed — skip side-effects
  if (!updated) {
    return {
      message: 'Session already closed or resumed',
      sessionId,
      topicId: session.topicId ?? null,
      subjectId: session.subjectId,
      sessionType: session.sessionType,
      verificationType: session.verificationType ?? null,
      wallClockSeconds,
      summaryStatus: effectiveSummaryStatus,
      interleavedTopicIds: undefined,
      escalationRungs: undefined,
    };
  }

  clearSessionStaticContext(profileId, sessionId);

  await createPendingSessionSummary(
    db,
    sessionId,
    profileId,
    session.topicId ?? null,
    effectiveSummaryStatus
  );

  if (effectiveSummaryStatus === 'skipped') {
    await incrementSummarySkips(db, profileId);
  }

  // FR92: Extract interleaved topic IDs from session metadata
  const interleavedTopicIds = await resolveInterleavedTopicIds(
    db,
    profileId,
    sessionId,
    session.sessionType
  );

  return {
    message:
      nextStatus === 'auto_closed' ? 'Session auto-closed' : 'Session closed',
    sessionId,
    topicId: session.topicId ?? null,
    subjectId: session.subjectId,
    sessionType: session.sessionType,
    verificationType: session.verificationType ?? null,
    wallClockSeconds,
    summaryStatus: effectiveSummaryStatus,
    interleavedTopicIds,
    escalationRungs,
  };
}

export async function closeStaleSessions(
  db: Database,
  cutoff: Date
): Promise<
  Array<{
    profileId: string;
    sessionId: string;
    topicId: string | null;
    subjectId: string;
    sessionType: string;
    verificationType: string | null;
    wallClockSeconds: number;
    summaryStatus:
      | 'pending'
      | 'submitted'
      | 'accepted'
      | 'skipped'
      | 'auto_closed';
    interleavedTopicIds?: string[];
    escalationRungs?: number[];
  }>
> {
  // Intentional cross-profile batch query: this cron scans all active sessions
  // and closes only those stale beyond the cutoff, so scoped-repo access does
  // not apply here.
  const staleSessions = await db.query.learningSessions.findMany({
    where: and(
      eq(learningSessions.status, 'active'),
      lt(learningSessions.lastActivityAt, cutoff)
    ),
  });

  const results: Array<{
    profileId: string;
    sessionId: string;
    topicId: string | null;
    subjectId: string;
    sessionType: string;
    verificationType: string | null;
    wallClockSeconds: number;
    summaryStatus:
      | 'pending'
      | 'submitted'
      | 'accepted'
      | 'skipped'
      | 'auto_closed';
    interleavedTopicIds?: string[];
    escalationRungs?: number[];
  }> = [];

  for (const staleSession of staleSessions) {
    const result = await closeSession(
      db,
      staleSession.profileId,
      staleSession.id,
      {
        reason: 'silence_timeout',
        summaryStatus: 'auto_closed',
      }
    );

    // BD-05: Skip sessions that were resumed between read and write
    if (result.message === 'Session already closed or resumed') {
      continue;
    }

    results.push({
      profileId: staleSession.profileId,
      ...result,
    });
  }

  return results;
}

export async function getSessionCompletionContext(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{
  sessionId: string;
  topicId: string | null;
  subjectId: string;
  sessionType: string;
  mode?: string;
  verificationType: string | null;
  exchangeCount: number;
  interleavedTopicIds?: string[];
  escalationRungs?: number[];
}> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // [BUG-913 sweep] Tie-break by id when created_at collides — see
  // getSessionTranscript below for the full rationale.
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
  });

  return {
    sessionId,
    topicId: session.topicId ?? null,
    subjectId: session.subjectId,
    sessionType: session.sessionType,
    mode: (session.metadata as Record<string, unknown> | undefined)
      ?.effectiveMode as string | undefined,
    verificationType: session.verificationType ?? null,
    exchangeCount: session.exchangeCount,
    interleavedTopicIds: await resolveInterleavedTopicIds(
      db,
      profileId,
      sessionId,
      session.sessionType
    ),
    escalationRungs: collectEscalationRungs(events),
  };
}

export async function getSessionTranscript(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<TranscriptResponse | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  const purgedSummary = await db.query.sessionSummaries.findFirst({
    where: and(
      eq(sessionSummaries.sessionId, sessionId),
      eq(sessionSummaries.profileId, profileId)
    ),
    columns: {
      purgedAt: true,
      llmSummary: true,
      learnerRecap: true,
      topicId: true,
    },
  });

  if (purgedSummary?.purgedAt) {
    const parsed = llmSummarySchema.safeParse(purgedSummary.llmSummary);
    if (!parsed.success) {
      logger.error('transcript: purgedAt set but llmSummary is invalid', {
        sessionId,
        profileId,
        llmSummaryValid: parsed.success,
      });
      return null;
    }

    return {
      archived: true,
      archivedAt: purgedSummary.purgedAt.toISOString(),
      summary: {
        narrative: parsed.data.narrative,
        topicsCovered: parsed.data.topicsCovered,
        sessionState: parsed.data.sessionState,
        reEntryRecommendation: parsed.data.reEntryRecommendation,
        learnerRecap: purgedSummary.learnerRecap ?? null,
        topicId: purgedSummary.topicId ?? null,
      },
    };
  }

  // [BUG-913] Tie-break by id when created_at collides. Batch inserts share
  // a single Postgres NOW() snapshot, so multiple events created in the same
  // statement get identical timestamps and ORDER BY created_at returns heap
  // order — nondeterministic across re-runs. sessionEvents.id is a UUID v7
  // generated in JS in monotonic insertion order, so asc(id) is the natural
  // tie-break. The same pattern exists in 13 other reads of sessionEvents
  // across this codebase (homework-summary, session-completed, session-recap,
  // verification-completion, session-context-builders, session-exchange,
  // evaluate-data, plus three more in this file) — sweep follow-up tracked
  // separately to keep this fix's blast radius contained.
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
  });

  // [I-1] Count leaked ai_response rows so we can emit ONE aggregate log
  // entry instead of one warn per row. projectAiResponseContent is called
  // with silent:true to suppress per-row parseEnvelope noise; we track
  // whether each row was repaired (content changed) to count leaks.
  let leakedEnvelopeCount = 0;

  const exchanges = events
    .filter(
      (event) =>
        event.eventType === 'user_message' ||
        event.eventType === 'ai_response' ||
        event.eventType === 'system_prompt'
    )
    .map((event) => {
      const meta = event.metadata as Record<string, unknown> | null;
      const isSystemPrompt = event.eventType === 'system_prompt';
      // [BUG-934] Strip leaked envelope JSON from ai_response content before
      // it reaches the rendered chat bubble. Use silent:true to suppress
      // per-row warn — aggregate is emitted below after mapping.
      let content = event.content;
      if (event.eventType === 'ai_response') {
        const projected = projectAiResponseContent(event.content, {
          silent: true,
        });
        if (projected !== event.content) {
          leakedEnvelopeCount++;
        }
        content = projected;
      }
      return {
        eventId: event.id,
        role: event.eventType === 'user_message' ? 'user' : 'assistant',
        content,
        timestamp: event.createdAt.toISOString(),
        isSystemPrompt,
        escalationRung:
          !isSystemPrompt && typeof meta?.escalationRung === 'number'
            ? meta.escalationRung
            : undefined,
      } as const;
    });

  // Emit ONE aggregate log entry when any rows were repaired. This avoids
  // N warn lines per transcript and keeps the signal queryable.
  if (leakedEnvelopeCount > 0) {
    logger.warn('transcript.hydration.envelope_leak_repaired', {
      surface: 'transcript.hydration',
      leakedEventCount: leakedEnvelopeCount,
      sessionId,
    });
  }

  const rawSession = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
  });

  const metadata =
    (rawSession?.metadata as Record<string, unknown> | null) ?? {};
  const milestonesReached = Array.isArray(metadata['milestonesReached'])
    ? metadata['milestonesReached']
        .map((value) => celebrationReasonSchema.safeParse(value))
        .filter(
          (result): result is { success: true; data: CelebrationReason } =>
            result.success
        )
        .map((result) => result.data)
    : [];

  return {
    archived: false,
    session: {
      sessionId: session.id,
      subjectId: session.subjectId,
      topicId: session.topicId,
      sessionType: session.sessionType,
      inputMode: session.inputMode,
      verificationType: session.verificationType ?? null,
      startedAt: session.startedAt,
      exchangeCount: session.exchangeCount,
      milestonesReached,
      wallClockSeconds: session.wallClockSeconds,
    },
    exchanges,
  };
}

// ---------------------------------------------------------------------------
// Thin wrappers for event recording (require getSession)
// ---------------------------------------------------------------------------

export async function recordSystemPrompt(
  db: Database,
  profileId: string,
  sessionId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  await insertSessionEvent(db, session, profileId, {
    sessionId,
    eventType: 'system_prompt',
    content,
    metadata,
    touchSession: true,
  });
}

export async function recordSessionEvent(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionAnalyticsEventInput
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  await insertSessionEvent(db, session, profileId, {
    sessionId,
    eventType: input.eventType,
    content: input.content ?? '',
    metadata: input.metadata,
    touchSession: true,
  });
}

export async function flagContent(
  db: Database,
  profileId: string,
  sessionId: string,
  input: ContentFlagInput
): Promise<{ message: string }> {
  // Look up the session to get its subjectId
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  await insertSessionEvent(db, session, profileId, {
    sessionId,
    eventType: 'flag',
    content: 'Content flagged',
    metadata: {
      eventId: input.eventId,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });

  return { message: 'Content flagged for review. Thank you!' };
}

// ---------------------------------------------------------------------------
// Resume nudge — find a recent auto-closed freeform session worth resuming
// ---------------------------------------------------------------------------

export interface ResumeNudgeCandidate {
  sessionId: string;
  topicHint: string;
  exchangeCount: number;
  createdAt: string;
}

export async function claimSessionForFilingRetry(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ id: string } | undefined> {
  const [updated] = await db
    .update(learningSessions)
    .set({
      filingStatus: 'filing_pending',
      filingRetryCount: sql`${learningSessions.filingRetryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.filingStatus, 'filing_failed'),
        lt(learningSessions.filingRetryCount, 3)
      )
    )
    .returning({ id: learningSessions.id });

  return updated;
}

export async function getResumeNudgeCandidate(
  db: Database,
  profileId: string
): Promise<ResumeNudgeCandidate | null> {
  const [candidate] = await db
    .select({
      id: learningSessions.id,
      rawInput: learningSessions.rawInput,
      exchangeCount: learningSessions.exchangeCount,
      createdAt: learningSessions.createdAt,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.status, 'auto_closed'),
        eq(learningSessions.sessionType, 'learning'),
        isNull(learningSessions.topicId),
        gte(learningSessions.exchangeCount, 5),
        sql`${learningSessions.metadata} ->> 'effectiveMode' = 'freeform'`,
        gte(learningSessions.createdAt, sql`NOW() - INTERVAL '7 days'`)
      )
    )
    .orderBy(desc(learningSessions.createdAt))
    .limit(1);

  if (!candidate) return null;

  const [firstMessage] = await db
    .select({ content: sessionEvents.content })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, candidate.id),
        eq(sessionEvents.profileId, profileId),
        eq(sessionEvents.eventType, 'user_message')
      )
    )
    // [BUG-913 sweep] Tie-break by id when created_at collides — see
    // getSessionTranscript above for the full rationale. With limit:1 the
    // tiebreak makes "first user message" deterministic when a batch insert
    // landed multiple events at the same NOW() snapshot.
    .orderBy(asc(sessionEvents.createdAt), asc(sessionEvents.id))
    .limit(1);

  return {
    sessionId: candidate.id,
    topicHint:
      candidate.rawInput ??
      firstMessage?.content?.slice(0, 80) ??
      'your last session',
    exchangeCount: candidate.exchangeCount,
    createdAt: candidate.createdAt.toISOString(),
  };
}
