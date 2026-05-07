// ---------------------------------------------------------------------------
// Session Exchange — message processing, context preparation, persistence
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, inArray, lt, sql, gte, ne } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
  sessionSummaries,
  curriculumTopics,
  retentionCards,
  vocabulary,
  subjects,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  ConversationLanguage,
  LearningSession,
  SessionMessageInput,
  LearningStyle,
  StrengthEntry,
  StruggleEntry,
  VerificationType,
} from '@eduagent/schemas';
import {
  LlmStreamError,
  classifyOrphanError,
  extractedInterviewSignalsSchema,
} from '@eduagent/schemas';
import { persistUserMessageOnly } from './persist-user-message-only';
import {
  processExchange,
  streamExchange,
  estimateExpectedResponseMinutes,
  classifyExchangeOutcome,
  type ExchangeContext,
  type ExchangeFallback,
  type FluencyDrillAnnotation,
  type ImageData,
} from '../exchanges';
import {
  evaluateEscalation,
  getRetentionAwareStartingRung,
} from '../escalation';
import {
  buildPriorLearningContext,
  buildCrossSubjectContext,
} from '../prior-learning';
import { buildMemoryBlock, buildAccommodationBlock } from '../learner-profile';
import { generateEmbedding } from '../embeddings';
import { retrieveRelevantMemory } from '../memory';
import { makeEmbedderFromEnv } from '../memory/embed-fact';
import {
  hasMemoryFactsBackfillMarker,
  readMemorySnapshotFromFacts,
  type MemorySnapshot,
} from '../memory/memory-facts';
import { getRelevantMemories } from '../memory/relevance';
import { getTeachingPreference } from '../retention-data';
import { shouldTriggerEvaluate } from '../evaluate';
import { shouldTriggerTeachBack } from '../teach-back';
import { getRetentionStatus, type RetentionState } from '../retention';
import type { EscalationRung } from '../llm';
import { inngest } from '../../inngest/client';
import {
  getSessionStaticContext,
  getOrLoadSessionSupplementary,
  getCachedBookLearningHistoryContext,
  getCachedHomeworkLibraryContext,
} from './session-cache';
import {
  getSession,
  MAX_EXCHANGES_PER_SESSION,
  SessionExchangeLimitError,
} from './session-crud';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import {
  buildResumeContext,
  loadPriorSessionMeta,
} from './session-context-builders';
import { projectAiResponseContent } from '../llm/project-response';
import { isSubstantiveCalibrationAnswer } from './review-calibration';

const BANNED_FILLER_OPENERS = [
  "i'm so proud",
  'great job',
  'amazing',
  'fantastic',
  'awesome',
  "let's dive in",
  'nice work',
  'excellent',
  'wonderful',
  'perfect',
  "that's a great question",
] as const;

/**
 * English-language intent pre-classifier used to fast-path four-strands
 * pedagogy for obvious translation / "how do you say" asks.
 */
const LANGUAGE_REGEX =
  /\b(how do (you|i) say|translate|in (french|spanish|german|czech|italian|portuguese|japanese|chinese|korean|arabic|russian|hindi|dutch|polish|swedish|norwegian|danish|finnish|greek|turkish|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|swahili|hebrew|ukrainian|croatian|serbian|slovak|slovenian|bulgarian|latvian|lithuanian|estonian)|what('s| is) .+ in \w+)\b/i;

const logger = createLogger();

// ---------------------------------------------------------------------------
// Correct-answer streak computation (pure — testable in isolation)
// ---------------------------------------------------------------------------

const MAX_CORRECT_STREAK = 5;

/**
 * Counts the number of consecutive correct answers at `currentRung` from the
 * end of the event log, scanning backwards and skipping non-ai_response events
 * (e.g. learner messages), breaking on a wrong answer or rung change.
 * Caps at MAX_CORRECT_STREAK to bound the value passed to the LLM.
 *
 * Neutral ai_response events (no correctAnswer field, e.g. hints or
 * encouragement turns) are skipped rather than treated as wrong — only an
 * explicit correctAnswer === false resets the streak.
 */
export function computeCorrectStreak(
  events: Array<{
    eventType: string;
    metadata: unknown;
  }>,
  currentRung: number
): number {
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.eventType !== 'ai_response') continue;
    const meta = event.metadata;
    if (!meta || typeof meta !== 'object') break;
    const m = meta as Record<string, unknown>;
    if (m.escalationRung !== currentRung) break;
    // Explicit wrong answer resets the streak; unevaluated turns are skipped.
    if (m.correctAnswer === false) break;
    if (m.correctAnswer !== true) continue;
    streak++;
    if (streak >= MAX_CORRECT_STREAK) break;
  }
  return streak;
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
  /** Envelope signal — read back next turn to hold escalation (F1.2) */
  partialProgress?: boolean;
  /** Envelope signal — used to queue topic for remediation (F1.3) */
  needsDeepening?: boolean;
  /** F6: LLM self-reported confidence — persisted so the next turn and analytics can read it. */
  confidence?: 'low' | 'medium' | 'high';
  /** Continuation opener score from the LLM envelope. */
  retrievalScore?: number;
  /** B.3 monitoring: consecutive correct-answer streak at the current escalation rung */
  correctStreak?: number;
  /** Fluency-drill score correct count, when the envelope's ui_hints.fluency_drill.score was set. */
  drillCorrect?: number;
  /** Fluency-drill score total count, when the envelope's ui_hints.fluency_drill.score was set. */
  drillTotal?: number;
}

function mapRetrievalScoreToDepth(score: number): 'low' | 'mid' | 'high' {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'mid';
  return 'low';
}

async function updateSessionMetadata(
  db: Database,
  profileId: string,
  sessionId: string,
  nextMetadata: Record<string, unknown>
): Promise<void> {
  await db
    .update(learningSessions)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    );
}

async function applyContinuationScore(
  db: Database,
  profileId: string,
  sessionId: string,
  retrievalScore?: number
): Promise<void> {
  if (typeof retrievalScore !== 'number') return;
  // Re-read session metadata so we layer on top of any updates
  // prepareExchangeContext / persistExchangeResult wrote during this turn.
  // The previously-passed `session.metadata` snapshot was captured at request
  // start, before `updateSessionMetadata` set `continuationOpenerActive: true`,
  // so spreading that snapshot here clobbered the freshly-written flag.
  const [fresh] = await db
    .select({ metadata: learningSessions.metadata })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId)
      )
    )
    .limit(1);
  const nextMetadata = {
    ...((fresh?.metadata as Record<string, unknown> | null) ?? {}),
  };
  delete nextMetadata['continuationOpenerActive'];
  delete nextMetadata['continuationOpenerStartedExchange'];
  nextMetadata['continuationDepth'] = mapRetrievalScoreToDepth(retrievalScore);
  await updateSessionMetadata(db, profileId, sessionId, nextMetadata);
}

const MAX_REVIEW_CALIBRATION_ATTEMPTS = 2;

interface ReviewCalibrationDispatchPayload {
  profileId: string;
  sessionId: string;
  topicId: string;
  learnerMessage: string;
  topicTitle: string;
  timestamp: string;
}

interface TopicProbeDispatchPayload {
  profileId: string;
  sessionId: string;
  subjectId: string;
  topicId: string;
  learnerMessage: string;
  topicTitle: string;
  timestamp: string;
}

async function maybeDispatchReviewCalibration(
  db: Database,
  profileId: string,
  session: {
    id: string;
    topicId: string | null;
  },
  effectiveMode: string | undefined,
  conversationLanguage: ConversationLanguage | undefined,
  learnerMessageText: string,
  topicTitle: string | undefined
): Promise<void> {
  if (effectiveMode !== 'review' && effectiveMode !== 'practice') return;
  const topicId = session.topicId;
  if (!topicId || !topicTitle) return;

  const isSubstantive = isSubstantiveCalibrationAnswer(
    learnerMessageText,
    conversationLanguage
  );

  const payload = await db.transaction<ReviewCalibrationDispatchPayload | null>(
    async (tx) => {
      const [row] = await tx
        .select({ metadata: learningSessions.metadata })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId)
          )
        )
        .for('update')
        .limit(1);

      if (!row) return null;
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (metadata['reviewCalibrationFiredAt'] != null) return null;

      const priorAttempts =
        typeof metadata['reviewCalibrationAttempts'] === 'number'
          ? metadata['reviewCalibrationAttempts']
          : 0;
      const nextAttempts = priorAttempts + 1;
      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        reviewCalibrationAttempts: nextAttempts,
      };

      if (!isSubstantive) {
        if (nextAttempts >= MAX_REVIEW_CALIBRATION_ATTEMPTS) {
          nextMetadata['reviewCalibrationFiredAt'] = new Date().toISOString();
        }

        await tx
          .update(learningSessions)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(
            and(
              eq(learningSessions.id, session.id),
              eq(learningSessions.profileId, profileId)
            )
          );
        return null;
      }

      const timestamp = new Date().toISOString();
      nextMetadata['reviewCalibrationFiredAt'] = timestamp;

      await tx
        .update(learningSessions)
        .set({ metadata: nextMetadata, updatedAt: new Date() })
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId)
          )
        );

      return {
        profileId,
        sessionId: session.id,
        topicId,
        learnerMessage: learnerMessageText,
        topicTitle,
        timestamp,
      };
    }
  );

  if (!payload) return;

  try {
    await inngest.send({
      name: 'app/review.calibration.requested',
      data: payload,
    });
  } catch (err) {
    logger.warn('[session-exchange] review calibration dispatch failed', {
      event: 'review_calibration.dispatch_failed',
      profileId,
      sessionId: session.id,
      topicId: session.topicId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId,
      extra: {
        site: 'maybeDispatchReviewCalibration',
        sessionId: session.id,
        topicId: session.topicId,
      },
    });
  }
}

async function maybeDispatchTopicProbeExtraction(
  db: Database,
  profileId: string,
  session: {
    id: string;
    subjectId: string;
    topicId: string | null;
  },
  effectiveMode: string | undefined,
  conversationLanguage: ConversationLanguage | undefined,
  learnerMessageText: string,
  topicTitle: string | undefined,
  isFirstEncounter: boolean
): Promise<void> {
  if (effectiveMode !== 'learning') return;
  if (!isFirstEncounter) return;
  const topicId = session.topicId;
  if (!topicId || !topicTitle) return;
  if (
    !isSubstantiveCalibrationAnswer(learnerMessageText, conversationLanguage)
  ) {
    return;
  }

  const payload = await db.transaction<TopicProbeDispatchPayload | null>(
    async (tx) => {
      const [row] = await tx
        .select({ metadata: learningSessions.metadata })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId)
          )
        )
        .for('update')
        .limit(1);

      if (!row) return null;
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (metadata['topicProbeFiredAt'] != null) return null;

      const timestamp = new Date().toISOString();
      await tx
        .update(learningSessions)
        .set({
          metadata: {
            ...metadata,
            topicProbeFiredAt: timestamp,
            topicProbeExtractionStatus: 'pending',
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId)
          )
        );

      return {
        profileId,
        sessionId: session.id,
        subjectId: session.subjectId,
        topicId,
        learnerMessage: learnerMessageText,
        topicTitle,
        timestamp,
      };
    }
  );

  if (!payload) return;

  try {
    await inngest.send({
      name: 'app/topic-probe.requested',
      data: payload,
    });
  } catch (err) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ metadata: learningSessions.metadata })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId)
          )
        )
        .for('update')
        .limit(1);

      const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
      if (metadata['topicProbeFiredAt'] !== payload.timestamp) return;
      const nextMetadata = { ...metadata };
      delete nextMetadata['topicProbeFiredAt'];
      nextMetadata['topicProbeExtractionStatus'] = 'failed';
      await tx
        .update(learningSessions)
        .set({
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId)
          )
        );
    });
    logger.warn('[session-exchange] topic probe extraction dispatch failed', {
      event: 'topic_probe.dispatch_failed',
      profileId,
      sessionId: session.id,
      topicId: session.topicId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, {
      profileId,
      extra: {
        site: 'maybeDispatchTopicProbeExtraction',
        sessionId: session.id,
        topicId: session.topicId,
      },
    });
  }
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
export async function checkExchangeLimit(
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
export function mergeMemoryContexts(
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

/**
 * Builds the exchangeHistory array passed to the LLM from raw session events.
 *
 * Filters to user_message / ai_response / system_prompt and re-wraps prior
 * assistant turns in the JSON envelope format the LLM is instructed to emit.
 * The DB stores cleanResponse (prose only) for ai_response events, but the
 * system prompt instructs the LLM to produce envelopes — so without re-wrapping,
 * the model sees contradictory history (prose vs. JSON) and may produce
 * malformed output that streamEnvelopeReply cannot parse, yielding empty
 * responses on exchange 2+ (BUG-560).
 *
 * BUG-610: signal objects MUST be fully populated. Empty `signals: {}`
 * contradicts the system prompt's signal spec and triggers LLM format drift
 * after 2+ re-wrapped turns. Always emit explicit `false` for every signal.
 */
export interface ExchangeHistoryEvent {
  eventType: string | null;
  content: string;
  orphanReason?: string | null;
}

export function buildExchangeHistory(events: ExchangeHistoryEvent[]): Array<{
  role: 'user' | 'system' | 'assistant';
  content: string;
  orphan_reason?: string;
}> {
  return events
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
      ...(e.orphanReason ? { orphan_reason: e.orphanReason } : {}),
      content:
        e.eventType === 'ai_response'
          ? (() => {
              // [BUG-934] Legacy rows may have raw envelope JSON as content.
              // Project to plain reply text before re-wrapping in the envelope
              // so the LLM sees consistent, non-nested history.
              const replyText = projectAiResponseContent(e.content, {
                silent: true,
              });
              return JSON.stringify({
                reply: replyText,
                signals: {
                  partial_progress: false,
                  needs_deepening: false,
                  understanding_check: false,
                },
                ui_hints: {
                  note_prompt: { show: false, post_session: false },
                },
              });
            })()
          : e.content,
    }));
}

export async function prepareExchangeContext(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string,
  options?: {
    voyageApiKey?: string;
    homeworkMode?: 'help_me' | 'check_answer';
    llmTier?: import('../subscription').LLMTier;
    memoryFactsReadEnabled?: boolean;
    memoryFactsRelevanceEnabled?: boolean;
  }
): Promise<ExchangePrep> {
  // 1. Load session
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const sessionMeta = ((session.metadata as
    | Record<string, unknown>
    | undefined) ?? {}) as Record<string, unknown>;
  const isFreeform =
    session.sessionType === 'learning' &&
    !session.topicId &&
    sessionMeta['effectiveMode'] === 'freeform';
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
  const isFreeformWithRawInput = isFreeform && !!session.rawInput;
  const userMessageVectorPromise: Promise<number[] | undefined> =
    options?.voyageApiKey
      ? generateEmbedding(userMessage, options.voyageApiKey)
          .then((embedding) => embedding.vector)
          .catch((err) => {
            logger.warn(
              '[session-exchange] userMessage embedding failed; memory falls back',
              {
                event: 'session_exchange.user_msg_embedding.failed',
                reason: err instanceof Error ? err.message : String(err),
              }
            );
            return undefined;
          })
      : Promise.resolve(undefined);

  // BUG-70: Supplementary data is static within a session (priorTopics,
  // teachingPref, learningMode, learningProfile, crossSubjectHighlights).
  // Loaded once on first exchange, reused for the cache TTL.
  // [BUG-667 / S-10] getOrLoadSessionSupplementary deduplicates concurrent
  // first-exchange fetches via a per-session in-flight promise mutex —
  // previously two concurrent first exchanges would both run the 5-query
  // fan-out in parallel, doubling cold-path DB load. Now both await the same
  // promise. This sits inside the outer Promise.all so it still runs in
  // parallel with the per-exchange queries below.
  const supplementaryPromise = getOrLoadSessionSupplementary(
    db,
    profileId,
    sessionId,
    session.subjectId,
    isFreeform,
    staticContext
  );

  const [
    subject,
    topicRows,
    profileRows,
    retentionRows,
    priorTopicSessionRows,
    priorSubjectSessionRows,
    events,
    memory,
    metadataRows,
    rawInputMemory,
    lastSessionSummaryRows,
    supp,
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
    session.topicId
      ? db
          .select({ id: learningSessions.id })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.profileId, profileId),
              eq(learningSessions.topicId, session.topicId),
              ne(learningSessions.id, sessionId),
              gte(learningSessions.exchangeCount, 1)
            )
          )
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, profileId),
          eq(learningSessions.subjectId, session.subjectId),
          ne(learningSessions.id, sessionId)
        )
      )
      .limit(1),
    db.query.sessionEvents.findMany({
      where: and(
        eq(sessionEvents.sessionId, sessionId),
        eq(sessionEvents.profileId, profileId)
      ),
      // [BUG-913 sweep] Tie-break by id when created_at collides — see
      // session-crud.ts getSessionTranscript for the full rationale.
      orderBy: [asc(sessionEvents.createdAt), asc(sessionEvents.id)],
    }),
    userMessageVectorPromise.then((userMessageVector) =>
      retrieveRelevantMemory(
        db,
        profileId,
        userMessage,
        options?.voyageApiKey,
        undefined,
        userMessageVector
      )
    ),
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
    // CFLF-23: Pre-session similarity scan — uses rawInput for freeform sessions
    // Graceful degradation: if Voyage API is down, returns empty (never breaks session)
    isFreeformWithRawInput && session.rawInput
      ? retrieveRelevantMemory(
          db,
          profileId,
          session.rawInput,
          options?.voyageApiKey,
          5
        )
      : Promise.resolve({ context: '', topicIds: [] }),
    // B.4: Most recent completed session summary within 14-day freshness window.
    // Graceful enrichment — never throws; undefined means no usable summary.
    (async () => {
      try {
        const freshnessCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        return await db
          .select({
            content: sessionSummaries.content,
            exchangeCount: learningSessions.exchangeCount,
          })
          .from(sessionSummaries)
          .innerJoin(
            learningSessions,
            eq(sessionSummaries.sessionId, learningSessions.id)
          )
          .where(
            and(
              eq(sessionSummaries.profileId, profileId),
              ne(sessionSummaries.sessionId, sessionId),
              inArray(sessionSummaries.status, [
                'submitted',
                'accepted',
                'auto_closed',
              ]),
              gte(sessionSummaries.createdAt, freshnessCutoff)
            )
          )
          .orderBy(desc(sessionSummaries.createdAt))
          .limit(1);
      } catch (err) {
        logger.warn('[session-exchange] last-session-summary query failed', {
          event: 'session.last_summary_query_failed',
          profileId,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    })(),
    supplementaryPromise,
  ]);

  // Unpack supplementary back into the names the rest of the function uses.
  const priorTopics = supp.priorTopics;
  const teachingPref = supp.teachingPref;
  const learningModeRecord = supp.learningMode;
  const crossSubjectHighlights = supp.crossSubjectHighlights;
  const learningProfile = supp.learningProfile;

  const topic = topicRows[0];
  const [profile] = profileRows;
  const isFirstEncounter =
    Boolean(session.topicId) && priorTopicSessionRows.length === 0;
  const isFirstSessionOfSubject = priorSubjectSessionRows.length === 0;
  if (!profile) {
    logger.warn(
      '[processExchange] Profile not found — birthYear will be null, LLM defaults to adult tone',
      {
        profileId,
      }
    );
  }
  const retentionCard = retentionRows[0];

  // Determine verification type: explicit from session, or auto-select from retention card
  let verificationType: VerificationType | undefined;
  if (session.verificationType && session.verificationType !== 'standard') {
    verificationType = session.verificationType as Exclude<
      VerificationType,
      'standard'
    >;
  } else if (
    retentionCard &&
    !isInterleaved &&
    session.sessionType === 'learning'
  ) {
    const ease = retentionCard.easeFactor;
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
        const metaTopic = meta.interleavedTopics?.find((t) => t.topicId === id);
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
  const exchangeHistory = buildExchangeHistory(events);

  const rawSilentClassification = sessionMeta['silentClassification'];
  const silentClassification =
    rawSilentClassification &&
    typeof rawSilentClassification === 'object' &&
    !Array.isArray(rawSilentClassification) &&
    typeof (rawSilentClassification as { subjectId?: unknown }).subjectId ===
      'string' &&
    typeof (rawSilentClassification as { subjectName?: unknown })
      .subjectName === 'string' &&
    typeof (rawSilentClassification as { confidence?: unknown }).confidence ===
      'number'
      ? {
          subjectId: (rawSilentClassification as { subjectId: string })
            .subjectId,
          subjectName: (rawSilentClassification as { subjectName: string })
            .subjectName,
          confidence: (rawSilentClassification as { confidence: number })
            .confidence,
        }
      : undefined;

  let likelyLanguage = false;
  if (isFreeform && session.exchangeCount === 0) {
    likelyLanguage = LANGUAGE_REGEX.test(userMessage);
    if (likelyLanguage) {
      // [PR-FIX-05] Telemetry-only: no Inngest handler exists for this signal.
      // Emit via structured logger so it is queryable in Cloudflare Logpush /
      // wrangler tail without routing through the Inngest event queue.
      logger.info('ask.language_preclassified', {
        sessionId,
        matchedPattern: userMessage.match(LANGUAGE_REGEX)?.[0] ?? '',
      });
    }
  }

  if (isFreeform && session.exchangeCount === 1 && !silentClassification) {
    const priorUserMessages = exchangeHistory
      .filter((entry) => entry.role === 'user')
      .map((entry) => entry.content)
      .join('\n');

    inngest
      .send({
        name: 'app/ask.classify_silently',
        data: {
          sessionId,
          profileId,
          classifyInput: [priorUserMessages, userMessage]
            .filter(Boolean)
            .join('\n'),
          exchangeCount: session.exchangeCount + 1,
        },
      })
      .catch((err) => {
        logger.warn('ask.classify_silently.send_failed', { sessionId, err });
        captureException(err, {
          profileId,
          extra: {
            event: 'app/ask.classify_silently',
            sessionId,
          },
        });
      });
  }

  const [silentSubjectRows, silentTeachingPref] =
    silentClassification?.subjectId
      ? await Promise.all([
          db
            .select({
              id: subjects.id,
              name: subjects.name,
              pedagogyMode: subjects.pedagogyMode,
              languageCode: subjects.languageCode,
            })
            .from(subjects)
            .where(
              and(
                eq(subjects.id, silentClassification.subjectId),
                eq(subjects.profileId, profileId),
                eq(subjects.status, 'active')
              )
            )
            .limit(1),
          getTeachingPreference(db, profileId, silentClassification.subjectId),
        ])
      : [[], null];
  const silentSubject = silentSubjectRows[0];
  const effectiveSubjectName = isFreeform
    ? silentClassification?.subjectName ?? 'Unknown'
    : subject?.name ?? 'Unknown';
  const effectivePedagogyMode: 'socratic' | 'four_strands' = likelyLanguage
    ? 'four_strands'
    : isFreeform
    ? (silentSubject?.pedagogyMode as
        | 'socratic'
        | 'four_strands'
        | undefined) ?? 'socratic'
    : (subject?.pedagogyMode as 'socratic' | 'four_strands' | undefined) ??
      'socratic';
  const effectiveLanguageCode = isFreeform
    ? silentSubject?.languageCode ?? undefined
    : subject?.languageCode ?? undefined;
  const effectiveTeachingPref = isFreeform ? silentTeachingPref : teachingPref;
  const effectiveVocabularySubjectId = isFreeform
    ? silentClassification?.subjectId
    : session.subjectId;
  const knownVocabularyRows =
    effectivePedagogyMode === 'four_strands' && effectiveVocabularySubjectId
      ? await db
          .select({ term: vocabulary.term })
          .from(vocabulary)
          .where(
            and(
              eq(vocabulary.profileId, profileId),
              eq(vocabulary.subjectId, effectiveVocabularySubjectId),
              eq(vocabulary.mastered, true)
            )
          )
          .orderBy(desc(vocabulary.updatedAt))
          .limit(60)
      : [];

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
      easeFactor: retentionCard.easeFactor,
      intervalDays: retentionCard.intervalDays,
      repetitions: retentionCard.repetitions,
      failureCount: retentionCard.failureCount,
      consecutiveSuccesses: retentionCard.consecutiveSuccesses,
      xpStatus: retentionCard.xpStatus,
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
  const lastAiResponseEvent = aiResponseEvents[aiResponseEvents.length - 1];
  const lastAiResponseAt = lastAiResponseEvent?.createdAt ?? null;

  // 3d. Read the previous-turn partial_progress signal from metadata (F1.2).
  // Pre-migration this was parsed from the AI response text via the
  // [PARTIAL_PROGRESS] marker; after the envelope migration the signal
  // lives in structured metadata persisted alongside the ai_response event.
  const previousResponseHadPartialProgress =
    (lastAiResponseEvent?.metadata as Record<string, unknown> | null)
      ?.partialProgress === true;

  // 3e. Count consecutive trailing ai_response events with partialProgress
  // so the MAX_PARTIAL_PROGRESS_HOLDS cap in evaluateEscalation fires. We
  // walk backwards from the most recent ai_response; the streak breaks on
  // the first event without the flag.
  let consecutiveHolds = 0;
  for (let i = aiResponseEvents.length - 1; i >= 0; i--) {
    const meta = aiResponseEvents[i]?.metadata as Record<
      string,
      unknown
    > | null;
    if (meta?.partialProgress === true) {
      consecutiveHolds++;
    } else {
      break;
    }
  }

  // 4. Evaluate escalation (retention-aware + partial-progress-aware)
  // On first exchange: use retention-aware starting rung (Gap 4)
  const currentRung =
    session.exchangeCount === 0 && retentionStatusValue
      ? getRetentionAwareStartingRung(retentionStatusValue)
      : session.escalationRung;

  const escalationDecision = evaluateEscalation(
    {
      currentRung,
      hintCount,
      questionsAtCurrentRung,
      totalExchanges: session.exchangeCount,
      retentionStatus: retentionStatusValue,
      previousResponseHadPartialProgress,
      consecutiveHolds,
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
  const sessionMetadata = session.metadata as Record<string, unknown> | null;
  const onboardingSignals = extractedInterviewSignalsSchema.safeParse(
    sessionMetadata?.onboardingFastPath &&
      typeof sessionMetadata.onboardingFastPath === 'object' &&
      !Array.isArray(sessionMetadata.onboardingFastPath)
      ? (sessionMetadata.onboardingFastPath as Record<string, unknown>)[
          'extractedSignals'
        ]
      : undefined
  );
  const extractedSignals = extractedInterviewSignalsSchema.safeParse(
    sessionMetadata?.extractedSignals
  );
  const extractedSignalsToReflect = extractedSignals.success
    ? {
        goals:
          extractedSignals.data.goals.length > 0
            ? extractedSignals.data.goals.join('; ')
            : undefined,
        currentKnowledge: extractedSignals.data.currentKnowledge || undefined,
        interests: extractedSignals.data.interests,
      }
    : null;
  const resumeFromSessionId =
    typeof sessionMetadata?.resumeFromSessionId === 'string'
      ? sessionMetadata.resumeFromSessionId
      : undefined;
  let continuationOpenerPhase: 'probe' | 'score' | undefined;
  let continuationDepth: 'low' | 'mid' | 'high' | undefined =
    sessionMetadata?.continuationDepth === 'low' ||
    sessionMetadata?.continuationDepth === 'mid' ||
    sessionMetadata?.continuationDepth === 'high'
      ? sessionMetadata.continuationDepth
      : undefined;
  const continuationOpenerActive =
    sessionMetadata?.continuationOpenerActive === true;
  const continuationCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const priorSessionMeta = resumeFromSessionId
    ? await loadPriorSessionMeta(db, profileId, resumeFromSessionId)
    : null;

  if (continuationOpenerActive && session.exchangeCount >= 3) {
    continuationDepth = 'mid';
    const nextMetadata = { ...(sessionMetadata ?? {}) };
    delete nextMetadata['continuationOpenerActive'];
    delete nextMetadata['continuationOpenerStartedExchange'];
    nextMetadata['continuationDepth'] = continuationDepth;
    await updateSessionMetadata(db, profileId, sessionId, nextMetadata);
  } else if (continuationOpenerActive) {
    continuationOpenerPhase = session.exchangeCount >= 1 ? 'score' : 'probe';
  } else if (
    session.exchangeCount === 0 &&
    resumeFromSessionId &&
    session.topicId &&
    priorSessionMeta?.topicId === session.topicId &&
    priorSessionMeta.endedAt &&
    priorSessionMeta.endedAt >= continuationCutoff
  ) {
    continuationOpenerPhase = 'probe';
    await updateSessionMetadata(db, profileId, sessionId, {
      ...(sessionMetadata ?? {}),
      continuationOpenerActive: true,
      continuationOpenerStartedExchange: 0,
    });
  }
  const resumeContext = resumeFromSessionId
    ? await buildResumeContext(db, profileId, resumeFromSessionId)
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

  // P1.4: Load urgency boost for the current session's subject (if any)
  let activeUrgency: { reason: string; boostUntil: Date } | null = null;
  if (session.subjectId && !isFreeform) {
    const urgencyRows = await db
      .select({
        urgencyBoostReason: subjects.urgencyBoostReason,
        urgencyBoostUntil: subjects.urgencyBoostUntil,
      })
      .from(subjects)
      .where(
        and(
          eq(subjects.id, session.subjectId),
          eq(subjects.profileId, profileId),
          eq(subjects.status, 'active')
        )
      )
      .limit(1);
    const urgencyRow = urgencyRows[0];
    if (
      urgencyRow?.urgencyBoostReason &&
      urgencyRow.urgencyBoostUntil &&
      urgencyRow.urgencyBoostUntil > new Date()
    ) {
      activeUrgency = {
        reason: urgencyRow.urgencyBoostReason,
        boostUntil: urgencyRow.urgencyBoostUntil,
      };
    }
  }

  const userMessageVector = await userMessageVectorPromise;
  const scopedRepo = createScopedRepository(db, profileId);
  let memorySnapshot: MemorySnapshot | null = null;
  if (
    learningProfile &&
    options?.memoryFactsRelevanceEnabled &&
    hasMemoryFactsBackfillMarker(learningProfile)
  ) {
    const relevanceResult = await getRelevantMemories({
      profileId,
      queryText: userMessage,
      queryVector: userMessageVector,
      k: 8,
      profile: learningProfile,
      scoped: scopedRepo,
      embedder: makeEmbedderFromEnv(options.voyageApiKey),
    });
    if (relevanceResult.source !== 'relevance') {
      logger.warn('[memory_facts] relevance fallback', {
        event: 'memory_facts.relevance.fallback',
        source: relevanceResult.source,
        profileId,
      });
    }
    memorySnapshot = relevanceResult.snapshot;
  } else if (
    learningProfile &&
    options?.memoryFactsReadEnabled &&
    hasMemoryFactsBackfillMarker(learningProfile)
  ) {
    memorySnapshot = await readMemorySnapshotFromFacts(
      scopedRepo,
      learningProfile
    );
  }

  const memoryBlock = learningProfile
    ? buildMemoryBlock(
        {
          learningStyle:
            (learningProfile.learningStyle as LearningStyle | null) ?? null,
          interests: memorySnapshot
            ? memorySnapshot.interests
            : Array.isArray(learningProfile.interests)
            ? learningProfile.interests
            : [],
          strengths: memorySnapshot
            ? memorySnapshot.strengths
            : ((Array.isArray(learningProfile.strengths)
                ? learningProfile.strengths
                : []) as StrengthEntry[]),
          struggles: memorySnapshot
            ? memorySnapshot.struggles
            : ((Array.isArray(learningProfile.struggles)
                ? learningProfile.struggles
                : []) as StruggleEntry[]),
          communicationNotes: memorySnapshot
            ? memorySnapshot.communicationNotes
            : Array.isArray(learningProfile.communicationNotes)
            ? learningProfile.communicationNotes
            : [],
          memoryEnabled: learningProfile.memoryEnabled,
          memoryInjectionEnabled: learningProfile.memoryInjectionEnabled,
          memoryConsentStatus: learningProfile.memoryConsentStatus,
          effectivenessSessionCount:
            learningProfile.effectivenessSessionCount ?? 0,
          activeUrgency,
          // B.4: Last session summary — quality-gated in buildMemoryBlock
          lastSessionSummary: lastSessionSummaryRows[0]?.content ?? undefined,
          lastSessionExchangeCount:
            lastSessionSummaryRows[0]?.exchangeCount ?? undefined,
        },
        isFreeform
          ? silentClassification?.subjectName ?? null
          : subject?.name ?? null,
        topic?.title ?? null,
        {
          status: retentionStatusValue,
          strongTopics: strongTopicTitles,
        },
        Array.isArray(learningProfile.recentlyResolvedTopics)
          ? (learningProfile.recentlyResolvedTopics as Array<
              string | { topic: string; subject: string | null }
            >)
          : []
      )
    : null;
  const learnerMemoryContext = memoryBlock?.text || undefined;

  // B.4 monitoring: memory block size
  if (learnerMemoryContext) {
    const sectionCount = (learnerMemoryContext.match(/^- /gm) ?? []).length;
    logger.info('[session-exchange] memory block size', {
      event: 'llm.memory_block_size',
      sessionId,
      sizeChars: learnerMemoryContext.length,
      sectionCount,
    });
  }

  // FR254: Build accommodation block — independent of memory injection toggle
  const accommodationContext = learningProfile
    ? buildAccommodationBlock(
        learningProfile.accommodationMode as string | null
      ) || undefined
    : undefined;

  // 6. Build ExchangeContext
  // For interleaved sessions: use the topic list, clear single-topic fields
  const context: ExchangeContext = {
    sessionId,
    profileId,
    subjectName: effectiveSubjectName,
    topicTitle: interleavedTopics ? undefined : topic?.title,
    topicDescription: interleavedTopics ? undefined : topic?.description,
    sessionType: session.sessionType,
    escalationRung: effectiveRung,
    exchangeHistory,
    birthYear: profile?.birthYear ?? null,
    // BKT-C.1 — source the profile-level tutor language + pronouns here so
    // every downstream call path (processExchange, streamExchange) receives
    // the same personalization. Defaults: 'en' (DB NOT NULL) and null.
    // DB CHECK constraint guarantees this is a valid ConversationLanguage.
    // Drizzle infers `string`; narrow to the union type for downstream safety.
    conversationLanguage: profile?.conversationLanguage as
      | ConversationLanguage
      | undefined,
    pronouns: profile?.pronouns ?? null,
    workedExampleLevel: interleavedTopics ? undefined : workedExampleLevel,
    priorLearningContext: priorLearning.contextText || undefined,
    crossSubjectContext,
    learningHistoryContext,
    resumeContext,
    accommodationContext,
    learnerMemoryContext,
    // CFLF-23: Merge per-message memory with rawInput-based pre-session memory
    embeddingMemoryContext:
      mergeMemoryContexts(memory.context, rawInputMemory.context) || undefined,
    pedagogyMode: effectivePedagogyMode,
    nativeLanguage: effectiveTeachingPref?.nativeLanguage ?? undefined,
    languageCode: effectiveLanguageCode,
    knownVocabulary: knownVocabularyRows.map((row) => row.term).slice(0, 60),
    teachingPreference: effectiveTeachingPref?.method,
    analogyDomain: effectiveTeachingPref?.analogyDomain ?? undefined,
    interleavedTopics,
    verificationType,
    evaluateDifficultyRung,
    learningMode: learningModeRecord.mode,
    // Gap 4: Populate retention status for prompt-level awareness
    retentionStatus: retentionStatusValue
      ? {
          status: retentionStatusValue,
          easeFactor: retentionCard ? retentionCard.easeFactor : undefined,
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
    // Teach-first: expose exchange count so buildSystemPrompt can gate first-exchange behaviour
    exchangeCount: session.exchangeCount,
    // Client-side effective mode — drives mode-specific prompt sections (e.g. recitation)
    effectiveMode: (session.metadata as Record<string, unknown> | null)
      ?.effectiveMode as string | undefined,
    gapAreas: Array.isArray(sessionMetadata?.gaps)
      ? sessionMetadata.gaps
          .map((gap) => String(gap).trim())
          .filter((gap) => gap.length > 0)
          .slice(0, 8)
      : undefined,
    continuationOpenerPhase,
    continuationDepth,
    // Personalisation: learner's display name for the mentor to use naturally
    learnerName: profile?.displayName ?? undefined,
    onboardingSignals: onboardingSignals.success
      ? onboardingSignals.data
      : undefined,
    isFirstEncounter,
    isFirstSessionOfSubject,
    extractedSignalsToReflect,
    // B.3: Consecutive correct-answer streak at the current escalation rung.
    // Used by the prompt to trigger adaptive escalation when streak >= 4.
    correctStreak: computeCorrectStreak(events, effectiveRung),
  };

  return { session, context, effectiveRung, hintCount, lastAiResponseAt };
}

export async function persistExchangeResult(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
  userMessage: string,
  aiResponse: string,
  effectiveRung: EscalationRung,
  behavioral?: Partial<ExchangeBehavioralMetrics>,
  clientId?: string
): Promise<{
  exchangeCount: number;
  aiEventId?: string;
  persistedUserMessage: boolean;
}> {
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
      // Envelope signals persisted so the next turn can read them back for
      // escalation-hold (F1.2) and remediation-queue (F1.3) decisions.
      ...(behavioral.partialProgress !== undefined && {
        partialProgress: behavioral.partialProgress,
      }),
      ...(behavioral.needsDeepening !== undefined && {
        needsDeepening: behavioral.needsDeepening,
      }),
      ...(behavioral.confidence !== undefined && {
        confidence: behavioral.confidence,
      }),
      ...(behavioral.retrievalScore !== undefined && {
        retrievalScore: behavioral.retrievalScore,
      }),
    }),
  };

  let insertedUserEventId: string | undefined;
  if (clientId) {
    const insertedUserRows = await db
      .insert(sessionEvents)
      .values({
        sessionId,
        profileId,
        subjectId: session.subjectId,
        eventType: 'user_message' as const,
        content: userMessage,
        clientId,
      })
      .onConflictDoNothing({
        target: [sessionEvents.sessionId, sessionEvents.clientId],
      })
      .returning({ id: sessionEvents.id });

    insertedUserEventId = insertedUserRows[0]?.id;
    if (!insertedUserEventId) {
      const freshSession = await getSession(db, profileId, sessionId);
      return {
        exchangeCount: freshSession?.exchangeCount ?? session.exchangeCount,
        persistedUserMessage: false,
      };
    }
  }

  // [S-1 / BUG-626] Run the atomic exchange-count UPDATE FIRST and only
  // insert events if it succeeded. Pre-fix: events were inserted BEFORE the
  // UPDATE — two concurrent requests at exchangeCount=MAX-1 both inserted
  // user_message + ai_response, then raced UPDATE; the loser threw
  // SessionExchangeLimitError but its events stayed in the DB as orphans
  // (visible as ghost turns in subsequent exchangeHistory loads).
  //
  // Why reorder instead of wrap in a transaction:
  //
  // [BUG-981 / CCR-PR126-M-5] The production driver was migrated from
  // neon-http to neon-serverless (Phase 0.0 of the RLS preparatory plan,
  // see packages/database/src/client.ts), so interactive transactions over
  // WebSocket are now supported. The earlier comment on this block claimed
  // db.transaction "silently degrades to sequential statements" — that
  // claim is no longer true and was removed.
  //
  // The reorder is kept for two reasons that *do* still hold:
  //   1. The hot path makes only two writes (UPDATE + 1–2 INSERTs); on the
  //      contention loser branch we want to avoid the cost of opening a tx
  //      just to roll back. The targeted DELETE rollback below is cheaper.
  //   2. We are mid-migration on RLS plumbing; until createScopedRepository
  //      is fully RLS-aware everywhere, mixing tx wrapping with repo writes
  //      requires extra ceremony we'd rather defer.
  //
  // If those constraints lift, this block is a candidate for replacement
  // with a single db.transaction(async (tx) => { ... }) block — the driver
  // now supports it correctly.
  //
  // Trade-off: if the post-UPDATE INSERTs fail (e.g., connection drop)
  // we get a counter increment without events. This is rare and recoverable
  // (user retries, sees fresh state) — strictly less harmful than orphan
  // events polluting history permanently.
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
    if (insertedUserEventId) {
      try {
        await db
          .delete(sessionEvents)
          .where(
            and(
              eq(sessionEvents.id, insertedUserEventId),
              eq(sessionEvents.profileId, profileId)
            )
          );
      } catch (rollbackErr) {
        captureException(rollbackErr, {
          profileId,
          extra: {
            context: 'session.exchange.user_insert_rollback_failed',
            sessionId,
            clientId,
            userEventId: insertedUserEventId,
          },
        });
      }
    }
    throw new SessionExchangeLimitError(session.exchangeCount);
  }

  // Atomic guard passed — now persist the events.
  // Drill score is sparse: only set on ai_response when the LLM emitted a
  // scored fluency drill on this turn. Null on every other exchange.
  const drillCorrect = behavioral?.drillCorrect ?? null;
  const drillTotal = behavioral?.drillTotal ?? null;
  const insertedEvents = clientId
    ? await db
        .insert(sessionEvents)
        .values({
          sessionId,
          profileId,
          subjectId: session.subjectId,
          eventType: 'ai_response' as const,
          content: aiResponse,
          metadata: aiMetadata,
          drillCorrect,
          drillTotal,
        })
        .returning({
          id: sessionEvents.id,
          eventType: sessionEvents.eventType,
        })
    : await db
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
            drillCorrect,
            drillTotal,
          },
        ])
        .returning({
          id: sessionEvents.id,
          eventType: sessionEvents.eventType,
        });

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

  // B.1 monitoring: tone check — detect banned filler openers
  {
    const words = aiResponse.trim().split(/\s+/);
    const firstSixWords = words.slice(0, 6).join(' ').toLowerCase();
    const startsWithFiller = BANNED_FILLER_OPENERS.some((opener) =>
      firstSixWords.startsWith(opener)
    );
    logger.info('[session-exchange] tone check', {
      event: 'llm.tone_check',
      sessionId,
      firstSixWords,
      wordCount: words.length,
      startsWithFiller,
    });
  }

  // B.2 monitoring: pronunciation leak in text mode
  if (session.inputMode !== 'voice') {
    if (/\([^)]*(?:say:|pronounced:?)[^)]*\)/i.test(aiResponse)) {
      logger.warn('[session-exchange] text mode pronunciation leak', {
        event: 'llm.text_mode_pronunciation_leak',
        sessionId,
      });
    }
  }

  // B.3 monitoring: escalation offered on correct streak
  if (behavioral?.correctStreak != null && behavioral.correctStreak >= 4) {
    logger.info('[session-exchange] escalation offered', {
      event: 'llm.escalation_offered',
      sessionId,
      correctStreak: behavioral.correctStreak,
    });
  }

  return {
    exchangeCount: updated.exchangeCount,
    aiEventId: insertedEvents.find((event) => event.eventType === 'ai_response')
      ?.id,
    persistedUserMessage: true,
  };
}

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
    llmTier?: import('../subscription').LLMTier;
    clientId?: string;
    memoryFactsReadEnabled?: boolean;
    memoryFactsRelevanceEnabled?: boolean;
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

  await maybeDispatchReviewCalibration(
    db,
    profileId,
    { id: session.id, topicId: session.topicId },
    context.effectiveMode,
    context.conversationLanguage,
    input.message,
    context.topicTitle
  );

  const imageData: ImageData | undefined =
    input.imageBase64 && input.imageMimeType
      ? { base64: input.imageBase64, mimeType: input.imageMimeType }
      : undefined;
  let result: Awaited<ReturnType<typeof processExchange>>;
  try {
    result = await processExchange(context, input.message, imageData);
  } catch (cause) {
    const err = new LlmStreamError('processExchange threw', cause);
    if (options?.clientId) {
      try {
        await persistUserMessageOnly(db, profileId, sessionId, input.message, {
          clientId: options.clientId,
          orphanReason: classifyOrphanError(err),
        });
      } catch (persistErr) {
        await inngest.send({
          name: 'app/orphan.persist.failed',
          data: {
            profileId,
            sessionId,
            route: 'session-exchange/process',
            reason: classifyOrphanError(err),
            error: String(persistErr),
          },
        });
        captureException(persistErr, {
          profileId,
          extra: { phase: 'orphan_persist_failed' },
        });
      }
    }
    throw err;
  }

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
      partialProgress: result.partialProgress,
      needsDeepening: result.needsDeepening,
      confidence: result.confidence,
      retrievalScore: result.retrievalScore,
      drillCorrect: result.fluencyDrill?.score?.correct,
      drillTotal: result.fluencyDrill?.score?.total,
    },
    options?.clientId
  );

  await applyContinuationScore(db, profileId, sessionId, result.retrievalScore);
  if (persisted.persistedUserMessage) {
    await maybeDispatchTopicProbeExtraction(
      db,
      profileId,
      {
        id: session.id,
        subjectId: session.subjectId,
        topicId: session.topicId,
      },
      context.effectiveMode,
      context.conversationLanguage,
      input.message,
      context.topicTitle,
      context.isFirstEncounter === true
    );
  }

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
    llmTier?: import('../subscription').LLMTier;
    clientId?: string;
    memoryFactsReadEnabled?: boolean;
    memoryFactsRelevanceEnabled?: boolean;
  }
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: () => Promise<{
    exchangeCount: number;
    escalationRung: number;
    expectedResponseMinutes: number;
    aiEventId?: string;
    notePrompt?: boolean;
    notePromptPostSession?: boolean;
    fluencyDrill?: FluencyDrillAnnotation;
    confidence?: 'low' | 'medium' | 'high';
    /** [BUG-941] Set when the LLM response was empty or unparseable — caller
     *  MUST emit a `fallback` SSE frame and skip persisting the exchange so
     *  the raw envelope never reaches ai_response.content. */
    fallback?: ExchangeFallback;
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

  await maybeDispatchReviewCalibration(
    db,
    profileId,
    { id: session.id, topicId: session.topicId },
    context.effectiveMode,
    context.conversationLanguage,
    input.message,
    context.topicTitle
  );

  // Compute time-to-answer before streaming begins
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() - lastAiResponseAt.getTime()
    : null;

  const imageData: ImageData | undefined =
    input.imageBase64 && input.imageMimeType
      ? { base64: input.imageBase64, mimeType: input.imageMimeType }
      : undefined;
  let result: Awaited<ReturnType<typeof streamExchange>>;
  try {
    result = await streamExchange(context, input.message, imageData);
  } catch (cause) {
    throw new LlmStreamError('streamExchange threw', cause);
  }

  return {
    stream: result.stream,
    async onComplete() {
      // The client-facing `stream` yields only decoded `reply` text via
      // teeEnvelopeStream. The full raw envelope (with signals + ui_hints)
      // is available through `rawResponsePromise` once the caller finishes
      // draining the stream — that's the one classifyExchangeOutcome wants.
      let rawResponse: string;
      try {
        rawResponse = await result.rawResponsePromise;
      } catch (cause) {
        const err = new LlmStreamError('rawResponsePromise rejected', cause);
        if (options?.clientId) {
          try {
            await persistUserMessageOnly(
              db,
              profileId,
              sessionId,
              input.message,
              {
                clientId: options.clientId,
                orphanReason: classifyOrphanError(err),
              }
            );
          } catch (persistErr) {
            await inngest.send({
              name: 'app/orphan.persist.failed',
              data: {
                profileId,
                sessionId,
                route: 'session-exchange/stream',
                reason: classifyOrphanError(err),
                error: String(persistErr),
              },
            });
            captureException(persistErr, {
              profileId,
              extra: { phase: 'orphan_persist_failed' },
            });
          }
        }
        throw err;
      }

      // [BUG-941] Use classifyExchangeOutcome (same as interview path) so that
      // empty / unparseable / orphan-marker responses return a typed fallback
      // instead of falling back to `response.trim()` — the raw envelope JSON —
      // which would be written verbatim to ai_response.content and re-rendered
      // by the client as a raw JSON blob.
      const outcome = classifyExchangeOutcome(rawResponse, {
        sessionId,
        profileId,
        flow: 'streamMessage',
      });

      // [BUG-941] When the LLM emitted an unparseable / empty response, return
      // the fallback descriptor without persisting. The caller (sessions route)
      // MUST emit a `fallback` SSE frame and refund the quota increment so the
      // exchange is not counted. Raw envelope NEVER touches ai_response.content.
      if (outcome.fallback) {
        if (options?.clientId) {
          try {
            await persistUserMessageOnly(
              db,
              profileId,
              sessionId,
              input.message,
              {
                clientId: options.clientId,
                orphanReason: 'llm_empty_or_unparseable',
              }
            );
          } catch (persistErr) {
            await inngest.send({
              name: 'app/orphan.persist.failed',
              data: {
                profileId,
                sessionId,
                route: 'session-exchange/fallback',
                reason: 'llm_empty_or_unparseable',
                error: String(persistErr),
              },
            });
            captureException(persistErr, {
              profileId,
              extra: { phase: 'orphan_persist_failed' },
            });
          }
        }
        return {
          exchangeCount: 0,
          escalationRung: effectiveRung,
          expectedResponseMinutes: 0,
          fallback: outcome.fallback,
        };
      }

      const parsed = outcome.parsed;
      const expectedResponseMinutes = estimateExpectedResponseMinutes(
        parsed.cleanResponse,
        context
      );
      const persisted = await persistExchangeResult(
        db,
        profileId,
        sessionId,
        session,
        input.message,
        parsed.cleanResponse,
        effectiveRung,
        {
          isUnderstandingCheck: parsed.understandingCheck,
          timeToAnswerMs,
          hintCountInSession: hintCount,
          expectedResponseMinutes,
          homeworkMode: input.homeworkMode,
          partialProgress: parsed.partialProgress,
          needsDeepening: parsed.needsDeepening,
          confidence: parsed.confidence,
          retrievalScore: parsed.retrievalScore,
          drillCorrect: parsed.fluencyDrill?.score?.correct,
          drillTotal: parsed.fluencyDrill?.score?.total,
        },
        options?.clientId
      );
      await applyContinuationScore(
        db,
        profileId,
        sessionId,
        parsed.retrievalScore
      );
      if (persisted.persistedUserMessage) {
        await maybeDispatchTopicProbeExtraction(
          db,
          profileId,
          {
            id: session.id,
            subjectId: session.subjectId,
            topicId: session.topicId,
          },
          context.effectiveMode,
          context.conversationLanguage,
          input.message,
          context.topicTitle,
          context.isFirstEncounter === true
        );
      }
      return {
        exchangeCount: persisted.exchangeCount,
        escalationRung: effectiveRung,
        expectedResponseMinutes,
        aiEventId: persisted.aiEventId,
        notePrompt: parsed.notePrompt || undefined,
        notePromptPostSession: parsed.notePromptPostSession || undefined,
        fluencyDrill: parsed.fluencyDrill ?? undefined,
        confidence: parsed.confidence,
      };
    },
  };
}
