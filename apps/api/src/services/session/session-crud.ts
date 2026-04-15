// ---------------------------------------------------------------------------
// Session CRUD — core session lifecycle: start, get, close, transcript
// ---------------------------------------------------------------------------

import { eq, and, asc, lt } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  subjects,
  curricula,
  curriculumTopics,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  LearningSession,
  SessionStartInput,
  SessionCloseInput,
  SessionAnalyticsEventInput,
  ContentFlagInput,
  SessionType,
  InputMode,
  VerificationType,
} from '@eduagent/schemas';
import { insertSessionEvent } from './session-events';
import { getSubject } from '../subject';
import { createPendingSessionSummary } from '../summaries';
import { incrementSummarySkips } from '../settings';
import { computeActiveSeconds } from './session-context-builders';
import { mapSessionRow } from './session-events';
import { clearSessionStaticContext } from './session-cache';
import type { TimedEvent } from './session-context-builders';

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
  if (!row?.metadata) {
    return undefined;
  }

  const meta = row.metadata as {
    interleavedTopics?: Array<{ topicId: string }>;
  };
  return meta.interleavedTopics?.map((topic) => topic.topicId);
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
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: asc(sessionEvents.createdAt),
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
  verificationType: string | null;
  interleavedTopicIds?: string[];
  escalationRungs?: number[];
}> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: asc(sessionEvents.createdAt),
  });

  return {
    sessionId,
    topicId: session.topicId ?? null,
    subjectId: session.subjectId,
    sessionType: session.sessionType,
    verificationType: session.verificationType ?? null,
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
): Promise<{
  session: {
    sessionId: string;
    subjectId: string;
    topicId: string | null;
    sessionType: SessionType;
    inputMode: InputMode;
    verificationType?: VerificationType | null;
    startedAt: string;
    exchangeCount: number;
    milestonesReached: string[];
    wallClockSeconds: number | null;
  };
  exchanges: Array<{
    eventId?: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    escalationRung?: number;
    isSystemPrompt?: boolean;
  }>;
} | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId)
    ),
    orderBy: asc(sessionEvents.createdAt),
  });

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
      return {
        eventId: event.id,
        role: event.eventType === 'user_message' ? 'user' : 'assistant',
        content: event.content,
        timestamp: event.createdAt.toISOString(),
        isSystemPrompt,
        escalationRung:
          !isSystemPrompt && typeof meta?.escalationRung === 'number'
            ? meta.escalationRung
            : undefined,
      } as const;
    });

  const rawSession = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
  });

  const metadata =
    (rawSession?.metadata as Record<string, unknown> | null) ?? {};
  const milestonesReached = Array.isArray(metadata['milestonesReached'])
    ? metadata['milestonesReached'].filter(
        (value): value is string => typeof value === 'string'
      )
    : [];

  return {
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
