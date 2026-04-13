// ---------------------------------------------------------------------------
// Session Service — Story 2.1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import {
  eq,
  and,
  asc,
  desc,
  inArray,
  lt,
  isNotNull,
  sql,
  or,
  gte,
} from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
  subjects,
  curricula,
  curriculumBooks,
  curriculumTopics,
  topicNotes,
  profiles,
  retentionCards,
  vocabulary,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  SessionStartInput,
  SessionInputModeInput,
  SessionMessageInput,
  SessionCloseInput,
  ContentFlagInput,
  SummarySubmitInput,
  LearningSession,
  SessionSummary,
  HomeworkStateSyncInput,
  HomeworkSessionMetadata,
  SessionMetadata,
  SessionAnalyticsEventInput,
  LearningStyle,
  StrengthEntry,
  StruggleEntry,
} from '@eduagent/schemas';
import {
  processExchange,
  streamExchange,
  detectUnderstandingCheck,
  estimateExpectedResponseMinutes,
  extractNotePrompt,
  type ExchangeContext,
} from './exchanges';
import {
  evaluateEscalation,
  getRetentionAwareStartingRung,
  detectPartialProgress,
} from './escalation';
import { createPendingSessionSummary, evaluateSummary } from './summaries';
import { getSubject } from './subject';
import {
  fetchPriorTopics,
  buildPriorLearningContext,
  fetchCrossSubjectHighlights,
  buildCrossSubjectContext,
} from './prior-learning';
import { buildMemoryBlock, getLearningProfile } from './learner-profile';
import { retrieveRelevantMemory } from './memory';
import { getTeachingPreference } from './retention-data';
import { shouldTriggerEvaluate } from './evaluate';
import { shouldTriggerTeachBack } from './teach-back';
import { getRetentionStatus, type RetentionState } from './retention';
import {
  getLearningMode,
  incrementSummarySkips,
  resetSummarySkips,
} from './settings';
import type { EscalationRung } from './llm';

// ---------------------------------------------------------------------------
// FR210: Active time computation (internal analytics)
// ---------------------------------------------------------------------------

const FALLBACK_GAP_CAP_SECONDS = 10 * 60; // 10 min when no LLM estimate
const PACE_BUFFER = 1.5; // 1.5x buffer for slower-than-estimated work

interface TimedEvent {
  createdAt: Date;
  metadata?: unknown;
  eventType?: string;
}

type CachedProfileRow = typeof profiles.$inferSelect | null;
type CachedSubject = Awaited<ReturnType<typeof getSubject>>;

// BUG-70: Extended cache to include session-scoped supplementary lookups
// that are static within a session but were re-queried on every exchange.
interface SessionSupplementaryData {
  priorTopics: Awaited<ReturnType<typeof fetchPriorTopics>>;
  teachingPref: Awaited<ReturnType<typeof getTeachingPreference>>;
  learningMode: Awaited<ReturnType<typeof getLearningMode>>;
  learningProfile: Awaited<ReturnType<typeof getLearningProfile>>;
  crossSubjectHighlights: Awaited<
    ReturnType<typeof fetchCrossSubjectHighlights>
  >;
}

interface SessionStaticContextCacheEntry {
  profileId: string;
  sessionId: string;
  subjectId: string;
  topicId: string | null;
  expiresAt: number;
  profile: CachedProfileRow;
  subject: CachedSubject;
  homeworkLibraryContextLoaded: boolean;
  homeworkLibraryContext?: string;
  bookLearningHistoryContexts: Map<string, string | undefined>;
  // Supplementary data: lazily populated on first exchange, reused for duration
  supplementary?: SessionSupplementaryData;
}

const SESSION_STATIC_CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_STATIC_CONTEXT_ENTRIES = 200;

// Process-local cache — each API replica holds an independent copy.
// Acceptable because: (1) cached data is profile name + subject metadata, not
// authorization decisions; (2) 5-min TTL bounds staleness; (3) cache misses
// fall through to DB reads; (4) current deployment is single-instance (CF
// Worker). If multi-instance deployment is introduced, evaluate whether stale
// display names for up to 5 minutes are acceptable or replace with KV.
const sessionStaticContextCache = new Map<
  string,
  SessionStaticContextCacheEntry
>();

function getSessionStaticContextCacheKey(
  profileId: string,
  sessionId: string
): string {
  return `${profileId}:${sessionId}`;
}

function pruneSessionStaticContextCache(now = Date.now()): void {
  for (const [key, entry] of sessionStaticContextCache.entries()) {
    if (entry.expiresAt <= now) {
      sessionStaticContextCache.delete(key);
    }
  }

  while (sessionStaticContextCache.size > MAX_SESSION_STATIC_CONTEXT_ENTRIES) {
    const oldestKey = sessionStaticContextCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    sessionStaticContextCache.delete(oldestKey);
  }
}

function touchSessionStaticContextCacheEntry(
  key: string,
  entry: SessionStaticContextCacheEntry
): SessionStaticContextCacheEntry {
  entry.expiresAt = Date.now() + SESSION_STATIC_CONTEXT_TTL_MS;
  sessionStaticContextCache.delete(key);
  sessionStaticContextCache.set(key, entry);
  pruneSessionStaticContextCache();
  return entry;
}

async function getSessionStaticContext(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession
): Promise<SessionStaticContextCacheEntry> {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  const now = Date.now();

  pruneSessionStaticContextCache(now);

  const cached = sessionStaticContextCache.get(key);
  if (
    cached &&
    cached.subjectId === session.subjectId &&
    cached.topicId === (session.topicId ?? null) &&
    cached.expiresAt > now
  ) {
    return touchSessionStaticContextCacheEntry(key, cached);
  }

  const [subject, profileRows] = await Promise.all([
    getSubject(db, profileId, session.subjectId),
    db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1),
  ]);

  const entry: SessionStaticContextCacheEntry = {
    profileId,
    sessionId,
    subjectId: session.subjectId,
    topicId: session.topicId ?? null,
    expiresAt: now + SESSION_STATIC_CONTEXT_TTL_MS,
    profile: profileRows[0] ?? null,
    subject,
    homeworkLibraryContextLoaded: false,
    homeworkLibraryContext: undefined,
    bookLearningHistoryContexts: new Map(),
  };

  sessionStaticContextCache.set(key, entry);
  pruneSessionStaticContextCache(now);
  return entry;
}

async function getCachedHomeworkLibraryContext(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession
): Promise<string | undefined> {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  const entry = await getSessionStaticContext(
    db,
    profileId,
    sessionId,
    session
  );

  if (entry.homeworkLibraryContextLoaded) {
    return entry.homeworkLibraryContext;
  }

  entry.homeworkLibraryContext = await buildHomeworkLibraryContext(
    db,
    session.subjectId
  );
  entry.homeworkLibraryContextLoaded = true;
  touchSessionStaticContextCacheEntry(key, entry);
  return entry.homeworkLibraryContext;
}

async function getCachedBookLearningHistoryContext(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
  currentTopicId: string,
  bookId: string
): Promise<string | undefined> {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  const entry = await getSessionStaticContext(
    db,
    profileId,
    sessionId,
    session
  );
  const historyKey = `${bookId}:${currentTopicId}`;

  if (entry.bookLearningHistoryContexts.has(historyKey)) {
    return entry.bookLearningHistoryContexts.get(historyKey);
  }

  const context = await buildBookLearningHistoryContext(
    db,
    profileId,
    currentTopicId,
    bookId
  );
  entry.bookLearningHistoryContexts.set(historyKey, context);
  touchSessionStaticContextCacheEntry(key, entry);
  return context;
}

function clearSessionStaticContext(profileId: string, sessionId: string): void {
  sessionStaticContextCache.delete(
    getSessionStaticContextCacheKey(profileId, sessionId)
  );
}

export function resetSessionStaticContextCache(): void {
  sessionStaticContextCache.clear();
}

/** Compute active learning seconds from session event timestamps.
 *  Each inter-event gap is capped at the LLM-estimated expected response time
 *  (from the later event's metadata) × pace buffer. Falls back to 10 min. */
export function computeActiveSeconds(
  sessionStartedAt: Date,
  events: TimedEvent[]
): number {
  if (events.length === 0) return 0;

  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const first = sorted[0];
  if (!first) return 0;

  let total = 0;

  // Gap from session start to first event
  const firstGap = Math.max(
    0,
    (first.createdAt.getTime() - sessionStartedAt.getTime()) / 1000
  );
  total += Math.min(firstGap, perGapCap(first));

  // Gaps between consecutive events
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]!;
    const next = sorted[i + 1]!;
    const gap = Math.max(
      0,
      (next.createdAt.getTime() - curr.createdAt.getTime()) / 1000
    );
    total += Math.min(gap, perGapCap(next));
  }

  return Math.round(total);
}

function perGapCap(event: TimedEvent): number {
  const meta = event.metadata as Record<string, unknown> | null | undefined;
  const minutes = meta?.expectedResponseMinutes;
  if (typeof minutes === 'number' && minutes > 0) {
    return minutes * 60 * PACE_BUFFER;
  }
  return FALLBACK_GAP_CAP_SECONDS;
}

function formatLearningRecency(endedAt: Date): string {
  const diffDays = Math.floor(
    (Date.now() - endedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return 'covered today';
  if (diffDays === 1) return 'covered yesterday';
  if (diffDays < 7) return `covered ${diffDays} days ago`;
  return `covered on ${endedAt.toISOString().slice(0, 10)}`;
}

async function buildBookLearningHistoryContext(
  db: Database,
  profileId: string,
  currentTopicId: string,
  bookId: string
): Promise<string | undefined> {
  const book = await db.query.curriculumBooks.findFirst({
    where: eq(curriculumBooks.id, bookId),
  });
  if (!book) return undefined;

  // Fetch shelf (subject) name for richer context
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, book.subjectId),
  });

  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, book.subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) return undefined;

  const topics = await db.query.curriculumTopics.findMany({
    where: and(
      eq(curriculumTopics.curriculumId, curriculum.id),
      eq(curriculumTopics.bookId, bookId)
    ),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  const topicIds = topics.map((topic) => topic.id);
  if (topicIds.length === 0) return undefined;

  // Filter to completed/auto_closed sessions with endedAt in SQL to
  // avoid loading abandoned sessions into memory.
  const [sessions, notes] = await Promise.all([
    db
      .select({
        topicId: learningSessions.topicId,
        endedAt: learningSessions.endedAt,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, profileId),
          inArray(learningSessions.topicId, topicIds),
          inArray(learningSessions.status, ['completed', 'auto_closed']),
          isNotNull(learningSessions.endedAt)
        )
      ),
    // Fetch recent topic notes for this book (last 3, full text)
    db
      .select({
        topicId: topicNotes.topicId,
        content: topicNotes.content,
        updatedAt: topicNotes.updatedAt,
      })
      .from(topicNotes)
      .where(
        and(
          inArray(topicNotes.topicId, topicIds),
          eq(topicNotes.profileId, profileId)
        )
      )
      .orderBy(desc(topicNotes.updatedAt))
      .limit(3),
  ]);

  const latestByTopic = new Map<string, Date>();
  for (const session of sessions) {
    if (!session.topicId || !session.endedAt) continue;

    const previous = latestByTopic.get(session.topicId);
    if (!previous || previous.getTime() < session.endedAt.getTime()) {
      latestByTopic.set(session.topicId, session.endedAt);
    }
  }

  // Build chapter groupings with topic summaries
  const chapterMap = new Map<string, typeof topics>();
  for (const topic of topics) {
    if (topic.id === currentTopicId) continue;
    const chapter = topic.chapter ?? 'General';
    const list = chapterMap.get(chapter) ?? [];
    list.push(topic);
    chapterMap.set(chapter, list);
  }

  const sections: string[] = [];

  // Header with shelf and book info
  const shelfName = subject?.name ?? 'Unknown';
  sections.push(`Shelf: ${shelfName}`);
  sections.push(
    `Book: ${book.title}${book.description ? ` — "${book.description}"` : ''}`
  );

  // Chapter groupings
  if (chapterMap.size > 0) {
    sections.push('Chapters:');
    for (const [chapterName, chapterTopics] of chapterMap.entries()) {
      const coveredTopics = chapterTopics
        .filter((t) => latestByTopic.has(t.id))
        .slice(0, 5);
      if (coveredTopics.length > 0) {
        const topicNames = coveredTopics.map((t) => {
          const recency = formatLearningRecency(latestByTopic.get(t.id)!);
          return `${t.title} (${recency})`;
        });
        sections.push(`- ${chapterName}: ${topicNames.join(', ')}`);
      }
    }
  }

  // Recent notes
  if (notes.length > 0) {
    const topicTitleMap = new Map(topics.map((t) => [t.id, t.title]));
    sections.push('Recent notes:');
    for (const note of notes) {
      const title = topicTitleMap.get(note.topicId) ?? 'Unknown';
      // Truncate note content to avoid token blowup
      const content =
        note.content.length > 200
          ? note.content.slice(0, 200) + '...'
          : note.content;
      sections.push(`- ${title}: "${content}"`);
    }
  }

  // Only return if there is meaningful content beyond headers
  const hasTopicHistory = latestByTopic.size > 0;
  const hasNotes = notes.length > 0;
  if (!hasTopicHistory && !hasNotes) return undefined;

  sections.push(
    'Build on these naturally when they help the learner connect ideas.'
  );
  return sections.join('\n');
}

async function buildHomeworkLibraryContext(
  db: Database,
  subjectId: string
): Promise<string | undefined> {
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) return undefined;

  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  if (topics.length === 0) return undefined;

  return [
    "Topics already in the learner's Library for this subject:",
    ...topics.slice(0, 12).map((topic) => `- ${topic.title}`),
    'When useful, connect the homework to these topics naturally.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Mappers — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapSessionRow(
  row: typeof learningSessions.$inferSelect
): LearningSession {
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata) &&
    Object.keys(row.metadata as Record<string, unknown>).length > 0
      ? (row.metadata as SessionMetadata)
      : undefined;
  const inputMode =
    (row.inputMode as 'text' | 'voice') ?? metadata?.inputMode ?? 'text';

  return {
    id: row.id,
    subjectId: row.subjectId,
    topicId: row.topicId ?? null,
    sessionType: row.sessionType,
    inputMode,
    verificationType:
      (row.verificationType as 'standard' | 'evaluate' | 'teach_back') ?? null,
    status: row.status,
    escalationRung: row.escalationRung,
    exchangeCount: row.exchangeCount,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds ?? null,
    wallClockSeconds: row.wallClockSeconds ?? null,
    rawInput: row.rawInput ?? null,
    ...(metadata ? { metadata } : {}),
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

async function findSessionSummaryRow(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<typeof sessionSummaries.$inferSelect | undefined> {
  const repo = createScopedRepository(db, profileId);
  return repo.sessionSummaries.findFirst(
    eq(sessionSummaries.sessionId, sessionId)
  );
}

type RecordableSessionEventType =
  | 'system_prompt'
  | 'quick_action'
  | 'user_feedback'
  | 'flag';

async function insertSessionEvent(
  db: Database,
  session: LearningSession,
  profileId: string,
  input: {
    sessionId: string;
    eventType: RecordableSessionEventType;
    content: string;
    metadata?: Record<string, unknown>;
    touchSession?: boolean;
  }
): Promise<void> {
  await db.insert(sessionEvents).values({
    sessionId: input.sessionId,
    profileId,
    subjectId: session.subjectId,
    topicId: session.topicId,
    eventType: input.eventType,
    content: input.content,
    metadata: input.metadata ?? {},
  });

  if (!input.touchSession) {
    return;
  }

  await db
    .update(learningSessions)
    .set({
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, input.sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );
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

/** Maximum exchanges allowed per session (defense-in-depth — issue #15) */
const MAX_EXCHANGES_PER_SESSION = 50;

export class SessionExchangeLimitError extends Error {
  constructor(public readonly exchangeCount: number) {
    super(
      `Session has reached the maximum of ${MAX_EXCHANGES_PER_SESSION} exchanges`
    );
    this.name = 'SessionExchangeLimitError';
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

  // Record session_start event for the audit log
  await db.insert(sessionEvents).values({
    sessionId: row!.id,
    profileId,
    subjectId,
    eventType: 'session_start' as const,
    content: '',
  });

  return mapSessionRow(row!);
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
  expectedResponseMinutes?: number;
  /** FR228: Homework mode used for this exchange */
  homeworkMode?: 'help_me' | 'check_answer';
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

/**
 * Lightweight exchange-limit guard. Uses the scoped repository to load
 * the session and check if the exchange cap has been reached, before
 * the expensive prepareExchangeContext query set runs.
 */
async function checkExchangeLimit(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<void> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row) {
    throw new Error('Session not found');
  }
  if (row.exchangeCount >= MAX_EXCHANGES_PER_SESSION) {
    throw new SessionExchangeLimitError(row.exchangeCount);
  }
}

/**
 * CFLF-23: Merge per-message memory context with rawInput-based pre-session
 * memory context. De-duplicates when both sources return the same underlying
 * text (the per-message memory may overlap with rawInput memory on the first
 * exchange). Returns empty string when neither source has content.
 */
function mergeMemoryContexts(
  messageMemory: string,
  rawInputMemory: string
): string {
  if (!messageMemory && !rawInputMemory) return '';
  if (!rawInputMemory) return messageMemory;
  if (!messageMemory) return rawInputMemory;

  // Deduplicate: if both strings are identical, return just one.
  if (messageMemory === rawInputMemory) return messageMemory;

  // Partial overlap: if one is a substring of the other, keep the longer one.
  if (messageMemory.includes(rawInputMemory)) return messageMemory;
  if (rawInputMemory.includes(messageMemory)) return rawInputMemory;

  // Both have unique content — concatenate with a separator.
  // The prompt builder already handles a single embeddingMemoryContext block,
  // so we merge here to avoid duplicating the header text.
  return `${messageMemory}\n\n---\nAdditional context from the learner's original question:\n${rawInputMemory}`;
}

async function prepareExchangeContext(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string,
  options?: {
    voyageApiKey?: string;
    homeworkMode?: 'help_me' | 'check_answer';
    llmTier?: import('./subscription').LLMTier;
  }
): Promise<ExchangePrep> {
  // 1. Load session
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const isInterleaved = session.sessionType === 'interleaved';
  const staticContext = await getSessionStaticContext(
    db,
    profileId,
    sessionId,
    session
  );

  // 2. Load all supplementary data in parallel (all independent after session load)
  // CFLF-23: For freeform sessions with rawInput, also scan prior sessions
  // by the learner's original intent so the very first exchange has rich context.
  const isFreeformWithRawInput = !session.topicId && !!session.rawInput;

  // BUG-70: Use cached supplementary data for lookups that are static within
  // a session (priorTopics, teachingPref, learningMode, learningProfile,
  // crossSubjectHighlights). Saves ~5 DB queries per exchange after the first.
  const cachedSupp = staticContext.supplementary;

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
    learningModeRecord,
    crossSubjectHighlights,
    rawInputMemory,
    learningProfile,
  ] = await Promise.all([
    Promise.resolve(staticContext.subject),
    session.topicId
      ? db
          .select()
          .from(curriculumTopics)
          .where(eq(curriculumTopics.id, session.topicId))
          .limit(1)
      : Promise.resolve([]),
    Promise.resolve(staticContext.profile ? [staticContext.profile] : []),
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
    cachedSupp
      ? Promise.resolve(cachedSupp.priorTopics)
      : fetchPriorTopics(db, profileId, session.subjectId),
    retrieveRelevantMemory(db, profileId, userMessage, options?.voyageApiKey),
    // FR58: Load teaching method preference for adaptive teaching
    cachedSupp
      ? Promise.resolve(cachedSupp.teachingPref)
      : getTeachingPreference(db, profileId, session.subjectId),
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
    // Learning mode: affects LLM tutoring style (casual vs serious)
    cachedSupp
      ? Promise.resolve(cachedSupp.learningMode)
      : getLearningMode(db, profileId),
    // Story 16.0: Cross-subject learning highlights for broader context
    cachedSupp
      ? Promise.resolve(cachedSupp.crossSubjectHighlights)
      : fetchCrossSubjectHighlights(db, profileId, session.subjectId),
    // CFLF-23: Pre-session similarity scan — uses rawInput for freeform sessions
    // Graceful degradation: if Voyage API is down, returns empty (never breaks session)
    isFreeformWithRawInput
      ? retrieveRelevantMemory(
          db,
          profileId,
          session.rawInput!,
          options?.voyageApiKey,
          5
        )
      : Promise.resolve({ context: '', topicIds: [] }),
    cachedSupp
      ? Promise.resolve(cachedSupp.learningProfile)
      : getLearningProfile(db, profileId),
  ]);

  // BUG-70: Populate supplementary cache on first exchange
  if (!cachedSupp) {
    const cacheKey = getSessionStaticContextCacheKey(profileId, sessionId);
    staticContext.supplementary = {
      priorTopics,
      teachingPref,
      learningMode: learningModeRecord,
      learningProfile,
      crossSubjectHighlights,
    };
    touchSessionStaticContextCacheEntry(cacheKey, staticContext);
  }

  const topic = topicRows[0];
  const [profile] = profileRows;
  if (!profile) {
    console.warn(
      `[processExchange] Profile ${profileId} not found — birthYear will be null, LLM defaults to adult tone`
    );
  }
  const retentionCard = retentionRows[0];
  const knownVocabularyRows =
    subject?.pedagogyMode === 'four_strands'
      ? await db
          .select({ term: vocabulary.term })
          .from(vocabulary)
          .where(
            and(
              eq(vocabulary.profileId, profileId),
              eq(vocabulary.subjectId, session.subjectId),
              eq(vocabulary.mastered, true)
            )
          )
          .orderBy(desc(vocabulary.updatedAt))
          .limit(60)
      : [];

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
      (e) =>
        e.eventType === 'user_message' ||
        e.eventType === 'ai_response' ||
        e.eventType === 'system_prompt'
    )
    .map((e) => ({
      role:
        e.eventType === 'user_message'
          ? ('user' as const)
          : e.eventType === 'system_prompt'
          ? ('system' as const)
          : ('assistant' as const),
      content: e.content,
    }));

  // 3b. Compute SM-2 retention status from retention card (Gap 4)
  let retentionStatusValue:
    | 'new'
    | 'strong'
    | 'fading'
    | 'weak'
    | 'forgotten'
    | undefined;
  let daysSinceLastReview: number | undefined;
  if (retentionCard) {
    const retState: RetentionState = {
      topicId: retentionCard.topicId,
      easeFactor: Number(retentionCard.easeFactor),
      intervalDays: retentionCard.intervalDays,
      repetitions: retentionCard.repetitions,
      failureCount: retentionCard.failureCount,
      consecutiveSuccesses: retentionCard.consecutiveSuccesses,
      xpStatus: retentionCard.xpStatus as 'pending' | 'verified' | 'decayed',
      nextReviewAt: retentionCard.nextReviewAt?.toISOString() ?? null,
      lastReviewedAt: retentionCard.lastReviewedAt?.toISOString() ?? null,
    };
    retentionStatusValue = getRetentionStatus(retState);
    if (retentionCard.lastReviewedAt) {
      daysSinceLastReview =
        (Date.now() - retentionCard.lastReviewedAt.getTime()) /
        (1000 * 60 * 60 * 24);
    }
  }

  // 3c. Count questions at the current escalation rung + compute hint count
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
      ? aiResponseEvents[aiResponseEvents.length - 1]!.createdAt
      : null;

  // 3d. Check the last AI response for [PARTIAL_PROGRESS] marker (Gap 3)
  const lastAiResponse =
    aiResponseEvents.length > 0
      ? aiResponseEvents[aiResponseEvents.length - 1]!.content
      : '';
  const previousResponseHadPartialProgress =
    detectPartialProgress(lastAiResponse);

  // 4. Evaluate escalation (retention-aware + partial-progress-aware)
  // On first exchange: use retention-aware starting rung (Gap 4)
  const currentRung =
    session.exchangeCount === 0 && retentionStatusValue
      ? getRetentionAwareStartingRung(retentionStatusValue)
      : (session.escalationRung as EscalationRung);

  const escalationDecision = evaluateEscalation(
    {
      currentRung,
      hintCount,
      questionsAtCurrentRung,
      totalExchanges: session.exchangeCount,
      retentionStatus: retentionStatusValue,
      previousResponseHadPartialProgress,
    },
    userMessage
  );
  const effectiveRung = escalationDecision.shouldEscalate
    ? escalationDecision.newRung
    : currentRung;

  // 5. Build prior learning context (FR40 — bridge FR)
  const priorLearning = buildPriorLearningContext(priorTopics);
  const crossSubjectContext =
    buildCrossSubjectContext(crossSubjectHighlights) || undefined;
  const learningHistoryParts = [
    topic?.bookId && topic?.id
      ? await getCachedBookLearningHistoryContext(
          db,
          profileId,
          sessionId,
          session,
          topic.id,
          topic.bookId
        )
      : undefined,
    session.sessionType === 'homework'
      ? await getCachedHomeworkLibraryContext(db, profileId, sessionId, session)
      : undefined,
  ].filter((part): part is string => Boolean(part));
  const learningHistoryContext =
    learningHistoryParts.length > 0
      ? learningHistoryParts.join('\n\n')
      : undefined;
  // Amendment 2: load ALL well-retained topic titles for this profile so
  // buildMemoryBlock can filter struggles on any topic the learner has
  // mastered, not just the current session topic. Uses intervalDays >= 21
  // as the "strong" threshold per the retention model.
  let strongTopicTitles: string[] = [];
  if (learningProfile) {
    const strongCards = await db
      .select({ topicId: retentionCards.topicId })
      .from(retentionCards)
      .where(
        and(
          eq(retentionCards.profileId, profileId),
          gte(retentionCards.intervalDays, 21)
        )
      );
    const strongTopicIds = strongCards.map((row) => row.topicId);
    if (strongTopicIds.length > 0) {
      const strongTopicRows = await db
        .select({ title: curriculumTopics.title })
        .from(curriculumTopics)
        .where(inArray(curriculumTopics.id, strongTopicIds));
      strongTopicTitles = strongTopicRows.map((row) => row.title);
    }
  }

  const learnerMemoryContext = learningProfile
    ? buildMemoryBlock(
        {
          learningStyle:
            (learningProfile.learningStyle as LearningStyle | null) ?? null,
          interests: Array.isArray(learningProfile.interests)
            ? learningProfile.interests
            : [],
          strengths: (Array.isArray(learningProfile.strengths)
            ? learningProfile.strengths
            : []) as StrengthEntry[],
          struggles: (Array.isArray(learningProfile.struggles)
            ? learningProfile.struggles
            : []) as StruggleEntry[],
          communicationNotes: Array.isArray(learningProfile.communicationNotes)
            ? learningProfile.communicationNotes
            : [],
          memoryEnabled: learningProfile.memoryEnabled,
          memoryInjectionEnabled: learningProfile.memoryInjectionEnabled,
        },
        subject?.name ?? null,
        topic?.title ?? null,
        {
          status: retentionStatusValue,
          strongTopics: strongTopicTitles,
        }
      ) || undefined
    : undefined;

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
    birthYear: profile?.birthYear ?? null,
    workedExampleLevel: interleavedTopics ? undefined : workedExampleLevel,
    priorLearningContext: priorLearning.contextText || undefined,
    crossSubjectContext,
    learningHistoryContext,
    learnerMemoryContext,
    // CFLF-23: Merge per-message memory with rawInput-based pre-session memory
    embeddingMemoryContext:
      mergeMemoryContexts(memory.context, rawInputMemory.context) || undefined,
    pedagogyMode: subject?.pedagogyMode ?? 'socratic',
    nativeLanguage: teachingPref?.nativeLanguage ?? undefined,
    languageCode: subject?.languageCode ?? undefined,
    knownVocabulary: knownVocabularyRows.map((row) => row.term).slice(0, 60),
    teachingPreference: teachingPref?.method,
    analogyDomain: teachingPref?.analogyDomain ?? undefined,
    interleavedTopics,
    verificationType,
    evaluateDifficultyRung,
    learningMode: learningModeRecord.mode,
    // Gap 4: Populate retention status for prompt-level awareness
    retentionStatus: retentionStatusValue
      ? {
          status: retentionStatusValue,
          easeFactor: retentionCard
            ? Number(retentionCard.easeFactor)
            : undefined,
          daysSinceLastReview,
        }
      : undefined,
    // FR228: Homework mode — passed from client per exchange
    homeworkMode: options?.homeworkMode,
    // Subscription-derived LLM tier — controls model routing
    llmTier: options?.llmTier,
    // CFLF: Original learner input so the LLM stays anchored to intent
    rawInput: session.rawInput,
    inputMode: session.inputMode,
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
): Promise<{ exchangeCount: number; aiEventId?: string }> {
  const previousRung = session.escalationRung;

  // Build ai_response metadata — always includes escalationRung,
  // enriched with behavioral metrics when available (UX-18)
  const aiMetadata: Record<string, unknown> = {
    escalationRung: effectiveRung,
    sessionType: session.sessionType,
    ...(session.sessionType === 'homework' && { isHomework: true }),
    ...(behavioral?.homeworkMode && { homeworkMode: behavioral.homeworkMode }),
    ...(behavioral && {
      isUnderstandingCheck: behavioral.isUnderstandingCheck,
      timeToAnswerMs: behavioral.timeToAnswerMs,
      hintCountInSession: behavioral.hintCountInSession,
      expectedResponseMinutes: behavioral.expectedResponseMinutes,
    }),
  };

  // Persist events: user_message + ai_response (with behavioral metadata)
  const insertedEvents = await db
    .insert(sessionEvents)
    .values([
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
    ])
    .returning({
      id: sessionEvents.id,
      eventType: sessionEvents.eventType,
    });

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

  // D-03: atomic conditional increment — prevents concurrent requests from
  // both passing the exchange-limit check and double-incrementing past the cap.
  const now = new Date();
  const [updated] = await db
    .update(learningSessions)
    .set({
      exchangeCount: sql`${learningSessions.exchangeCount} + 1`,
      escalationRung: effectiveRung,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
        lt(learningSessions.exchangeCount, MAX_EXCHANGES_PER_SESSION)
      )
    )
    .returning({ exchangeCount: learningSessions.exchangeCount });

  if (!updated) {
    throw new SessionExchangeLimitError(session.exchangeCount);
  }

  return {
    exchangeCount: updated.exchangeCount,
    aiEventId: insertedEvents.find((event) => event.eventType === 'ai_response')
      ?.id,
  };
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
  options?: {
    voyageApiKey?: string;
    llmTier?: import('./subscription').LLMTier;
  }
): Promise<{
  response: string;
  escalationRung: number;
  isUnderstandingCheck: boolean;
  exchangeCount: number;
  expectedResponseMinutes: number;
  aiEventId?: string;
}> {
  // Early exchange limit check — runs before expensive prepareExchangeContext
  // which performs 9+ parallel DB queries and a quota check (issue #15, review item #4)
  await checkExchangeLimit(db, profileId, sessionId);

  const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
    await prepareExchangeContext(db, profileId, sessionId, input.message, {
      ...options,
      homeworkMode: input.homeworkMode,
    });

  const result = await processExchange(context, input.message);

  // Compute time-to-answer: ms between last AI response and now
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() - lastAiResponseAt.getTime()
    : null;

  const persisted = await persistExchangeResult(
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
      expectedResponseMinutes: result.expectedResponseMinutes,
      homeworkMode: input.homeworkMode,
    }
  );

  return {
    response: result.response,
    escalationRung: effectiveRung,
    isUnderstandingCheck: result.isUnderstandingCheck,
    exchangeCount: persisted.exchangeCount,
    expectedResponseMinutes: result.expectedResponseMinutes,
    aiEventId: persisted.aiEventId,
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
  options?: {
    voyageApiKey?: string;
    llmTier?: import('./subscription').LLMTier;
  }
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: (fullResponse: string) => Promise<{
    exchangeCount: number;
    escalationRung: number;
    expectedResponseMinutes: number;
    aiEventId?: string;
    notePrompt?: boolean;
    notePromptPostSession?: boolean;
  }>;
}> {
  // Early exchange limit check — runs before expensive prepareExchangeContext
  // which performs 9+ parallel DB queries and a quota check (issue #15, review item #4)
  await checkExchangeLimit(db, profileId, sessionId);

  const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
    await prepareExchangeContext(db, profileId, sessionId, input.message, {
      ...options,
      homeworkMode: input.homeworkMode,
    });

  // Compute time-to-answer before streaming begins
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() - lastAiResponseAt.getTime()
    : null;

  const result = await streamExchange(context, input.message);

  return {
    stream: result.stream,
    async onComplete(fullResponse: string) {
      // Extract and strip notePrompt JSON annotation before persisting
      const notePromptResult = extractNotePrompt(fullResponse);
      const cleanedResponse = notePromptResult.cleanResponse;

      const expectedResponseMinutes = estimateExpectedResponseMinutes(
        cleanedResponse,
        context
      );
      const persisted = await persistExchangeResult(
        db,
        profileId,
        sessionId,
        session,
        input.message,
        cleanedResponse,
        effectiveRung,
        {
          isUnderstandingCheck: detectUnderstandingCheck(cleanedResponse),
          timeToAnswerMs,
          hintCountInSession: hintCount,
          expectedResponseMinutes,
          homeworkMode: input.homeworkMode,
        }
      );
      return {
        exchangeCount: persisted.exchangeCount,
        escalationRung: effectiveRung,
        expectedResponseMinutes,
        aiEventId: persisted.aiEventId,
        notePrompt: notePromptResult.notePrompt || undefined,
        notePromptPostSession:
          notePromptResult.notePromptPostSession || undefined,
      };
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

export async function getSessionTranscript(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{
  session: {
    sessionId: string;
    subjectId: string;
    topicId: string | null;
    sessionType: 'learning' | 'homework' | 'interleaved';
    inputMode: 'text' | 'voice';
    verificationType?: 'standard' | 'evaluate' | 'teach_back' | null;
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

export async function setSessionInputMode(
  db: Database,
  profileId: string,
  sessionId: string,
  input: SessionInputModeInput
): Promise<LearningSession> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row) {
    throw new Error('Session not found');
  }

  const existingMetadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? (row.metadata as SessionMetadata)
      : {};

  const [updated] = await db
    .update(learningSessions)
    .set({
      inputMode: input.inputMode,
      metadata: {
        ...existingMetadata,
        inputMode: input.inputMode,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Session not found');
  }

  return mapSessionRow(updated);
}

type HomeworkTrackingMetadata = SessionMetadata & {
  homework?: HomeworkSessionMetadata & {
    loggedCorrectionIds?: string[];
    loggedStartedProblemIds?: string[];
    loggedCompletedProblemIds?: string[];
  };
};

function getHomeworkTrackingMetadata(
  metadata: unknown
): HomeworkTrackingMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as HomeworkTrackingMetadata;
}

export async function syncHomeworkState(
  db: Database,
  profileId: string,
  sessionId: string,
  input: HomeworkStateSyncInput
): Promise<{ metadata: HomeworkSessionMetadata }> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row) {
    throw new Error('Session not found');
  }
  if (row.sessionType !== 'homework') {
    throw new Error(
      'Homework state sync is only available for homework sessions'
    );
  }

  const existingMetadata = getHomeworkTrackingMetadata(row.metadata);
  const existingHomework = existingMetadata.homework;
  const loggedCorrectionIds = new Set(existingHomework?.loggedCorrectionIds);
  const loggedStartedProblemIds = new Set(
    existingHomework?.loggedStartedProblemIds
  );
  const loggedCompletedProblemIds = new Set(
    existingHomework?.loggedCompletedProblemIds
  );

  const eventsToInsert: Array<typeof sessionEvents.$inferInsert> = [];

  input.metadata.problems.forEach((problem, index) => {
    const text = problem.text.trim();
    const originalText = problem.originalText?.trim();

    if (
      problem.source === 'ocr' &&
      originalText &&
      originalText !== text &&
      !loggedCorrectionIds.has(problem.id)
    ) {
      loggedCorrectionIds.add(problem.id);
      eventsToInsert.push({
        sessionId,
        profileId,
        subjectId: row.subjectId,
        topicId: row.topicId ?? undefined,
        eventType: 'ocr_correction' as const,
        content: text,
        metadata: {
          problemId: problem.id,
          problemIndex: index,
          originalText,
          correctedText: text,
        },
      });
    }

    if (
      problem.status === 'active' &&
      !loggedStartedProblemIds.has(problem.id)
    ) {
      loggedStartedProblemIds.add(problem.id);
      eventsToInsert.push({
        sessionId,
        profileId,
        subjectId: row.subjectId,
        topicId: row.topicId ?? undefined,
        eventType: 'homework_problem_started' as const,
        content: text,
        metadata: {
          problemId: problem.id,
          problemIndex: index,
          selectedMode: problem.selectedMode ?? null,
        },
      });
    }

    if (
      problem.status === 'completed' &&
      !loggedCompletedProblemIds.has(problem.id)
    ) {
      loggedCompletedProblemIds.add(problem.id);
      eventsToInsert.push({
        sessionId,
        profileId,
        subjectId: row.subjectId,
        topicId: row.topicId ?? undefined,
        eventType: 'homework_problem_completed' as const,
        content: text,
        metadata: {
          problemId: problem.id,
          problemIndex: index,
          selectedMode: problem.selectedMode ?? null,
        },
      });
    }
  });

  const now = new Date();
  const nextHomeworkMetadata = {
    ...input.metadata,
    loggedCorrectionIds: [...loggedCorrectionIds],
    loggedStartedProblemIds: [...loggedStartedProblemIds],
    loggedCompletedProblemIds: [...loggedCompletedProblemIds],
  };

  await db
    .update(learningSessions)
    .set({
      metadata: {
        ...existingMetadata,
        homework: nextHomeworkMetadata,
      },
      updatedAt: now,
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );

  if (eventsToInsert.length > 0) {
    await db.insert(sessionEvents).values(eventsToInsert);
  }

  // BD-04: return enriched metadata with accumulated tracking IDs, not raw input
  return { metadata: nextHomeworkMetadata };
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

export async function getSessionSummary(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<SessionSummary | null> {
  const row = await findSessionSummaryRow(db, profileId, sessionId);
  return row ? mapSummaryRow(row) : null;
}

export async function skipSummary(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{
  summary: {
    id: string;
    sessionId: string;
    content: string;
    aiFeedback: string | null;
    status: 'skipped' | 'submitted' | 'accepted';
  };
}> {
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const existing = await findSessionSummaryRow(db, profileId, sessionId);
  const existingStatus = existing?.status as
    | 'pending'
    | 'submitted'
    | 'accepted'
    | 'skipped'
    | 'auto_closed'
    | undefined;

  if (
    existing &&
    (existingStatus === 'submitted' || existingStatus === 'accepted')
  ) {
    return {
      summary: {
        id: existing.id,
        sessionId: existing.sessionId,
        content: existing.content ?? '',
        aiFeedback: existing.aiFeedback ?? null,
        status: existingStatus,
      },
    };
  }

  const row = await createPendingSessionSummary(
    db,
    sessionId,
    profileId,
    session.topicId ?? null,
    'skipped'
  );

  if (existingStatus !== 'skipped') {
    await incrementSummarySkips(db, profileId);
  }

  return {
    summary: {
      id: row.id,
      sessionId: row.sessionId,
      content: row.content ?? '',
      aiFeedback: row.aiFeedback ?? null,
      status: 'skipped',
    },
  };
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
  if (!session) {
    throw new Error('Session not found');
  }
  const subject = await getSubject(db, profileId, session.subjectId);

  // Evaluate summary via LLM
  const evaluation = await evaluateSummary(
    subject?.name ?? 'Unknown topic',
    'Session learning content',
    input.content
  );

  const finalStatus = evaluation.isAccepted ? 'accepted' : 'submitted';
  const existing = await findSessionSummaryRow(db, profileId, sessionId);
  const now = new Date();
  let finalRow: typeof sessionSummaries.$inferSelect;

  if (existing) {
    await db
      .update(sessionSummaries)
      .set({
        topicId: existing.topicId ?? session.topicId ?? null,
        content: input.content,
        aiFeedback: evaluation.feedback,
        status: finalStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(sessionSummaries.id, existing.id),
          eq(sessionSummaries.profileId, profileId)
        )
      );

    finalRow = {
      ...existing,
      topicId: existing.topicId ?? session.topicId ?? null,
      content: input.content,
      aiFeedback: evaluation.feedback,
      status: finalStatus,
      updatedAt: now,
    };
  } else {
    const [inserted] = await db
      .insert(sessionSummaries)
      .values({
        sessionId,
        profileId,
        topicId: session.topicId ?? null,
        content: input.content,
        aiFeedback: evaluation.feedback,
        status: finalStatus,
      })
      .returning();

    finalRow = inserted!;
  }

  await resetSummarySkips(db, profileId);

  return {
    summary: {
      id: finalRow.id,
      sessionId: finalRow.sessionId,
      content: finalRow.content ?? input.content,
      aiFeedback: evaluation.feedback,
      status: finalStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Book Sessions — sessions grouped by topic for the Book screen [CFLF-18]
// ---------------------------------------------------------------------------

export interface BookSession {
  id: string;
  topicId: string | null;
  topicTitle: string;
  chapter: string | null;
  createdAt: string;
}

/**
 * Returns completed sessions for a specific book, filtered by minimum quality:
 * at least 3 exchanges OR 60+ active seconds. Profile ownership is verified
 * through the subjects table parent chain.
 */
export async function getBookSessions(
  db: Database,
  profileId: string,
  bookId: string
): Promise<BookSession[]> {
  const rows = await db
    .select({
      id: learningSessions.id,
      topicId: learningSessions.topicId,
      topicTitle: curriculumTopics.title,
      chapter: curriculumTopics.chapter,
      createdAt: learningSessions.createdAt,
      exchangeCount: learningSessions.exchangeCount,
      durationSeconds: learningSessions.durationSeconds,
    })
    .from(learningSessions)
    .innerJoin(
      curriculumTopics,
      eq(learningSessions.topicId, curriculumTopics.id)
    )
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .where(
      and(
        eq(curriculumTopics.bookId, bookId),
        eq(subjects.profileId, profileId),
        eq(learningSessions.status, 'completed'),
        or(
          gte(learningSessions.exchangeCount, 3),
          gte(learningSessions.durationSeconds, 60)
        )
      )
    )
    .orderBy(desc(learningSessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    topicTitle: r.topicTitle,
    chapter: r.chapter,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Backfill topicId on a learning session after post-session filing.
 * Without this, freeform-filed sessions won't appear in getBookSessions
 * because that query joins on learningSessions.topicId.
 */
export async function backfillSessionTopicId(
  db: Database,
  profileId: string,
  sessionId: string,
  topicId: string
): Promise<void> {
  await db
    .update(learningSessions)
    .set({ topicId })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );
}
