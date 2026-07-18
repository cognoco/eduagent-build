// ---------------------------------------------------------------------------
// Session CRUD — core session lifecycle: start, get, close, transcript
// ---------------------------------------------------------------------------

import {
  eq,
  and,
  asc,
  desc,
  gte,
  gt,
  isNull,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
  subjects,
  curricula,
  curriculumTopics,
  curriculumBooks,
  bookSuggestions,
  createScopedRepository,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type {
  CelebrationReason,
  ChildSession,
  LearningSession,
  SessionStartInput,
  FirstCurriculumSessionStartInput,
  ExtractedInterviewSignals,
  SessionCloseInput,
  SessionAnalyticsEventInput,
  ContentFlagInput,
  TranscriptResponse,
  HomeworkSummary,
  EngagementSignal,
  SessionMetadata,
  BookTopicGenerationResult,
  SystemPromptIntent,
} from '@eduagent/schemas';
export type { ChildSession } from '@eduagent/schemas';
import {
  celebrationReasonSchema,
  extractedInterviewSignalsSchema,
  homeworkSummarySchema,
  llmSummarySchema,
  engagementSignalSchema,
  getSessionEffectiveMode,
  MAX_EXCHANGES_PER_SESSION,
} from '@eduagent/schemas';
import { NotFoundError } from '../../errors';
import { insertSessionEvent } from './session-events';
import { resolveSystemPromptIntent } from './system-prompt-intents';
import { getSubject } from '../subject';
import { createPendingSessionSummary } from '../summaries';
import { deleteTopicIfSafe, persistBookTopics } from '../curriculum';
import { generateBookTopics } from '../book-generation';
import { buildFallbackBookTopics } from '../book-generation-fallbacks';
import { getPersonAge } from '../identity-v2/helpers';
import { computeActiveSeconds } from './session-context-builders';
import { mapSessionRow } from './session-events';
import { clearSessionStaticContext } from './session-cache';
import { matchTopicByIntent } from './session-topic-matcher';
import { projectAiResponseContent } from '../llm/project-response';
import { createLogger } from '../logger';
import { paginateRows } from '../pagination';
import { addBreadcrumb, captureException } from '../sentry';
import { sleep } from '../sleep';
import type { TimedEvent } from './session-context-builders';
import { findOwnedCurriculumTopics } from '../curriculum-topic-ownership';
import { FILING_CONFIG } from '../../config/filing';

const logger = createLogger();

function hasMinimumFreeformLibraryFilingExchanges(session: {
  exchangeCount?: number | null;
}): boolean {
  return (session.exchangeCount ?? 0) >= FILING_CONFIG.minFreeformExchanges;
}

/**
 * Canonical predicate for "this freeform session should be auto-filed into the
 * library when it closes." Lives here (not in session-filing-dispatch) so both
 * the HTTP-close dispatch path AND the stale-cleanup cron path can share ONE
 * definition without a circular import — session-filing-dispatch re-exports it.
 *
 * A session qualifies when it is a freeform session that has never been filed
 * (no topic, no filedAt, no in-flight/failed filing claim) and has reached the
 * minimum exchange count. Status is intentionally NOT checked: both a
 * user-closed ('completed') and an abandoned ('auto_closed') session are
 * eligible — `claimSessionForAutoFiling` likewise filters only on the
 * topic/filedAt/filingStatus null-state, never on status.
 */
export function isClosePathAutoFileEligible(session: {
  metadata?: unknown;
  topicId?: string | null;
  filedAt?: string | Date | null;
  filingStatus?: string | null;
  exchangeCount?: number | null;
}): boolean {
  return (
    getSessionEffectiveMode(session) === 'freeform' &&
    session.topicId == null &&
    session.filedAt == null &&
    session.filingStatus == null &&
    hasMinimumFreeformLibraryFilingExchanges(session)
  );
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class SubjectInactiveError extends Error {
  constructor(public readonly subjectStatus: 'paused' | 'archived') {
    const action = subjectStatus === 'paused' ? 'resume' : 'restore';
    super(
      `Subject is ${subjectStatus} \u2014 ${action} it before starting a session`,
    );
    this.name = 'SubjectInactiveError';
  }
}

/**
 * Maximum exchanges allowed per session (defense-in-depth — issue #15).
 *
 * Canonical definition lives in `@eduagent/schemas` so mobile can import it
 * (BUG-211, 2026-05-18). Re-exported here for backward compatibility with
 * existing API call sites; new code should import from `@eduagent/schemas`.
 */
export { MAX_EXCHANGES_PER_SESSION } from '@eduagent/schemas';

export class SessionExchangeLimitError extends Error {
  constructor(public readonly exchangeCount: number) {
    super(
      `Session has reached the maximum of ${MAX_EXCHANGES_PER_SESSION} exchanges`,
    );
    this.name = 'SessionExchangeLimitError';
  }
}

/**
 * [WI-2372] Thrown by `assertExchangeConsent` when the profile's consent has
 * been withdrawn (parental or adult self-consent) — refuses the exchange
 * before any LLM dispatch. Mapped to 403 CONSENT_WITHDRAWN in routes/sessions.ts.
 */
export class ConsentWithdrawnError extends Error {
  constructor() {
    super('Consent has been withdrawn — processing is refused');
    this.name = 'ConsentWithdrawnError';
  }
}

export class CurriculumSessionNotReadyError extends Error {
  constructor() {
    super('Curriculum is still being prepared');
    this.name = 'CurriculumSessionNotReadyError';
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
export {
  buildTopicIntentMatcherMessages,
  MATCH_CONFIDENCE_FLOOR,
  MATCHER_TIMEOUT_MS,
  matchTopicByIntent,
  runTopicIntentMatcher,
} from './session-topic-matcher';

function collectEscalationRungs(
  events: Array<TimedEvent>,
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
        .filter((rung): rung is number => rung != null),
    ),
  ).sort((left, right) => left - right);

  return rungs.length > 0 ? rungs : undefined;
}

async function resolveInterleavedTopicIds(
  db: Database,
  profileId: string,
  sessionId: string,
  sessionType: string,
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
  input: SessionStartInput,
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
          eq(subjects.profileId, profileId),
        ),
      )
      .limit(1);
    if (!topic) {
      throw new Error('Topic not found in this subject');
    }
  }

  // [L10-001] Session row + session_start audit event must be atomic — if the
  // audit insert fails after the session is created, the session would exist
  // with no session_start event in its audit trail.
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
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

    if (!inserted)
      throw new Error('Insert learning session did not return a row');

    await tx.insert(sessionEvents).values({
      sessionId: inserted.id,
      profileId,
      subjectId,
      eventType: 'session_start' as const,
      content: '',
    });

    return inserted;
  });

  return mapSessionRow(row);
}

const FIRST_CURRICULUM_SESSION_WAIT_MS = 25_000;
const FIRST_CURRICULUM_SESSION_POLL_MS = 750;
const FOCUSED_BOOK_TOPIC_GENERATION_TIMEOUT_MS = 5_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function loadLatestCompletedDraftSignals(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<ExtractedInterviewSignals | undefined> {
  const rows = await db
    .select({ metadata: learningSessions.metadata })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.subjectId, subjectId),
      ),
    )
    .orderBy(desc(learningSessions.updatedAt), desc(learningSessions.id))
    .limit(10);

  for (const row of rows) {
    const metadata =
      row.metadata &&
      typeof row.metadata === 'object' &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : undefined;
    if (metadata?.['topicProbeExtractionStatus'] !== 'completed') {
      continue;
    }
    const parsed = extractedInterviewSignalsSchema.safeParse(
      metadata['extractedSignals'],
    );
    if (parsed.success) return parsed.data;
  }

  return undefined;
}

async function findFirstAvailableTopicId(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId?: string,
): Promise<string | undefined> {
  // Verify optional book belongs to this subject before using it as a filter.
  if (bookId) {
    const [book] = await db
      .select({ id: curriculumBooks.id })
      .from(curriculumBooks)
      .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
      .where(
        and(
          eq(curriculumBooks.id, bookId),
          eq(curriculumBooks.subjectId, subjectId),
          eq(subjects.profileId, profileId),
        ),
      )
      .limit(1);
    if (!book) {
      throw new NotFoundError('Book');
    }
  }

  const [topic] = await db
    .select({ id: curriculumTopics.id })
    .from(curriculumTopics)
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(subjects, eq(subjects.id, curricula.subjectId))
    .where(
      and(
        eq(curricula.subjectId, subjectId),
        eq(subjects.profileId, profileId),
        eq(curriculumTopics.skipped, false),
        ...(bookId ? [eq(curriculumTopics.bookId, bookId)] : []),
      ),
    )
    .orderBy(asc(curriculumTopics.sortOrder), asc(curriculumTopics.id))
    .limit(1);
  return topic?.id;
}

async function materializeFocusedBookTopics(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId: string,
): Promise<void> {
  const [book] = await db
    .select({
      id: curriculumBooks.id,
      title: curriculumBooks.title,
      description: curriculumBooks.description,
    })
    .from(curriculumBooks)
    .innerJoin(subjects, eq(subjects.id, curriculumBooks.subjectId))
    .where(
      and(
        eq(curriculumBooks.id, bookId),
        eq(curriculumBooks.subjectId, subjectId),
        eq(subjects.profileId, profileId),
      ),
    )
    .limit(1);

  if (!book) {
    throw new NotFoundError('Book');
  }

  const learnerAge = await getPersonAge(db, profileId);
  let result: BookTopicGenerationResult;
  try {
    result = await withTimeout(
      generateBookTopics(book.title, book.description ?? '', learnerAge),
      FOCUSED_BOOK_TOPIC_GENERATION_TIMEOUT_MS,
      'Focused book topic generation timed out',
    );
  } catch (error) {
    logger.warn('focused_book_topic_generation_fallback', {
      metric: 'focused_book_topic_generation_fallback',
      profileId,
      subjectId,
      bookId,
      error: error instanceof Error ? error.message : String(error),
    });
    // [WI-481] Escalate the silent recovery: the fallback keeps the learner
    // moving, but a structured-warn alone makes a sustained generation outage
    // invisible to Sentry. Emit captureException so the fallback rate is
    // queryable and a regression in generateBookTopics surfaces in alerting.
    captureException(error, {
      profileId,
      extra: {
        context: 'session.focused_book_topic_generation',
        subjectId,
        bookId,
      },
    });
    result = buildFallbackBookTopics(book.title, book.description ?? '');
  }

  if (result.topics.length === 0) {
    logger.warn('focused_book_topic_generation_empty_fallback', {
      metric: 'focused_book_topic_generation_fallback',
      profileId,
      subjectId,
      bookId,
    });
    result = buildFallbackBookTopics(book.title, book.description ?? '');
  }

  await persistBookTopics(
    db,
    profileId,
    subjectId,
    bookId,
    result.topics,
    result.connections,
  );
}

const sessionCrudDependencies = {
  findFirstAvailableTopicId,
  loadLatestCompletedDraftSignals,
  loadSubjectStructureType,
  materializeFocusedBookTopics,
  matchTopicByIntent,
  startSession,
};
const defaultSessionCrudDependencies = { ...sessionCrudDependencies };

export const __sessionCrudTestHooks = {
  setDependencies(overrides: Partial<typeof sessionCrudDependencies>): void {
    Object.assign(sessionCrudDependencies, overrides);
  },
  resetDependencies(): void {
    Object.assign(sessionCrudDependencies, defaultSessionCrudDependencies);
  },
};

async function loadSubjectStructureType(
  db: Database,
  profileId: string,
  subjectId: string,
  bookId?: string,
): Promise<'focused_book' | 'narrow' | 'broad'> {
  const suggestionCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookSuggestions)
    .innerJoin(subjects, eq(subjects.id, bookSuggestions.subjectId))
    .where(
      and(
        eq(bookSuggestions.subjectId, subjectId),
        eq(subjects.profileId, profileId),
      ),
    );
  if ((suggestionCount[0]?.count ?? 0) > 0) return 'broad';
  if (bookId) return 'focused_book';
  return 'narrow';
}

export async function startFirstCurriculumSession(
  db: Database,
  profileId: string,
  subjectId: string,
  input: FirstCurriculumSessionStartInput,
  options: { matcherEnabled?: boolean } = {},
): Promise<LearningSession> {
  const startedAt = Date.now();
  const deadline = Date.now() + FIRST_CURRICULUM_SESSION_WAIT_MS;
  let focusedBookMaterializeAttempted = false;

  while (Date.now() <= deadline) {
    const [initialTopicId, extractedSignals] = await Promise.all([
      sessionCrudDependencies.findFirstAvailableTopicId(
        db,
        profileId,
        subjectId,
        input.bookId,
      ),
      sessionCrudDependencies.loadLatestCompletedDraftSignals(
        db,
        profileId,
        subjectId,
      ),
    ]);
    let topicId = initialTopicId;

    if (!topicId && input.bookId && !focusedBookMaterializeAttempted) {
      focusedBookMaterializeAttempted = true;
      await sessionCrudDependencies.materializeFocusedBookTopics(
        db,
        profileId,
        subjectId,
        input.bookId,
      );
      topicId = await sessionCrudDependencies.findFirstAvailableTopicId(
        db,
        profileId,
        subjectId,
        input.bookId,
      );
    }

    if (topicId) {
      const topicAvailableMs = Date.now() - startedAt;
      const structureType =
        await sessionCrudDependencies.loadSubjectStructureType(
          db,
          profileId,
          subjectId,
          input.bookId,
        );
      const intentDecision = await sessionCrudDependencies.matchTopicByIntent(
        db,
        profileId,
        subjectId,
        {
          fallbackTopicId: topicId,
          explicitTopicId: input.topicId,
          bookId: input.bookId,
          matcherEnabled: options.matcherEnabled ?? false,
          firstSessionStartedAt: startedAt,
        },
      );
      const prewarmHit = topicAvailableMs < FIRST_CURRICULUM_SESSION_POLL_MS;
      addBreadcrumb(
        'first curriculum session topic check',
        'curriculum.first-session',
        'info',
        { prewarmHit, topicAvailableMs, structureType },
      );
      logger.info('first_curriculum_session_topic_check', {
        profileId,
        subjectId,
        bookId: input.bookId,
        prewarmHit,
        topicAvailableMs,
        structureType,
      });
      return sessionCrudDependencies.startSession(db, profileId, subjectId, {
        subjectId,
        topicId: intentDecision.topicId,
        sessionType: input.sessionType ?? 'learning',
        inputMode: input.inputMode ?? 'text',
        verificationType: input.verificationType,
        metadata: {
          inputMode: input.inputMode ?? 'text',
          effectiveMode: 'learning',
          ...(extractedSignals
            ? { onboardingFastPath: { extractedSignals } }
            : {}),
        },
      });
    }

    await sleep(FIRST_CURRICULUM_SESSION_POLL_MS);
  }

  throw new CurriculumSessionNotReadyError();
}

export async function getSession(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<LearningSession | null> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  return row ? mapSessionRow(row) : null;
}

export async function persistSessionMetadata(
  db: Database,
  profileId: string,
  sessionId: string,
  partial: Partial<SessionMetadata>,
): Promise<LearningSession | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      )
      .for('update')
      .limit(1);

    if (!current) return null;

    const nextMetadata: Record<string, unknown> = {
      ...((current.metadata as Record<string, unknown> | null) ?? {}),
    };
    for (const [key, value] of Object.entries(
      partial as Record<string, unknown>,
    )) {
      if (value === undefined) {
        delete nextMetadata[key];
      } else {
        nextMetadata[key] = value;
      }
    }

    const [row] = await tx
      .update(learningSessions)
      .set({ metadata: nextMetadata, updatedAt: new Date() })
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      )
      .returning();

    return row ? mapSessionRow(row) : null;
  });
}

export async function clearContinuationDepth(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<LearningSession | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  const metadata = {
    ...((session.metadata as Record<string, unknown> | undefined) ?? {}),
  };
  delete metadata['continuationDepth'];
  delete metadata['continuationOpenerActive'];
  delete metadata['continuationOpenerStartedExchange'];

  const [row] = await db
    .update(learningSessions)
    .set({ metadata, updatedAt: new Date() })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    )
    .returning();

  return row ? mapSessionRow(row) : null;
}

export async function closeSession(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionCloseInput,
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
    throw new NotFoundError('Session');
  }

  const now = new Date();
  const sessionStartedAt = new Date(session.startedAt);
  const wallClockSeconds = Math.max(
    0,
    Math.round((now.getTime() - sessionStartedAt.getTime()) / 1000),
  );

  // FR210: Compute active time from session event gaps (internal analytics only)
  // [BUG-913 sweep] Tie-break by id when created_at collides — see
  // getSessionTranscript below for the full rationale. computeActiveSeconds
  // walks events in order, so a flapping order between batched events would
  // produce nondeterministic active-time values for the same session.
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId),
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

  // BD-05 + [CR-2026-05-19-M3]: Wrap the session close UPDATE and summary
  // INSERT in a single transaction so a crash between them cannot leave the
  // session in 'completed' with no summary row. The compare-and-swap guard
  // (status = 'active') still prevents double-close; the transaction just
  // makes the write pair atomic.
  const updated = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    const [row] = await txDb
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
          eq(learningSessions.status, 'active'),
        ),
      )
      .returning({ id: learningSessions.id });

    if (!row) return null;

    await createPendingSessionSummary(
      txDb,
      sessionId,
      profileId,
      session.topicId ?? null,
      effectiveSummaryStatus,
    );

    return row;
  });

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

  // FR92: Extract interleaved topic IDs from session metadata
  const interleavedTopicIds = await resolveInterleavedTopicIds(
    db,
    profileId,
    sessionId,
    session.sessionType,
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

export interface StaleSessionCloseResult {
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
  // Whether this just-closed session should be dispatched for freeform
  // library auto-filing by the stale-cleanup cron (see closeStaleSessions).
  autoFileEligible: boolean;
}

export interface StaleSessionCloseFailure {
  profileId: string;
  sessionId: string;
  error: string;
}

/**
 * Plain object carrying both the successfully-closed sessions and the
 * per-session failures. It is a plain object (NOT an array with an attached
 * property) so that the `failures` channel survives the Inngest `step.run`
 * JSON boundary: the cron calls `closeStaleSessions` inside `step.run(...)`,
 * whose return value Inngest JSON-serializes for memoization. `JSON.stringify`
 * drops non-enumerable properties and named (non-index) properties of arrays,
 * so an array-with-`failures` shape would silently lose `failures` after the
 * step boundary. Consumers read `.sessions` and `.failures` explicitly.
 */
export interface StaleSessionCloseBatch {
  sessions: StaleSessionCloseResult[];
  failures: StaleSessionCloseFailure[];
}

// [WI-958] Page size for the stale-session close scan. Mirrors the 500-row
// limit used by the sibling filing-stranded-backfill job. Callers may pass a
// smaller limit for testing the pagination path.
export const CLOSE_STALE_SESSIONS_PAGE_SIZE = 500;

// Composite (lastActivityAt, id) cursor for stable pagination when multiple
// sessions share the same lastActivityAt timestamp.
interface StaleSessionCursor {
  lastActivityAt: Date;
  lastId: string;
}

export async function closeStaleSessions(
  db: Database,
  cutoff: Date,
  pageSize: number = CLOSE_STALE_SESSIONS_PAGE_SIZE,
): Promise<StaleSessionCloseBatch> {
  // [WI-958] Bounded cursor-paginated scan: instead of loading the entire
  // cross-profile backlog at once (unbounded memory + O(N) serial round-trips),
  // process stale active sessions in pages of `pageSize`, advancing via a
  // composite (lastActivityAt, id) cursor — mirroring the filing-stranded-backfill
  // sibling. Intentional cross-profile batch: scoped-repo access does not apply.
  const results: StaleSessionCloseResult[] = [];
  const failures: StaleSessionCloseFailure[] = [];

  let cursor: StaleSessionCursor | null = null;

  for (;;) {
    const cursorFilter: SQL<unknown> | undefined = cursor
      ? or(
          gt(learningSessions.lastActivityAt, cursor.lastActivityAt),
          and(
            eq(learningSessions.lastActivityAt, cursor.lastActivityAt),
            gt(learningSessions.id, cursor.lastId),
          ),
        )
      : undefined;

    const page: (typeof learningSessions.$inferSelect)[] =
      await db.query.learningSessions.findMany({
        where: and(
          eq(learningSessions.status, 'active'),
          lt(learningSessions.lastActivityAt, cutoff),
          cursorFilter,
        ),
        orderBy: [
          asc(learningSessions.lastActivityAt),
          asc(learningSessions.id),
        ],
        limit: pageSize,
      });

    for (const staleSession of page) {
      // Per-session error isolation: a single throwing close must not abort
      // the whole backlog. On failure we escalate via Sentry (silent recovery
      // is banned) and continue, surfacing the failure in `failures`.
      try {
        const result = await closeSession(
          db,
          staleSession.profileId,
          staleSession.id,
          {
            reason: 'silence_timeout',
            summaryStatus: 'auto_closed',
          },
        );

        // BD-05: Skip sessions that were resumed between read and write
        if (result.message === 'Session already closed or resumed') {
          continue;
        }

        results.push({
          profileId: staleSession.profileId,
          ...result,
          // Computed from the pre-close row: closeSession does not touch
          // topicId/filedAt/filingStatus/exchangeCount/metadata, so the
          // freeform-filing eligibility of the just-closed session is identical
          // to that of the row we read. The cron uses this to dispatch the
          // freeform auto-file (mirroring the HTTP close route) so abandoned
          // freeform sessions still land in the library.
          autoFileEligible: isClosePathAutoFileEligible(staleSession),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('closeStaleSessions: failed to close a stale session', {
          profileId: staleSession.profileId,
          sessionId: staleSession.id,
          error: message,
        });
        captureException(error, {
          tags: { area: 'session-stale-cleanup' },
          extra: {
            profileId: staleSession.profileId,
            sessionId: staleSession.id,
          },
        });
        failures.push({
          profileId: staleSession.profileId,
          sessionId: staleSession.id,
          error: message,
        });
      }
    }

    // Advance cursor to last row. If the page was smaller than the limit,
    // we have exhausted all stale sessions.
    if (page.length < pageSize) break;
    const last: typeof learningSessions.$inferSelect = page[page.length - 1]!;
    cursor = { lastActivityAt: last.lastActivityAt, lastId: last.id };
  }

  // Return a plain object so `failures` survives the Inngest step.run JSON
  // boundary (see StaleSessionCloseBatch doc above).
  return { sessions: results, failures };
}

export async function getSessionCompletionContext(
  db: Database,
  profileId: string,
  sessionId: string,
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
    throw new NotFoundError('Session');
  }

  // [BUG-913 sweep] Tie-break by id when created_at collides — see
  // getSessionTranscript below for the full rationale.
  const events = await db.query.sessionEvents.findMany({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId),
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
      session.sessionType,
    ),
    escalationRungs: collectEscalationRungs(events),
  };
}

export async function getSessionTranscript(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<TranscriptResponse | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  const purgedSummary = await db.query.sessionSummaries.findFirst({
    where: and(
      eq(sessionSummaries.sessionId, sessionId),
      eq(sessionSummaries.profileId, profileId),
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
      return {
        archived: true,
        archivedAt: purgedSummary.purgedAt.toISOString(),
        summary: {
          narrative:
            'This conversation was archived, but its detailed retention summary is temporarily unavailable.',
          topicsCovered: [],
          sessionState: 'auto-closed',
          reEntryRecommendation:
            'Resume by asking what you remember from this conversation and choose the next useful practice step.',
          learnerRecap: purgedSummary.learnerRecap ?? null,
          topicId: purgedSummary.topicId ?? null,
        },
      };
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
      eq(sessionEvents.profileId, profileId),
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
        event.eventType === 'system_prompt',
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
      eq(learningSessions.profileId, profileId),
    ),
  });

  const metadata =
    (rawSession?.metadata as Record<string, unknown> | null) ?? {};
  const milestonesReached = Array.isArray(metadata['milestonesReached'])
    ? metadata['milestonesReached']
        .map((value) => celebrationReasonSchema.safeParse(value))
        .filter(
          (result): result is { success: true; data: CelebrationReason } =>
            result.success,
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

/**
 * Record a system-prompt event. WI-373: the caller supplies only the validated
 * intent token; the canonical prompt text is resolved *here* from the
 * server-owned map, so the persisted `content` can never diverge from the
 * server's text regardless of caller. Provenance is owned here too — every
 * write stamps `metadata.source = 'server'` so the replay layer can distinguish
 * trusted server-authored events from any (now-impossible) client-authored row.
 */
export async function recordSystemPrompt(
  db: Database,
  profileId: string,
  sessionId: string,
  intent: SystemPromptIntent,
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new NotFoundError('Session');
  }

  await insertSessionEvent(db, session, profileId, {
    sessionId,
    eventType: 'system_prompt',
    content: resolveSystemPromptIntent(intent),
    metadata: { source: 'server', intent },
    touchSession: true,
  });
}

export async function recordSessionEvent(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionAnalyticsEventInput,
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new NotFoundError('Session');
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
  input: ContentFlagInput,
): Promise<{ message: string }> {
  // Look up the session to get its subjectId
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new NotFoundError('Session');
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

export interface LibraryFilingRequest {
  session: LearningSession;
  dispatchId: string;
}

function createLibraryFilingDispatchId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? generateUUIDv7();
  return `${prefix}-${randomId}`;
}

async function hasDurableTranscriptEvents(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const event = await db.query.sessionEvents.findFirst({
    where: and(
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.profileId, profileId),
      inArray(sessionEvents.eventType, ['user_message', 'ai_response']),
    ),
    columns: { id: true },
  });

  return Boolean(event);
}

export async function markSessionKeptOutOfLibrary(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<LearningSession | null> {
  const existing = await getSession(db, profileId, sessionId);
  if (!existing) return null;

  const [updated] = await db
    .update(learningSessions)
    .set({
      topicId: null,
      filedAt: null,
      filingStatus: 'filing_kept_out',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    )
    .returning();

  if (updated && existing.topicId) {
    await deleteTopicIfSafe(db, profileId, sessionId, existing.topicId);
  }

  return updated ? mapSessionRow(updated) : null;
}

export async function requestSessionLibraryFiling(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<LibraryFilingRequest | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  if (getSessionEffectiveMode(session) !== 'freeform') {
    return null;
  }

  if (!hasMinimumFreeformLibraryFilingExchanges(session)) {
    return null;
  }

  if (session.topicId !== null || session.filedAt !== null) {
    return null;
  }

  if (
    session.filingStatus !== null &&
    session.filingStatus !== 'filing_failed' &&
    session.filingStatus !== 'filing_kept_out'
  ) {
    return null;
  }

  const hasTranscript = await hasDurableTranscriptEvents(
    db,
    profileId,
    sessionId,
  );
  if (!hasTranscript) {
    return null;
  }

  const statusPredicate =
    session.filingStatus === null
      ? isNull(learningSessions.filingStatus)
      : eq(learningSessions.filingStatus, session.filingStatus);

  const [updated] = await db
    .update(learningSessions)
    .set({
      filingStatus: null,
      filingRetryCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        isNull(learningSessions.topicId),
        isNull(learningSessions.filedAt),
        statusPredicate,
      ),
    )
    .returning();

  return updated
    ? {
        session: mapSessionRow(updated),
        dispatchId: createLibraryFilingDispatchId('add'),
      }
    : null;
}

export async function restoreSessionForAutoFiling(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<LibraryFilingRequest | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  if (getSessionEffectiveMode(session) !== 'freeform') {
    return null;
  }

  if (!hasMinimumFreeformLibraryFilingExchanges(session)) {
    return null;
  }

  if (
    session.filingStatus !== 'filing_kept_out' ||
    session.topicId !== null ||
    session.filedAt !== null
  ) {
    return null;
  }

  const [updated] = await db
    .update(learningSessions)
    .set({
      filingStatus: null,
      filingRetryCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.filingStatus, 'filing_kept_out'),
        isNull(learningSessions.topicId),
        isNull(learningSessions.filedAt),
      ),
    )
    .returning();

  return updated
    ? {
        session: mapSessionRow(updated),
        dispatchId: createLibraryFilingDispatchId('restore'),
      }
    : null;
}

export async function resetFilingForRetry(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<LibraryFilingRequest | null> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) return null;

  if (getSessionEffectiveMode(session) !== 'freeform') {
    return null;
  }

  if (!hasMinimumFreeformLibraryFilingExchanges(session)) {
    return null;
  }

  if (
    session.filingStatus !== 'filing_failed' &&
    session.filingStatus !== 'filing_kept_out'
  ) {
    return null;
  }

  if (session.topicId !== null || session.filedAt !== null) {
    return null;
  }

  const [updated] = await db
    .update(learningSessions)
    .set({
      filingStatus: null,
      filingRetryCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.filingStatus, session.filingStatus),
        isNull(learningSessions.topicId),
        isNull(learningSessions.filedAt),
      ),
    )
    .returning();

  return updated
    ? {
        session: mapSessionRow(updated),
        dispatchId: createLibraryFilingDispatchId('retry'),
      }
    : null;
}

export async function claimSessionForAutoFiling(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<{ id: string; filingRetryCount: number } | undefined> {
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
        isNull(learningSessions.topicId),
        isNull(learningSessions.filedAt),
        isNull(learningSessions.filingStatus),
      ),
    )
    .returning({
      id: learningSessions.id,
      filingRetryCount: learningSessions.filingRetryCount,
    });

  return updated;
}

export async function markSessionAutoFiled(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string,
): Promise<boolean> {
  const now = new Date();
  const result = await db
    .update(learningSessions)
    .set({
      topicId,
      filedAt: now,
      filingStatus: 'filing_recovered',
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.filingStatus, 'filing_pending'),
      ),
    )
    .returning({ id: learningSessions.id });

  return result.length > 0;
}

export async function markSessionAutoFilingFailed(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await db
    .update(learningSessions)
    .set({
      filingStatus: 'filing_failed',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.filingStatus, 'filing_pending'),
      ),
    )
    .returning({ id: learningSessions.id });

  return result.length > 0;
}

export async function claimSessionForFilingRetry(
  db: Database,
  profileId: string,
  sessionId: string,
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
        lt(learningSessions.filingRetryCount, FILING_CONFIG.maxRetries),
      ),
    )
    .returning({ id: learningSessions.id });

  return updated;
}

export async function getResumeNudgeCandidate(
  db: Database,
  profileId: string,
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
        gte(learningSessions.createdAt, sql`NOW() - INTERVAL '7 days'`),
      ),
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
        eq(sessionEvents.eventType, 'user_message'),
      ),
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

// ---------------------------------------------------------------------------
// Profile session list — extracted from dashboard.ts (PR-2)
// Used by routes/progress.ts (self-view) and re-called by getChildSessions
// (parent-proxy view, which adds its own access guard before delegating here).
// ---------------------------------------------------------------------------

/** Derived from the canonical ChildSession type in @eduagent/schemas. */
export type ChildSessionDrillScore = ChildSession['drills'][number];

type LearningSessionRow = typeof learningSessions.$inferSelect;

export function getSessionMetadata(metadata: unknown): SessionMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as SessionMetadata;
}

export function formatSessionDisplayTitle(
  sessionType: string,
  homeworkSummary?: HomeworkSummary | null,
): string {
  if (homeworkSummary?.displayTitle) {
    return homeworkSummary.displayTitle;
  }

  switch (sessionType) {
    case 'homework':
      return 'Homework';
    case 'interleaved':
      return 'Interleaved Practice';
    default:
      return 'Learning';
  }
}

function asNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeHomeworkSummary(raw: unknown): HomeworkSummary | null {
  const parsed = homeworkSummarySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (!isRecord(raw)) return null;

  const summary =
    typeof raw['summary'] === 'string' && raw['summary'].trim().length > 0
      ? raw['summary'].trim()
      : null;
  if (!summary) return null;

  // Schema-drift hedge: legacy/partial homework metadata. Surface in
  // observability so persistent drift is queryable rather than silently
  // fabricated downstream. Mirrors the notes.ts session_id fallback pattern.
  logger.warn('session.homework_summary_schema_drift', {
    issueCount: parsed.error.issues.length,
    firstIssuePath: parsed.error.issues[0]?.path.join('.') ?? '',
  });
  captureException(parsed.error, {
    tags: {
      surface: 'session.homework_summary_schema_drift',
    },
  });

  const displayTitle =
    typeof raw['displayTitle'] === 'string' &&
    raw['displayTitle'].trim().length > 0
      ? raw['displayTitle'].trim()
      : 'Homework';
  const practicedSkills = Array.isArray(raw['practicedSkills'])
    ? raw['practicedSkills'].filter(
        (skill): skill is string => typeof skill === 'string',
      )
    : [];

  return {
    problemCount: asNonNegativeInt(raw['problemCount']),
    practicedSkills,
    independentProblemCount: asNonNegativeInt(raw['independentProblemCount']),
    guidedProblemCount: asNonNegativeInt(raw['guidedProblemCount']),
    summary,
    displayTitle,
  };
}

export function parseEngagementSignal(
  raw: string | null | undefined,
): EngagementSignal | null {
  if (!raw) return null;
  const parsed = engagementSignalSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Lists recent sessions for a profile, scoped to that profile.
 * Returns up to 50 most recent sessions.
 *
 * No parent-proxy guard here — this function operates on a single profileId
 * directly. Parent-facing callers (getChildSessions in dashboard.ts) add
 * assertParentAccess + assertChildDashboardDataVisible before delegating here.
 */
export async function getProfileSessions(
  db: Database,
  profileId: string,
): Promise<ChildSession[]> {
  const result = await listProfileSessions(db, profileId, { limit: 50 });
  return result.sessions;
}

export async function listProfileSessions(
  db: Database,
  profileId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
): Promise<{ sessions: ChildSession[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const conditions = [gte(learningSessions.exchangeCount, 1)];

  if (options.cursor) {
    // learning_sessions.id is UUIDv7, so desc(id) is newest-first keyset
    // pagination without relying on offset scans.
    conditions.push(lt(learningSessions.id, options.cursor));
  }

  const scoped = createScopedRepository(db, profileId);
  const rows = await scoped.sessions.findMany(
    and(...conditions),
    limit + 1,
    desc(learningSessions.id),
  );
  const { page, nextCursor } = paginateRows(rows, limit);

  return {
    sessions: await hydrateChildSessions(db, profileId, page),
    nextCursor,
  };
}

/**
 * [BUG-102 / BUG-106] hydrateChildSessions takes an explicit `profileId` and
 * filters every secondary query by it (defence-in-depth). Pre-fix the function
 * trusted that `sessions` had already been scoped upstream and ran batch
 * fetches purely by sessionId/subjectId/topicId. If a caller passed in
 * cross-account session rows (or upstream scoping regressed), session
 * summaries, subject names, topic titles and ai_response drill rows would
 * leak across accounts.
 *
 * Per AGENTS.md: the scoped repository can't express multi-table joins, so we
 * use direct `db.select()` / `db.query.*` with explicit
 * `eq(*.profileId, profileId)` predicates. `curriculumTopics` has no
 * `profileId` column — for that table we enforce isolation through the
 * closest owning ancestor (`subjects.profileId`) via innerJoin.
 */
async function hydrateChildSessions(
  db: Database,
  profileId: string,
  sessions: LearningSessionRow[],
): Promise<ChildSession[]> {
  if (sessions.length === 0) return [];

  // Belt-and-braces: drop any row that leaked in for a different profileId.
  // Upstream listProfileSessions already scopes via createScopedRepository,
  // but this guard makes hydrateChildSessions safe for any future caller.
  const ownedSessions = sessions.filter((s) => s.profileId === profileId);
  if (ownedSessions.length === 0) return [];

  // Batch-fetch highlights from session_summaries for all sessions
  const sessionIds = ownedSessions.map((s) => s.id);

  // [BUG-526] Batch-fetch subject names and topic titles so the mobile
  // client can render structured context instead of relying on the highlight string.
  const uniqueSubjectIds = [...new Set(ownedSessions.map((s) => s.subjectId))];
  const uniqueTopicIds = [
    ...new Set(ownedSessions.map((s) => s.topicId).filter(Boolean) as string[]),
  ];

  const [summaries, subjectRows, topicRows, drillRows] = await Promise.all([
    db.query.sessionSummaries.findMany({
      where: and(
        inArray(sessionSummaries.sessionId, sessionIds),
        eq(sessionSummaries.profileId, profileId),
      ),
      columns: {
        sessionId: true,
        highlight: true,
        narrative: true,
        conversationPrompt: true,
        engagementSignal: true,
      },
    }),
    uniqueSubjectIds.length > 0
      ? db.query.subjects.findMany({
          where: and(
            inArray(subjects.id, uniqueSubjectIds),
            eq(subjects.profileId, profileId),
          ),
          columns: { id: true, name: true },
        })
      : Promise.resolve([]),
    uniqueTopicIds.length > 0
      ? findOwnedCurriculumTopics(db, {
          profileId,
          topicIds: uniqueTopicIds,
        })
      : Promise.resolve([]),
    // Fluency-drill outcomes for each session, oldest first. Sparse: most
    // ai_response rows have null drill columns, so the IS NOT NULL filter
    // keeps the row count small even on the 50-session window.
    db
      .select({
        sessionId: sessionEvents.sessionId,
        drillCorrect: sessionEvents.drillCorrect,
        drillTotal: sessionEvents.drillTotal,
        createdAt: sessionEvents.createdAt,
      })
      .from(sessionEvents)
      .where(
        and(
          inArray(sessionEvents.sessionId, sessionIds),
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.eventType, 'ai_response'),
          isNotNull(sessionEvents.drillTotal),
        ),
      )
      .orderBy(asc(sessionEvents.createdAt)),
  ]);

  const summaryBySession = new Map(
    summaries.map((summary) => [summary.sessionId, summary]),
  );
  const subjectNameById = new Map(subjectRows.map((s) => [s.id, s.name]));
  const topicById = new Map(topicRows.map((t) => [t.topicId, t]));
  const drillsBySession = new Map<string, ChildSessionDrillScore[]>();
  for (const row of drillRows) {
    if (row.drillCorrect == null || row.drillTotal == null) continue;
    const list = drillsBySession.get(row.sessionId) ?? [];
    list.push({
      correct: row.drillCorrect,
      total: row.drillTotal,
      createdAt: row.createdAt.toISOString(),
    });
    drillsBySession.set(row.sessionId, list);
  }

  return ownedSessions
    .filter((s) => subjectNameById.has(s.subjectId))
    .map((s) => {
      const metadata = getSessionMetadata(s.metadata);
      const homeworkSummary = normalizeHomeworkSummary(
        metadata.homeworkSummary ?? null,
      );

      const summary = summaryBySession.get(s.id);
      const topic = s.topicId ? topicById.get(s.topicId) : null;
      const ownedTopic =
        topic && topic.subjectId === s.subjectId ? topic : null;

      return {
        sessionId: s.id,
        subjectId: s.subjectId,
        subjectName: subjectNameById.get(s.subjectId) ?? null,
        topicId: ownedTopic?.topicId ?? null,
        topicTitle: ownedTopic?.topicTitle ?? null,
        sessionType: s.sessionType,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        exchangeCount: s.exchangeCount,
        escalationRung: s.escalationRung,
        durationSeconds: s.durationSeconds,
        wallClockSeconds: s.wallClockSeconds,
        displayTitle: formatSessionDisplayTitle(s.sessionType, homeworkSummary),
        displaySummary: homeworkSummary?.summary ?? null,
        homeworkSummary,
        highlight: summary?.highlight ?? null,
        narrative: summary?.narrative ?? null,
        conversationPrompt: summary?.conversationPrompt ?? null,
        engagementSignal: parseEngagementSignal(summary?.engagementSignal),
        drills: drillsBySession.get(s.id) ?? [],
      };
    });
}
