// ---------------------------------------------------------------------------
// Session Exchange — message processing, context preparation, persistence
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, inArray, lt, sql, gte } from 'drizzle-orm';
import {
  learningSessions,
  sessionEvents,
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
  processExchange,
  streamExchange,
  estimateExpectedResponseMinutes,
  parseExchangeEnvelope,
  type ExchangeContext,
  type FluencyDrillAnnotation,
  type ImageData,
} from '../exchanges';
import {
  evaluateEscalation,
  getRetentionAwareStartingRung,
} from '../escalation';
import {
  fetchPriorTopics,
  buildPriorLearningContext,
  fetchCrossSubjectHighlights,
  buildCrossSubjectContext,
} from '../prior-learning';
import {
  buildMemoryBlock,
  getLearningProfile,
  buildAccommodationBlock,
} from '../learner-profile';
import { retrieveRelevantMemory } from '../memory';
import { getTeachingPreference } from '../retention-data';
import { shouldTriggerEvaluate } from '../evaluate';
import { shouldTriggerTeachBack } from '../teach-back';
import { getRetentionStatus, type RetentionState } from '../retention';
import { getLearningMode } from '../settings';
import type { EscalationRung } from '../llm';
import { inngest } from '../../inngest/client';
import {
  getSessionStaticContext,
  getSessionStaticContextCacheKey,
  touchSessionStaticContextCacheEntry,
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
/**
 * English-language intent pre-classifier used to fast-path four-strands
 * pedagogy for obvious translation / "how do you say" asks.
 */
const LANGUAGE_REGEX =
  /\b(how do (you|i) say|translate|in (french|spanish|german|czech|italian|portuguese|japanese|chinese|korean|arabic|russian|hindi|dutch|polish|swedish|norwegian|danish|finnish|greek|turkish|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|swahili|hebrew|ukrainian|croatian|serbian|slovak|slovenian|bulgarian|latvian|lithuanian|estonian)|what('s| is) .+ in \w+)\b/i;

const logger = createLogger();

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

export async function prepareExchangeContext(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string,
  options?: {
    voyageApiKey?: string;
    homeworkMode?: 'help_me' | 'check_answer';
    llmTier?: import('../subscription').LLMTier;
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
      : isFreeform
      ? Promise.resolve([])
      : fetchPriorTopics(db, profileId, session.subjectId),
    retrieveRelevantMemory(db, profileId, userMessage, options?.voyageApiKey),
    // FR58: Load teaching method preference for adaptive teaching
    cachedSupp
      ? Promise.resolve(cachedSupp.teachingPref)
      : isFreeform
      ? Promise.resolve(null)
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
      : isFreeform
      ? Promise.resolve([])
      : fetchCrossSubjectHighlights(db, profileId, session.subjectId),
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
      // DB stores cleanResponse (prose only) for ai_response events, but the
      // system prompt instructs the LLM to produce JSON envelopes. Re-wrap
      // assistant turns in a minimal envelope so the conversation history is
      // consistent with the format the LLM is told to produce. Without this,
      // exchange 2+ sees contradictory history (prose vs JSON instruction) and
      // the LLM may produce malformed output that streamEnvelopeReply can't
      // parse — yielding empty responses.
      //
      // IMPORTANT: Use fully-populated default signals (not empty `{}`).
      // Empty signal objects contradict the system prompt's signal spec and
      // cause LLM format drift after 2+ re-wrapped turns — BUG-610.
      content:
        e.eventType === 'ai_response'
          ? JSON.stringify({
              reply: e.content,
              signals: {
                partial_progress: false,
                needs_deepening: false,
                understanding_check: false,
              },
              ui_hints: { note_prompt: { show: false, post_session: false } },
            })
          : e.content,
    }));

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
      // Telemetry-only event — no Inngest handler; consumed by observability tooling.
      void inngest.send({
        name: 'app/ask.language_preclassified',
        data: {
          sessionId,
          matchedPattern: userMessage.match(LANGUAGE_REGEX)?.[0] ?? '',
        },
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
      easeFactor: Number(retentionCard.easeFactor),
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

  const memoryBlock = learningProfile
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
          memoryConsentStatus: learningProfile.memoryConsentStatus,
          effectivenessSessionCount:
            learningProfile.effectivenessSessionCount ?? 0,
          activeUrgency,
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
    // Teach-first: expose exchange count so buildSystemPrompt can gate first-exchange behaviour
    exchangeCount: session.exchangeCount,
    // Client-side effective mode — drives mode-specific prompt sections (e.g. recitation)
    effectiveMode: (session.metadata as Record<string, unknown> | null)
      ?.effectiveMode as string | undefined,
    // Personalisation: learner's display name for the mentor to use naturally
    learnerName: profile?.displayName ?? undefined,
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

  const imageData: ImageData | undefined =
    input.imageBase64 && input.imageMimeType
      ? { base64: input.imageBase64, mimeType: input.imageMimeType }
      : undefined;
  const result = await processExchange(context, input.message, imageData);

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
    llmTier?: import('../subscription').LLMTier;
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

  const imageData: ImageData | undefined =
    input.imageBase64 && input.imageMimeType
      ? { base64: input.imageBase64, mimeType: input.imageMimeType }
      : undefined;
  const result = await streamExchange(context, input.message, imageData);

  return {
    stream: result.stream,
    async onComplete() {
      // The client-facing `stream` yields only decoded `reply` text via
      // teeEnvelopeStream. The full raw envelope (with signals + ui_hints)
      // is available through `rawResponsePromise` once the caller finishes
      // draining the stream — that's the one parseExchangeEnvelope wants.
      const rawResponse = await result.rawResponsePromise;
      const parsed = parseExchangeEnvelope(rawResponse, {
        sessionId,
        profileId,
        flow: 'streamMessage',
      });

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
        }
      );
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
