// ---------------------------------------------------------------------------
// Session Exchange — message processing, context preparation, persistence
// ---------------------------------------------------------------------------

import { eq, and, desc, inArray, lt, sql, gte, ne } from 'drizzle-orm';
import {
  assessments,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  retentionCards,
  needsDeepeningTopics,
  challengeRoundCooldowns,
  vocabulary,
  subjects,
  createScopedRepository,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundNoteDraftHint,
  ConversationLanguage,
  LearningSession,
  LlmResponseEnvelope,
  SessionMessageInput,
  LearningStyle,
  StrengthEntry,
  FocusAreaEntry,
  SubscriptionTier,
  VerificationType,
  ChallengeRoundSessionState,
  TopicProbeRequestedEvent,
  ReviewCalibrationRequestedEvent,
} from '@eduagent/schemas';
import {
  ConflictError,
  NotFoundError,
  LlmStreamError,
  classifyOrphanError,
  challengeRoundSessionStateSchema,
  extractedInterviewSignalsSchema,
  isUnambiguouslyAdult,
} from '@eduagent/schemas';
import { persistUserMessageOnly } from './persist-user-message-only';
import {
  processExchange,
  streamExchange,
  estimateExpectedResponseMinutes,
  classifyExchangeOutcome,
  auditExchangeSources,
  applySourceAuditSafetyFallback,
  inferObviousReliableSourceForAudit,
  type ExchangeFallback,
  type ExchangeSourceAudit,
  type FluencyDrillAnnotation,
  type ImageData,
} from '../exchanges';
import type { ExchangeContext } from '../exchange-types';
import {
  evaluateEscalation,
  getRetentionAwareStartingRung,
} from '../escalation';
import {
  buildPriorLearningContext,
  buildCrossSubjectContext,
} from '../prior-learning';
import { buildMemoryBlock, buildAccommodationBlock } from '../learner-profile';
import { applyAppHelpSignalGuard, isAppHelpQuery } from '../app-help-map';
import { generateEmbedding } from '../embeddings';
import { retrieveRelevantMemory } from '../memory';
import { makeEmbedderFromEnv } from '../memory/embed-fact';
import {
  hasMemoryFactsBackfillMarker,
  readMemorySnapshotFromFacts,
  type MemorySnapshot,
} from '../memory/memory-facts';
import { getRelevantMemories } from '../memory/relevance';
import {
  computeDaysSinceLastReview,
  getTeachingPreference,
} from '../retention-data';
import { shouldTriggerEvaluate } from '../evaluate';
import { shouldTriggerTeachBack } from '../teach-back';
import { getRetentionStatus, type RetentionState } from '../retention';
import type {
  EscalationRung,
  LlmProviderPolicy,
  PreferredLlmProvider,
} from '../llm';
import { parseConversationLanguage } from '../llm';
import type { LLMTier } from '../subscription';
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
  persistSessionMetadata,
  SessionExchangeLimitError,
} from './session-crud';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import { safeSend, safeWrite } from '../safe-non-core';
import {
  buildResumeContext,
  loadPriorSessionMeta,
} from './session-context-builders';
import { projectAiResponseContent } from '../llm/project-response';
import { isSubstantiveCalibrationAnswer } from './review-calibration';
import {
  recordPracticeActivityEvent,
  type RecordPracticeActivityEventInput,
} from '../practice-activity-events';
import {
  findOwnedCurriculumTopic,
  findOwnedCurriculumTopics,
} from '../curriculum-topic-ownership';
import {
  CONCEPT_CAPTURE_ENABLED,
  captureConceptMastery,
} from '../concept-capture';
import { MAX_CHALLENGE_QUESTIONS } from '../challenge-round/caps';
import {
  decideMasteryAndReview,
  summarizeEvaluation,
  validateEvaluationEventIds,
  type MasteryDecision,
} from '../challenge-round/evaluation';
import { validateNoteDraft } from '../challenge-round/note-draft';
import { transitionChallengeState } from '../challenge-round/state';
import { evaluateChallengeReadiness } from '../challenge-round/trigger';

// [WI-571 WP-W1-spine] Spine slice carved to session-exchange-spine.ts
import { resolveReadyToFinish } from './session-exchange-spine';
export { resolveReadyToFinish } from './session-exchange-spine';

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

// [WI-571 WP-W1-spine] Routing slice carved to session-exchange-router.ts
import {
  resolveExchangeLlmRouting,
  resolveChallengeRoundLlmRoutingRung,
} from './session-exchange-router';
export type { ExchangeLlmRouting } from './session-exchange-router';
export {
  resolveExchangeLlmRouting,
  resolveChallengeRoundLlmRoutingRung,
} from './session-exchange-router';

async function recordSessionPracticeActivityEvent(
  db: Database,
  input: RecordPracticeActivityEventInput,
): Promise<void> {
  try {
    await recordPracticeActivityEvent(db, input);
  } catch (err) {
    captureException(err, {
      profileId: input.profileId,
      extra: {
        surface: 'session-exchange.practice-activity-event',
        activityType: input.activityType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    });
  }
}

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
  currentRung: number,
): number {
  let streak = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) break;
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
  /** True when the LLM did not return a valid response envelope. */
  envelopeParseFailed?: boolean;
  /** Parser failure reason when envelopeParseFailed is true. */
  envelopeParseFailureReason?: string;
  /** Private source provenance audit; not rendered to the learner. */
  sourceAudit?: ExchangeSourceAudit;
  /** B.3 monitoring: consecutive correct-answer streak at the current escalation rung */
  correctStreak?: number;
  /** Fluency-drill score correct count, when the envelope's ui_hints.fluency_drill.score was set. */
  drillCorrect?: number;
  /** Fluency-drill score total count, when the envelope's ui_hints.fluency_drill.score was set. */
  drillTotal?: number;
  /** LLM routing tier used for this exchange. */
  llmTier?: LLMTier;
  /** Preferred provider requested for this exchange, when an experiment overrides default routing. */
  preferredLlmProvider?: PreferredLlmProvider;
  /** Provider policy used to enforce plan boundaries, e.g. Gemini-only Family turns. */
  llmProviderPolicy?: LlmProviderPolicy;
  /** Reason code for any non-default routing choice. */
  llmRoutingReason?: string;
  /** Effective rung sent to the LLM router; may differ from escalationRung for Challenge Round. */
  llmRoutingRung?: EscalationRung;
  /** Provider that produced the response, or the initial streaming provider. */
  llmProvider?: string;
  /** Model that produced the response, or the initial streaming model. */
  llmModel?: string;
  /** True when streaming fell back from the initial provider before first byte. */
  llmFallbackUsed?: boolean;
  /**
   * Bug #348: EVALUATE assessment signal (snake_case wire shape) emitted by the
   * LLM in `envelope.signals.evaluate_assessment`. Persisted under
   * `aiMetadata.signals.evaluate_assessment` so `parseEvaluateAssessment`
   * (services/evaluate.ts) can read it back from `session_events.metadata`.
   */
  evaluateAssessment?: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['evaluate_assessment']
  >;
  /**
   * Bug #348: TEACH_BACK assessment signal (snake_case wire shape) emitted by
   * the LLM in `envelope.signals.teach_back_assessment`. Persisted under
   * `aiMetadata.signals.teach_back_assessment` so `parseTeachBackAssessment`
   * (services/teach-back.ts) can read it back from `session_events.metadata`.
   */
  teachBackAssessment?: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['teach_back_assessment']
  >;
  /** Challenge Round state after server-side runtime transitions on this turn. */
  challengeRound?: ChallengeRoundSessionState;
  /** Challenge Round outcome counts persisted on the AI response metadata. */
  challengeRoundVerdict?: ChallengeRoundVerdict;
  /** Learner-reviewed note draft payload surfaced by the runtime guard. */
  draftedNote?: DraftedChallengeNote;
}

export interface ChallengeRoundVerdict {
  solidCount: number;
  partialCount: number;
  missingCount: number;
  misconceptionCount: number;
}

export interface DraftedChallengeNote {
  id: string;
  body: string | null;
  sourceAnswerEventIds: string[];
  fallbackPrompt?: string;
}

interface ChallengeRoundRuntimeStateResult {
  challengeRound: ChallengeRoundSessionState | undefined;
  shouldPersist: boolean;
}

interface ChallengeRoundRuntimeSignalInput {
  runtimeEnabled: boolean;
  challengeRound: ChallengeRoundSessionState | undefined;
  topicId: string | null | undefined;
  challengeEligible: boolean;
  challengeRoundOffer: boolean | undefined;
  challengeRoundEvaluation: ChallengeRoundEvaluationItem[];
}

interface ChallengeRoundRuntimeOutcome {
  challengeRound?: ChallengeRoundSessionState;
  challengeOffer?: { pitch: string };
  draftedNote?: DraftedChallengeNote;
  challengeRoundVerdict?: ChallengeRoundVerdict;
}

interface CurrentUserMessageReference {
  id: string;
  content: string;
}

export function resolveChallengeRoundRuntimeStartState(input: {
  runtimeEnabled: boolean;
  challengeRound: ChallengeRoundSessionState | undefined;
}): ChallengeRoundRuntimeStateResult {
  if (!input.runtimeEnabled || input.challengeRound?.state !== 'accepted') {
    return {
      challengeRound: input.challengeRound,
      shouldPersist: false,
    };
  }

  return {
    challengeRound: transitionChallengeState(input.challengeRound, {
      type: 'start',
      totalQuestions: MAX_CHALLENGE_QUESTIONS,
    }),
    shouldPersist: true,
  };
}

export function resolveChallengeRoundRuntimeSignalState(
  input: ChallengeRoundRuntimeSignalInput,
): ChallengeRoundRuntimeStateResult {
  if (!input.runtimeEnabled) {
    return {
      challengeRound: input.challengeRound,
      shouldPersist: false,
    };
  }

  if (
    input.challengeRoundOffer === true &&
    input.challengeEligible &&
    input.topicId &&
    (!input.challengeRound ||
      input.challengeRound.state === 'complete' ||
      input.challengeRound.state === 'aborted')
  ) {
    return {
      challengeRound: transitionChallengeState(input.challengeRound, {
        type: 'offer',
        topicId: input.topicId,
      }),
      shouldPersist: true,
    };
  }

  if (
    input.challengeRound?.state === 'active' &&
    input.challengeRoundEvaluation.length > 0
  ) {
    return {
      challengeRound: transitionChallengeState(input.challengeRound, {
        type: 'answer_complete',
        evaluation: input.challengeRoundEvaluation,
      }),
      shouldPersist: true,
    };
  }

  return {
    challengeRound: input.challengeRound,
    shouldPersist: false,
  };
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
  nextMetadata: Record<string, unknown>,
): Promise<void> {
  await db
    .update(learningSessions)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    );
}

async function applyContinuationScore(
  db: Database,
  profileId: string,
  sessionId: string,
  retrievalScore?: number,
): Promise<void> {
  if (typeof retrievalScore !== 'number') return;
  // [CR-2026-05-19-M3]: Wrap SELECT + UPDATE in a transaction with FOR UPDATE
  // so concurrent exchanges cannot clobber each other's continuationDepth write.
  // The previously-passed `session.metadata` snapshot was captured at request
  // start, before `updateSessionMetadata` set `continuationOpenerActive: true`,
  // so spreading that snapshot here clobbered the freshly-written flag.
  await db.transaction(async (tx) => {
    const [fresh] = await tx
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
    if (!fresh) return; // session not found — skip silently
    const nextMetadata = {
      ...((fresh.metadata as Record<string, unknown> | null) ?? {}),
    };
    delete nextMetadata['continuationOpenerActive'];
    delete nextMetadata['continuationOpenerStartedExchange'];
    nextMetadata['continuationDepth'] =
      mapRetrievalScoreToDepth(retrievalScore);
    await tx
      .update(learningSessions)
      .set({ metadata: nextMetadata, updatedAt: new Date() })
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      );
  });
}

// Exported for unit testing (WI-650 NotFoundError regression); not part of
// the session barrel's public surface.
export async function persistChallengeRoundState(
  db: Database,
  profileId: string,
  sessionId: string,
  challengeRound: ChallengeRoundSessionState | undefined,
): Promise<void> {
  const updated = await persistSessionMetadata(db, profileId, sessionId, {
    challengeRound,
  });
  if (!updated) {
    throw new NotFoundError('Session');
  }
}

function verdictFromEvaluations(
  evaluations: ChallengeRoundEvaluationItem[],
): ChallengeRoundVerdict {
  const summary = summarizeEvaluation(evaluations);
  return {
    solidCount: summary.solid,
    partialCount: summary.partial,
    missingCount: summary.missing,
    misconceptionCount: summary.misconception,
  };
}

function buildFallbackDraft(
  decision: MasteryDecision,
): DraftedChallengeNote | undefined {
  if (decision.solidAnswerQuotes.length === 0) {
    return undefined;
  }

  return {
    id: generateUUIDv7(),
    body: null,
    sourceAnswerEventIds: [],
    fallbackPrompt:
      'Write a short note in your own words from the parts you can explain clearly.',
  };
}

/**
 * [BUG-483] Re-fetch DB-verified event content for every SOLID concept's
 * answer, so the note-draft hallucination guard always compares the LLM draft
 * against real learner text read from `session_events` — never against text the
 * request supplied for itself.
 *
 * Why this is needed: `decision.solidAnswerQuotes` is NOT uniformly
 * DB-verified. For PERSISTED answers it is (quotes are DB-substituted in
 * `validateEvaluationEventIds`), but for the answer the learner gives on the
 * FINAL challenge turn, `validateChallengeRoundEvaluationItems` substitutes the
 * route-supplied `currentUserMessage.content` (= `input.message`) — the request
 * vouching for itself. Passing those quotes as `verifiedEventContents` (the old
 * call site) made the guard a no-op for the current-turn concept, violating the
 * documented "always DB-verified" invariant on `validateNoteDraft`.
 *
 * `validateEvaluationEventIds` re-reads each `answerEventId` from
 * `session_events` (scoped to `profileId`) and replaces `learnerQuote` with the
 * real `content`. It throws if ANY id is unresolved — which is exactly the
 * same-turn case where the current-turn answer has not been persisted yet
 * (`persistExchangeResult` runs AFTER `applyChallengeRoundRuntimeSignals`). In
 * that case we return `null` so the caller fails closed to the learner-writes
 * fallback draft, rather than accepting an LLM draft validated against
 * route-trusted text.
 */
async function fetchVerifiedSolidContents(
  db: Database,
  profileId: string,
  sessionId: string,
  evaluations: ChallengeRoundEvaluationItem[],
): Promise<string[] | null> {
  const solidItems = evaluations.filter((item) => item.result === 'solid');
  if (solidItems.length === 0) return [];
  try {
    const verified = await validateEvaluationEventIds(
      db,
      profileId,
      sessionId,
      solidItems,
    );
    return verified.map((item) => item.learnerQuote);
  } catch {
    // A solid answer's event is not (yet) readable from the DB — most commonly
    // the current-turn answer on a same-turn finalize. Cannot honour the
    // "always DB-verified" invariant for the draft, so signal fail-closed.
    return null;
  }
}

function buildValidatedDraft(
  noteDraft: ChallengeRoundNoteDraftHint | null | undefined,
  decision: MasteryDecision,
  evaluations: ChallengeRoundEvaluationItem[],
  verifiedSolidContents: string[] | null,
): DraftedChallengeNote | undefined {
  const solidEventIds = new Set(
    evaluations
      .filter((item) => item.result === 'solid')
      .map((item) => item.answerEventId),
  );
  const solidAnswerEventIds = Array.from(solidEventIds);
  if (!noteDraft) {
    return solidAnswerEventIds.length > 0
      ? {
          id: generateUUIDv7(),
          body: null,
          sourceAnswerEventIds: solidAnswerEventIds,
          fallbackPrompt:
            'Write a short note in your own words from the parts you can explain clearly.',
        }
      : buildFallbackDraft(decision);
  }

  const draftSourceIds = noteDraft.source_answer_event_ids.filter((id) =>
    solidEventIds.has(id),
  );
  const allSourcesAreSolid =
    draftSourceIds.length === noteDraft.source_answer_event_ids.length &&
    draftSourceIds.length > 0;
  // [BUG-483] When DB-verified content is unavailable for a solid concept
  // (verifiedSolidContents === null), do NOT validate against the route-trusted
  // `solidAnswerQuotes` — that is the invariant gap. Fail closed to the
  // learner-writes fallback by treating validation as failed.
  const validation =
    verifiedSolidContents === null
      ? { ok: false as const }
      : validateNoteDraft(
          noteDraft.content,
          decision.solidAnswerQuotes,
          verifiedSolidContents,
        );

  if (!allSourcesAreSolid || !validation.ok) {
    return {
      id: generateUUIDv7(),
      body: null,
      sourceAnswerEventIds: solidAnswerEventIds,
      fallbackPrompt:
        'Write a short note in your own words from the parts you can explain clearly.',
    };
  }

  return {
    id: generateUUIDv7(),
    body: noteDraft.content,
    sourceAnswerEventIds: draftSourceIds,
  };
}

async function persistChallengeRoundMasteryEvidence(
  db: Database,
  profileId: string,
  session: LearningSession,
  topicId: string,
  now: Date,
): Promise<void> {
  if (!session.subjectId) {
    throw new Error('Challenge Round mastery requires a subject-bound session');
  }
  const ownedTopic = await findOwnedCurriculumTopic(db, {
    profileId,
    topicId,
    subjectId: session.subjectId,
  });
  if (!ownedTopic) {
    throw new Error('Challenge Round topic is not owned by this profile');
  }

  await db.insert(assessments).values({
    profileId,
    subjectId: session.subjectId,
    topicId,
    sessionId: session.id,
    verificationDepth: 'transfer',
    status: 'passed',
    masteryScore: 1,
    qualityRating: 5,
    exchangeHistory: [],
    masteryChallengeVerifiedAt: now,
  });
}

async function persistChallengeRoundReviewTargets(
  db: Database,
  profileId: string,
  session: LearningSession,
  topicId: string,
  decision: MasteryDecision,
  now: Date,
): Promise<void> {
  if (!session.subjectId || decision.reviewTargets.length === 0) return;
  const ownedTopic = await findOwnedCurriculumTopic(db, {
    profileId,
    topicId,
    subjectId: session.subjectId,
  });
  if (!ownedTopic) {
    throw new Error('Challenge Round review target topic is not owned');
  }

  const pendingExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const subjectId = session.subjectId;
  const targetsByConcept = new Map(
    decision.reviewTargets.map((target) => [target.concept, target]),
  );

  // [WI-1060] Read existing rows + the per-target update/insert loop run in one
  // transaction. Each review target is a separate update-or-insert; a crash
  // mid-loop would persist some weak concepts as deepening targets and drop
  // others, leaving the learner with an inconsistent review set for a single
  // Challenge Round. Atomic: all review targets land together or none do, and
  // the existing-rows read shares the loop's snapshot.
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const repo = createScopedRepository(txDb, profileId);
    const existingRows = await repo.needsDeepeningTopics.findMany(
      and(
        eq(needsDeepeningTopics.subjectId, subjectId),
        eq(needsDeepeningTopics.topicId, topicId),
        eq(needsDeepeningTopics.source, 'challenge_round'),
        inArray(needsDeepeningTopics.status, ['active', 'pending_review']),
      ),
    );

    const existingByConcept = new Map<string, (typeof existingRows)[number]>();
    for (const row of existingRows.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    )) {
      const concept = row.concept;
      if (concept && !existingByConcept.has(concept)) {
        existingByConcept.set(concept, row);
      }
    }

    for (const target of targetsByConcept.values()) {
      const existing = existingByConcept.get(target.concept);
      if (existing) {
        await txDb
          .update(needsDeepeningTopics)
          .set({
            misconception: target.misconception,
            correction: target.correction,
            ...(existing.status === 'pending_review'
              ? { pendingExpiresAt }
              : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(needsDeepeningTopics.id, existing.id),
              eq(needsDeepeningTopics.profileId, profileId),
              eq(needsDeepeningTopics.topicId, topicId),
            ),
          );
        continue;
      }

      await txDb.insert(needsDeepeningTopics).values({
        profileId,
        subjectId,
        topicId,
        status: 'pending_review',
        source: 'challenge_round',
        concept: target.concept,
        misconception: target.misconception,
        correction: target.correction,
        pendingExpiresAt,
        updatedAt: now,
      });
    }
  });
}

/**
 * Atomically claim Challenge Round finalization for a session.
 *
 * `finalizeChallengeRoundIfReady` writes terminal mastery state
 * (`assessments.mastery_challenge_verified_at`) and `needs_deepening_topics`
 * rows. It can be entered concurrently (two in-flight exchanges, or a request +
 * a retry) carrying the SAME pre-finalize `drafting` `ExchangeContext`. Gating
 * only on that in-memory state lets both invocations pass and double-write.
 *
 * This claim is the single-flight gate. It re-reads the PERSISTED session
 * metadata under a `FOR UPDATE` row lock (the same lock primitive
 * `persistSessionMetadata` uses) and atomically transitions the persisted
 * challengeRound `drafting → complete`. Concurrent callers serialize on the
 * row lock: exactly one observes `drafting` and wins; any other observes the
 * already-`complete` state and loses. Only the winner proceeds to the terminal
 * writes, so mastery is written once and deepening rows are inserted once.
 *
 * Returns the persisted (authoritative) challengeRound state for the winner, or
 * `null` for a loser / non-drafting / missing session.
 */
async function claimChallengeRoundFinalization(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<ChallengeRoundSessionState | null> {
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

    const metadata = {
      ...((current.metadata as Record<string, unknown> | null) ?? {}),
    };
    const parsed = challengeRoundSessionStateSchema.safeParse(
      metadata['challengeRound'],
    );
    // Only the invocation that observes a persisted `drafting` state under the
    // lock may finalize. A `complete`/other state means another invocation
    // already claimed (or the round was never drafting) — bail as a no-op.
    if (!parsed.success || parsed.data.state !== 'drafting') {
      return null;
    }

    const persisted = parsed.data;
    const complete = transitionChallengeState(
      transitionChallengeState(persisted, { type: 'draft_ready' }),
      { type: 'complete' },
    );
    metadata['challengeRound'] = complete;

    const [row] = await tx
      .update(learningSessions)
      .set({ metadata, updatedAt: new Date() })
      .where(
        and(
          eq(learningSessions.id, sessionId),
          eq(learningSessions.profileId, profileId),
        ),
      )
      .returning({ id: learningSessions.id });

    // Lost a race that deleted the session between SELECT and UPDATE.
    if (!row) return null;

    return persisted;
  });
}

/**
 * Release a Challenge Round finalization claim by restoring the persisted
 * session state to `drafting`.
 *
 * `claimChallengeRoundFinalization` commits `drafting → complete` inside its
 * transaction, but the terminal mastery / deepening writes run AFTER it, in a
 * separate transaction. If those writes throw (transient DB error, constraint
 * violation), the session would be stuck `complete` with NO mastery row and NO
 * deepening rows, and no retry path — the learner silently loses mastery
 * credit. This is the release leg (mirroring `releaseBookGenerationClaimIfEmpty`
 * for the book-generation claim): it writes the original pre-claim `drafting`
 * state back through the same `FOR UPDATE` metadata mechanism the claim used, so
 * the round is re-finalizeable on the next exchange / retry.
 *
 * `claimed` is the authoritative pre-transition `drafting` state returned by the
 * winning claim, so restoring it reinstates the exact state the claim consumed.
 */
async function releaseChallengeRoundClaim(
  db: Database,
  profileId: string,
  sessionId: string,
  claimed: ChallengeRoundSessionState,
): Promise<void> {
  await persistChallengeRoundState(db, profileId, sessionId, claimed);
}

export async function finalizeChallengeRoundIfReady(
  db: Database,
  profileId: string,
  session: LearningSession,
  challengeRound: ChallengeRoundSessionState | undefined,
  noteDraft: ChallengeRoundNoteDraftHint | null | undefined,
): Promise<ChallengeRoundRuntimeOutcome | null> {
  if (challengeRound?.state !== 'drafting') return null;
  const topicId = challengeRound.topicId ?? session.topicId;
  if (!topicId) return null;

  // Single-flight claim against the PERSISTED session state. Only the winning
  // invocation proceeds to the terminal mastery / deepening writes; concurrent
  // calls / retries observe the already-`complete` state and no-op here.
  const claimed = await claimChallengeRoundFinalization(
    db,
    profileId,
    session.id,
  );
  if (!claimed) return null;

  // Use the persisted evaluations as the authoritative copy (they match the
  // state we just transitioned to `complete`).
  const evaluations = claimed.evaluations;
  const decision = decideMasteryAndReview(evaluations);
  const now = new Date();

  // The terminal mastery / deepening writes run OUTSIDE the claim transaction.
  // If either throws, the persisted state is already `complete` — without a
  // compensating release the round can never re-finalize and the learner
  // silently loses mastery credit. Release the claim back to `drafting` so the
  // next exchange / retry re-runs, and escalate (silent recovery is banned in
  // state-machine flows) before re-throwing so the caller's exchange does not
  // falsely report mastery success.
  try {
    if (decision.markMasteryVerified) {
      await persistChallengeRoundMasteryEvidence(
        db,
        profileId,
        session,
        topicId,
        now,
      );
    } else {
      await persistChallengeRoundReviewTargets(
        db,
        profileId,
        session,
        topicId,
        decision,
        now,
      );
    }
  } catch (err) {
    // Release leg: restore the pre-claim `drafting` state so the round is
    // re-finalizeable. A release failure must not mask the original error —
    // capture it separately but still propagate the primary failure.
    try {
      await releaseChallengeRoundClaim(db, profileId, session.id, claimed);
    } catch (releaseErr) {
      captureException(releaseErr, {
        profileId,
        extra: {
          surface: 'challenge-round.finalize.release-failed',
          sessionId: session.id,
          topicId,
        },
      });
    }

    captureException(err, {
      profileId,
      extra: {
        surface: 'challenge-round.finalize.terminal-write-failed',
        sessionId: session.id,
        topicId,
        markMasteryVerified: decision.markMasteryVerified,
      },
    });
    await safeSend(
      () =>
        inngest.send({
          name: 'app/challenge-round.finalize.failed',
          data: {
            profileId,
            sessionId: session.id,
            topicId,
            markMasteryVerified: decision.markMasteryVerified,
            error: err instanceof Error ? err.message : String(err),
          },
        }),
      'challenge-round.finalize.failed',
      { profileId, sessionId: session.id, topicId },
    );
    // Re-throw: the exchange must not report mastery success on a partial write.
    throw err;
  }

  // Concept-capture is parked until the baseline reset applies the
  // `concepts`/`concept_mastery` tables (see CONCEPT_CAPTURE_ENABLED). Gating
  // here keeps the function + its integration tests intact while stopping the
  // live `relation does not exist` Sentry noise on staging/prod.
  if (CONCEPT_CAPTURE_ENABLED && session.subjectId) {
    await safeWrite(
      () =>
        captureConceptMastery(
          db,
          profileId,
          session,
          topicId,
          evaluations,
          now,
        ),
      'challenge-round.concept-capture',
      { profileId, sessionId: session.id, topicId },
    );
  }

  // [BUG-483] Source the note-draft hallucination guard from DB-verified event
  // text for every solid concept — including the current-turn answer — so the
  // guard never compares the draft against text the request supplied for
  // itself. `null` means a solid answer's event is not readable from the DB
  // yet (same-turn finalize); buildValidatedDraft then fails closed to the
  // learner-writes fallback rather than trusting route-supplied quotes.
  const verifiedSolidContents = await fetchVerifiedSolidContents(
    db,
    profileId,
    session.id,
    evaluations,
  );
  const draftedNote = buildValidatedDraft(
    noteDraft,
    decision,
    evaluations,
    verifiedSolidContents,
  );
  // The terminal `complete` state was already persisted by the claim above
  // (single source of truth). Recompute the same value for the return payload.
  const complete = transitionChallengeState(
    transitionChallengeState(claimed, { type: 'draft_ready' }),
    { type: 'complete' },
  );

  return {
    challengeRound: complete,
    challengeRoundVerdict: verdictFromEvaluations(evaluations),
    ...(draftedNote ? { draftedNote } : {}),
  };
}

async function validateChallengeRoundEvaluationItems(
  db: Database,
  profileId: string,
  sessionId: string,
  evaluations: ChallengeRoundEvaluationItem[],
  currentUserMessage?: CurrentUserMessageReference,
): Promise<ChallengeRoundEvaluationItem[]> {
  if (!currentUserMessage) {
    return validateEvaluationEventIds(db, profileId, sessionId, evaluations);
  }

  const persistedEvaluations = evaluations.filter(
    (item) => item.answerEventId !== currentUserMessage.id,
  );
  const validatedPersisted =
    persistedEvaluations.length > 0
      ? await validateEvaluationEventIds(
          db,
          profileId,
          sessionId,
          persistedEvaluations,
        )
      : [];
  let persistedIndex = 0;

  return evaluations.map((item) => {
    if (item.answerEventId === currentUserMessage.id) {
      return {
        ...item,
        learnerQuote: currentUserMessage.content,
      };
    }

    const validated = validatedPersisted[persistedIndex];
    persistedIndex += 1;
    if (!validated) {
      throw new Error(
        `Challenge Round evaluation validation lost item for answerEventId ${item.answerEventId}`,
      );
    }
    return validated;
  });
}

async function applyChallengeRoundRuntimeSignals(
  db: Database,
  profileId: string,
  session: LearningSession,
  context: ExchangeContext,
  payload: {
    response: string;
    challengeRoundOffer?: boolean;
    challengeRoundEvaluation?: ChallengeRoundEvaluationItem[];
    noteDraft?: ChallengeRoundNoteDraftHint | null;
    currentUserMessage?: CurrentUserMessageReference;
  },
): Promise<ChallengeRoundRuntimeOutcome> {
  if (context.challengeRuntimeEnabled !== true) return {};
  if (!session.topicId) return {};

  const current = context.challengeRound;
  if (current?.state === 'drafting') {
    return (
      (await finalizeChallengeRoundIfReady(
        db,
        profileId,
        session,
        current,
        payload.noteDraft,
      )) ?? {}
    );
  }

  if (current?.state === 'active' && payload.challengeRoundEvaluation?.length) {
    let validatedEvaluation: ChallengeRoundEvaluationItem[];
    try {
      validatedEvaluation = await validateChallengeRoundEvaluationItems(
        db,
        profileId,
        session.id,
        payload.challengeRoundEvaluation,
        payload.currentUserMessage,
      );
    } catch (err) {
      logger.warn('[session-exchange] Challenge Round evaluation rejected', {
        event: 'challenge_round.evaluation_rejected',
        profileId,
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        profileId,
        extra: {
          surface: 'session-exchange.challenge-round.evaluation',
          sessionId: session.id,
        },
      });
      return { challengeRound: current };
    }

    const result = resolveChallengeRoundRuntimeSignalState({
      runtimeEnabled: true,
      challengeRound: current,
      topicId: session.topicId,
      challengeEligible: context.challengeEligible === true,
      challengeRoundOffer: false,
      challengeRoundEvaluation: validatedEvaluation,
    });

    if (!result.shouldPersist) return { challengeRound: current };
    const finalized = await finalizeChallengeRoundIfReady(
      db,
      profileId,
      session,
      result.challengeRound,
      payload.noteDraft,
    );
    if (finalized) return finalized;

    await persistChallengeRoundState(
      db,
      profileId,
      session.id,
      result.challengeRound,
    );
    return {
      ...(result.challengeRound
        ? { challengeRound: result.challengeRound }
        : {}),
    };
  }

  const result = resolveChallengeRoundRuntimeSignalState({
    runtimeEnabled: true,
    challengeRound: current,
    topicId: session.topicId,
    challengeEligible: context.challengeEligible === true,
    challengeRoundOffer: payload.challengeRoundOffer,
    challengeRoundEvaluation: [],
  });

  if (!result.shouldPersist) {
    return current ? { challengeRound: current } : {};
  }

  await persistChallengeRoundState(
    db,
    profileId,
    session.id,
    result.challengeRound,
  );

  return {
    ...(result.challengeRound ? { challengeRound: result.challengeRound } : {}),
    ...(result.challengeRound?.state === 'offered'
      ? { challengeOffer: { pitch: payload.response } }
      : {}),
  };
}

const MAX_REVIEW_CALIBRATION_ATTEMPTS = 2;

// PII egress: Carries an opaque reference (`learnerMessageEventId`, the
// session_events row id of the learner's calibration answer) instead of the
// raw answer / topic title — Inngest persists event payloads in its
// third-party event store. The consumer (review-calibration-grade) rehydrates
// both the message content and the topic title from the DB, scoped by
// profileId. Aliased to the schema-inferred type so the payload cannot drift
// from `reviewCalibrationRequestedEventSchema` (@eduagent/schemas). [WI-620]
type ReviewCalibrationDispatchPayload = ReviewCalibrationRequestedEvent;

// PII egress: Carries an opaque reference (`learnerMessageEventId`)
// instead of the learner's raw probe answer / topic title — Inngest persists
// event payloads in its third-party event store. The consumer
// (topic-probe-extract) rehydrates both from the DB, scoped by profileId.
// Aliased to the schema-inferred type so the payload cannot drift from
// `topicProbeRequestedEventSchema` (@eduagent/schemas).
type TopicProbeDispatchPayload = TopicProbeRequestedEvent;

// Exported for the WI-620 PII-egress break test, which asserts the dispatched
// `app/review.calibration.requested` payload carries no raw learner text /
// topic title — only the opaque `learnerMessageEventId`.
export async function maybeDispatchReviewCalibration(
  db: Database,
  profileId: string,
  session: {
    id: string;
    topicId: string | null;
  },
  effectiveMode: string | undefined,
  conversationLanguage: ConversationLanguage | undefined,
  // learnerMessageText / topicTitle gate the dispatch locally and are NOT
  // placed in the event payload (third-party event store) — the payload
  // carries the opaque `learnerMessageEventId` instead. [WI-620]
  learnerMessageText: string,
  topicTitle: string | undefined,
  learnerMessageEventId: string | undefined,
): Promise<void> {
  if (effectiveMode !== 'review' && effectiveMode !== 'practice') return;
  const topicId = session.topicId;
  if (!topicId || !topicTitle) return;
  // PII egress: Without a persisted user_message row id there is no PII-safe
  // way to reference the learner's answer — skip the dispatch. [WI-620]
  if (!learnerMessageEventId) return;

  const isSubstantive = isSubstantiveCalibrationAnswer(
    learnerMessageText,
    conversationLanguage,
  );

  const payload = await db.transaction<ReviewCalibrationDispatchPayload | null>(
    async (tx) => {
      const [row] = await tx
        .select({ metadata: learningSessions.metadata })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, session.id),
            eq(learningSessions.profileId, profileId),
          ),
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
              eq(learningSessions.profileId, profileId),
            ),
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
            eq(learningSessions.profileId, profileId),
          ),
        );

      return {
        profileId,
        sessionId: session.id,
        topicId,
        learnerMessageEventId,
        timestamp,
      };
    },
  );

  if (!payload) return;

  await safeSend(
    () =>
      inngest.send({
        name: 'app/review.calibration.requested',
        data: payload,
      }),
    'review.calibration',
    {
      profileId,
      sessionId: session.id,
      topicId: session.topicId,
    },
  );
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
  // learnerMessageText / topicTitle gate the dispatch locally and are NOT
  // placed in the event payload (third-party event store).
  learnerMessageText: string,
  topicTitle: string | undefined,
  isFirstEncounter: boolean,
  learnerMessageEventId: string | undefined,
): Promise<void> {
  if (effectiveMode !== 'learning') return;
  if (!isFirstEncounter) return;
  const topicId = session.topicId;
  if (!topicId || !topicTitle) return;
  // PII egress: Without a persisted user_message row id there is no
  // PII-safe way to reference the learner's answer — skip the probe.
  if (!learnerMessageEventId) return;
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
            eq(learningSessions.profileId, profileId),
          ),
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
            eq(learningSessions.profileId, profileId),
          ),
        );

      return {
        version: 1,
        profileId,
        sessionId: session.id,
        subjectId: session.subjectId,
        topicId,
        learnerMessageEventId,
        timestamp,
      };
    },
  );

  if (!payload) return;

  try {
    // core-send: compensation pattern — on dispatch failure the catch
    // block below rolls back the topicProbeFiredAt marker so a future
    // exchange can re-attempt. safeSend would swallow the error and leave
    // the marker set, permanently disabling topic-probe extraction for
    // this session. [BUG-104 / BUG-230]
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
            eq(learningSessions.profileId, profileId),
          ),
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
            eq(learningSessions.profileId, profileId),
          ),
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
  sessionId: string,
): Promise<void> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.sessions.findFirst(eq(learningSessions.id, sessionId));
  if (!row) {
    throw new NotFoundError('Session');
  }
  if (row.status === 'completed' || row.status === 'auto_closed') {
    throw new ConflictError('Session is closed and cannot accept exchanges');
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
  rawInputMemory: string,
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
  // Persisted session_event metadata (jsonb). Typed `unknown` to match the DB
  // row shape; narrowed safely in isReplayableSystemPrompt.
  metadata?: unknown;
}

/**
 * WI-240 (DS-151): a `system_prompt` event is replayed as a trusted
 * `role:'system'` LLM message ONLY when it is server-authored
 * (`metadata.source === 'server'`) or a legacy untagged row (no `source` —
 * historically benign static strings, kept per the keep-legacy decision). A row
 * whose `source` is present but not `'server'` (a client-authored row that
 * should never exist post-fix) is dropped, never replayed as system.
 */
function isReplayableSystemPrompt(event: ExchangeHistoryEvent): boolean {
  const meta = event.metadata;
  const source =
    meta && typeof meta === 'object' && 'source' in meta
      ? (meta as { source?: unknown }).source
      : undefined;
  return source === undefined || source === 'server';
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
        (e.eventType === 'system_prompt' && isReplayableSystemPrompt(e)),
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
                private_sources: {
                  relied_on: ['conversation_history'],
                  insufficient: false,
                  reason:
                    'Rewrapped prior assistant turn for conversation continuity.',
                },
              });
            })()
          : e.content,
    }));
}

/**
 * WI-580 (F-076): a minor's real name must never be sent to a third-party
 * LLM provider. Only an unambiguously-adult owner's display name enters the
 * prompt context; every other profile — child on a parent account, under-18
 * owner, parent-proxy child, unknown birth year — gets no name. Fail-closed
 * on ownership AND age, including the birth-year boundary (PR #900 Codex P1):
 * `birthYear === currentYear - 18` may still be 17, so it is treated as
 * minor via `isUnambiguouslyAdult`. The prompt builder already omits the
 * learner-name section when the name is absent, and the ANTI-FABRICATION
 * block forbids the model from inventing one.
 */
export function resolvePromptLearnerName(profile: {
  isOwner?: boolean | null;
  birthYear?: number | null;
  displayName?: string | null;
}): string | undefined {
  if (profile.isOwner !== true) return undefined;
  if (profile.birthYear == null) return undefined;
  if (!isUnambiguouslyAdult(profile.birthYear)) return undefined;
  return profile.displayName ?? undefined;
}

export async function prepareExchangeContext(
  db: Database,
  profileId: string,
  sessionId: string,
  userMessage: string,
  options?: {
    voyageApiKey?: string;
    homeworkMode?: 'help_me' | 'check_answer';
    llmTier?: LLMTier;
    subscriptionTier?: SubscriptionTier;
    quotaRemainingTurns?: number;
    quotaFractionRemaining?: number;
    memoryFactsReadEnabled?: boolean;
    memoryFactsRelevanceEnabled?: boolean;
    semanticMemoryRetrievalEnabled?: boolean;
    challengeRoundRuntimeEnabled?: boolean;
    currentUserMessageEventId?: string;
    identityV2Enabled?: boolean;
  },
): Promise<ExchangePrep> {
  // 1. Load session
  const session = await getSession(db, profileId, sessionId);
  if (!session) {
    throw new NotFoundError('Session');
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
    session,
    options?.identityV2Enabled ?? false,
  );

  // 2. Load all supplementary data in parallel (all independent after session load)
  // CFLF-23: For freeform sessions with rawInput, also scan prior sessions
  // by the learner's original intent so the very first exchange has rich context.
  const isFreeformWithRawInput = isFreeform && !!session.rawInput;
  const semanticMemoryRetrievalEnabled =
    options?.semanticMemoryRetrievalEnabled !== false;
  const userMessageVectorPromise: Promise<number[] | undefined> =
    semanticMemoryRetrievalEnabled && options?.voyageApiKey
      ? generateEmbedding(userMessage, options.voyageApiKey)
          .then((embedding) => embedding.vector)
          .catch((err) => {
            logger.warn(
              '[session-exchange] userMessage embedding failed; memory falls back',
              {
                event: 'session_exchange.user_msg_embedding.failed',
                reason: err instanceof Error ? err.message : String(err),
              },
            );
            return undefined;
          })
      : Promise.resolve(undefined);

  // BUG-70: Supplementary data is static within a session (priorTopics,
  // teachingPref, learningModeRecord, learningProfile, crossSubjectHighlights).
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
    staticContext,
    options?.identityV2Enabled ?? false,
  );
  const ownedSessionTopic = session.topicId
    ? await findOwnedCurriculumTopic(db, {
        profileId,
        topicId: session.topicId,
        subjectId: session.subjectId,
      })
    : null;

  const [
    subject,
    profileRows,
    retentionRows,
    challengeCooldownRows,
    activeDeepeningRows,
    priorTopicSessionRows,
    events,
    memory,
    metadataRows,
    rawInputMemory,
    lastSessionSummaryRows,
    supp,
  ] = await Promise.all([
    Promise.resolve(staticContext.subject),
    Promise.resolve(staticContext.profile ? [staticContext.profile] : []),
    ownedSessionTopic
      ? db
          .select()
          .from(retentionCards)
          .where(
            and(
              eq(retentionCards.topicId, ownedSessionTopic.topicId),
              eq(retentionCards.profileId, profileId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    ownedSessionTopic
      ? db
          .select({
            lastOfferedAt: challengeRoundCooldowns.lastOfferedAt,
            lastOutcome: challengeRoundCooldowns.lastOutcome,
          })
          .from(challengeRoundCooldowns)
          .where(
            and(
              eq(challengeRoundCooldowns.profileId, profileId),
              eq(challengeRoundCooldowns.topicId, ownedSessionTopic.topicId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    ownedSessionTopic
      ? db
          .select({ id: needsDeepeningTopics.id })
          .from(needsDeepeningTopics)
          .where(
            and(
              eq(needsDeepeningTopics.profileId, profileId),
              eq(needsDeepeningTopics.topicId, ownedSessionTopic.topicId),
              eq(needsDeepeningTopics.status, 'active'),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    ownedSessionTopic
      ? db
          .select({ id: learningSessions.id })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.profileId, profileId),
              eq(learningSessions.topicId, ownedSessionTopic.topicId),
              ne(learningSessions.id, sessionId),
              gte(learningSessions.exchangeCount, 1),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    // [BUG-251] Defensive hard cap on the per-session event scan.
    // A natural session has at most MAX_EXCHANGES_PER_SESSION (50) exchange
    // pairs + a small number of ancillary events (drills, system marks).
    // Fetch the most-recent 400 in DESC order (>7x headroom) and re-sort
    // ascending in JS so downstream consumers (buildExchangeHistory,
    // computeCorrectStreak, partialProgress trailing-count) still see
    // chronological order. The DESC + reverse pattern is necessary because
    // a plain `limit` with ASC ordering would truncate the latest events
    // (exactly the opposite of what state-reconstruction needs).
    db.query.sessionEvents
      .findMany({
        where: and(
          eq(sessionEvents.sessionId, sessionId),
          eq(sessionEvents.profileId, profileId),
        ),
        // [BUG-913 sweep] Tie-break by id when created_at collides — see
        // session-crud.ts getSessionTranscript for the full rationale.
        orderBy: [desc(sessionEvents.createdAt), desc(sessionEvents.id)],
        limit: 400,
      })
      .then((rows) => rows.slice().reverse()),
    semanticMemoryRetrievalEnabled
      ? userMessageVectorPromise.then((userMessageVector) =>
          retrieveRelevantMemory(
            db,
            profileId,
            userMessage,
            options?.voyageApiKey,
            undefined,
            userMessageVector,
          ),
        )
      : Promise.resolve({ context: '', topicIds: [] }),
    // FR92: Load session metadata for interleaved topic list
    isInterleaved
      ? db
          .select({ metadata: learningSessions.metadata })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    // CFLF-23: Pre-session similarity scan — uses rawInput for freeform sessions
    // Graceful degradation: if Voyage API is down, returns empty (never breaks session)
    semanticMemoryRetrievalEnabled && isFreeformWithRawInput && session.rawInput
      ? retrieveRelevantMemory(
          db,
          profileId,
          session.rawInput,
          options?.voyageApiKey,
          5,
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
            eq(sessionSummaries.sessionId, learningSessions.id),
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
              gte(sessionSummaries.createdAt, freshnessCutoff),
            ),
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
  const crossSubjectHighlights = supp.crossSubjectHighlights;
  const learningProfile = supp.learningProfile;

  const topic = ownedSessionTopic;
  const [profile] = profileRows;
  const isFirstEncounter = Boolean(topic) && priorTopicSessionRows.length === 0;
  if (!profile) {
    // Auth middleware loads the profile before reaching this point, so a missing
    // row here means a referential-integrity break (deleted profile mid-request,
    // wrong profileId injected, etc.). Fail loud — silently degrading to a
    // synthetic birthYear silently routed the LLM to a child-tier voice.
    throw new Error(
      `[processExchange] Profile not found for profileId=${profileId} — aborting`,
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
      const ownedTopics = await findOwnedCurriculumTopics(db, {
        profileId,
        topicIds,
      });
      const ownedById = new Map(
        ownedTopics.map((owned) => [owned.topicId, owned]),
      );
      const resolvedTopics: NonNullable<ExchangeContext['interleavedTopics']> =
        [];
      for (const id of topicIds) {
        const owned = ownedById.get(id);
        const metaTopic = meta.interleavedTopics?.find((t) => t.topicId === id);
        if (
          !owned ||
          (metaTopic?.subjectId && metaTopic.subjectId !== owned.subjectId)
        ) {
          continue;
        }
        resolvedTopics.push({
          topicId: owned.topicId,
          title: owned.topicTitle,
          description: owned.topicDescription ?? undefined,
        });
      }
      interleavedTopics = resolvedTopics;
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
    // Fire-and-forget by design: this silent-classification observation must
    // not add Inngest round-trip latency to prepareExchangeContext (which is
    // on the synchronous /ask exchange hot path). safeSend internally routes
    // both dispatch failures and dispatch timeouts to Sentry; the `.catch`
    // here is the BUG-755 belt-and-braces guard against a future regression
    // in safeSend itself silently throwing past its own try/catch (e.g. a
    // synchronous bug in argument validation before the inner try block) —
    // without this, such a regression would surface as an unhandledRejection
    // instead of as a Sentry event.
    // PII egress: No raw learner text (`classifyInput`) in the event
    // payload — Inngest persists payloads in its third-party event store.
    // The consumer (ask-silent-classify) rehydrates the learner's persisted
    // user messages from session_events, scoped by profileId.
    safeSend(
      () =>
        inngest.send({
          name: 'app/ask.classify_silently',
          data: {
            sessionId,
            profileId,
            exchangeCount: session.exchangeCount + 1,
          },
        }),
      'ask.classify_silently',
      { sessionId, profileId },
    ).catch((err) => {
      captureException(err, {
        profileId,
        extra: {
          surface: 'session-exchange.ask.classify_silently.safe_send_failed',
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
                eq(subjects.status, 'active'),
              ),
            )
            .limit(1),
          getTeachingPreference(db, profileId, silentClassification.subjectId),
        ])
      : [[], null];
  const silentSubject = silentSubjectRows[0];
  const effectiveSubjectName = isFreeform
    ? (silentClassification?.subjectName ?? 'Unknown')
    : (subject?.name ?? 'Unknown');
  const effectivePedagogyMode: 'socratic' | 'four_strands' = likelyLanguage
    ? 'four_strands'
    : isFreeform
      ? ((silentSubject?.pedagogyMode as
          | 'socratic'
          | 'four_strands'
          | undefined) ?? 'socratic')
      : ((subject?.pedagogyMode as 'socratic' | 'four_strands' | undefined) ??
        'socratic');
  const effectiveLanguageCode = isFreeform
    ? (silentSubject?.languageCode ?? undefined)
    : (subject?.languageCode ?? undefined);
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
              eq(vocabulary.mastered, true),
            ),
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
    daysSinceLastReview =
      computeDaysSinceLastReview(retentionCard.lastReviewedAt) ?? undefined;
  }

  // 3c. Count questions at the current escalation rung + compute hint count
  const aiResponseEvents = events.filter((e) => e.eventType === 'ai_response');
  const questionsAtCurrentRung = aiResponseEvents.filter(
    (e) =>
      (e.metadata as Record<string, unknown> | null)?.escalationRung ===
      session.escalationRung,
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
    userMessage,
  );
  const effectiveRung = escalationDecision.shouldEscalate
    ? escalationDecision.newRung
    : currentRung;
  const parsedChallengeRound = challengeRoundSessionStateSchema.safeParse(
    sessionMeta['challengeRound'],
  );
  let challengeRound = parsedChallengeRound.success
    ? parsedChallengeRound.data
    : undefined;
  const challengeRoundRuntimeEnabled =
    options?.challengeRoundRuntimeEnabled === true;
  const challengeRoundStart = resolveChallengeRoundRuntimeStartState({
    runtimeEnabled: challengeRoundRuntimeEnabled,
    challengeRound,
  });
  if (challengeRoundStart.shouldPersist) {
    await persistChallengeRoundState(
      db,
      profileId,
      sessionId,
      challengeRoundStart.challengeRound,
    );
    challengeRound = challengeRoundStart.challengeRound;
  }
  const correctStreak = computeCorrectStreak(events, effectiveRung);
  const challengeCorrectStreak = computeCorrectStreak(events, currentRung);
  const challengeQuotaRemainingTurns = options?.quotaRemainingTurns;
  const challengeQuotaFractionRemaining = options?.quotaFractionRemaining;
  const hasChallengeQuotaInputs =
    typeof challengeQuotaRemainingTurns === 'number' &&
    typeof challengeQuotaFractionRemaining === 'number';
  const challengeReadiness =
    topic && hasChallengeQuotaInputs
      ? evaluateChallengeReadiness({
          sessionType: session.sessionType,
          exchangeCount: session.exchangeCount,
          retentionStatus: retentionStatusValue ?? 'new',
          struggleStatus:
            activeDeepeningRows.length > 0
              ? retentionCard && retentionCard.failureCount >= 3
                ? 'blocked'
                : 'needs_deepening'
              : 'normal',
          recentCorrectStreak: challengeCorrectStreak,
          currentSessionSolidAnswerCount: aiResponseEvents.filter(
            (event) =>
              (event.metadata as Record<string, unknown> | null)
                ?.correctAnswer === true,
          ).length,
          subscriptionTier: options?.subscriptionTier,
          quotaRemainingTurns: challengeQuotaRemainingTurns,
          quotaFractionRemaining: challengeQuotaFractionRemaining,
          challengeRoundState: challengeRound,
          cooldownLastOfferedAt:
            challengeCooldownRows[0]?.lastOfferedAt ?? null,
          cooldownLastOutcome: challengeCooldownRows[0]?.lastOutcome ?? null,
          now: new Date(),
        })
      : { eligible: false };
  const llmRoutingRung = resolveChallengeRoundLlmRoutingRung(
    effectiveRung,
    challengeRound,
  );
  const llmRouting = resolveExchangeLlmRouting({
    subscriptionTier: options?.subscriptionTier,
    requestedLlmTier: options?.llmTier,
    effectiveRung: llmRoutingRung,
  });

  // 5. Build prior learning context (FR40 — bridge FR)
  const priorLearning = buildPriorLearningContext(priorTopics);
  const crossSubjectContext =
    buildCrossSubjectContext(crossSubjectHighlights) || undefined;
  // WI-963: resolve book-history and homework-library contexts in parallel —
  // both are independent cache/DB calls and previously awaited sequentially.
  const learningHistoryParts = (
    await Promise.all([
      topic?.bookId && topic?.topicId
        ? getCachedBookLearningHistoryContext(
            db,
            profileId,
            sessionId,
            session,
            topic.topicId,
            topic.bookId,
            options?.identityV2Enabled ?? false,
          )
        : Promise.resolve(undefined),
      session.sessionType === 'homework'
        ? getCachedHomeworkLibraryContext(
            db,
            profileId,
            sessionId,
            session,
            options?.identityV2Enabled ?? false,
          )
        : Promise.resolve(undefined),
    ])
  ).filter((part): part is string => Boolean(part));
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
      : undefined,
  );
  const extractedSignals = extractedInterviewSignalsSchema.safeParse(
    sessionMetadata?.extractedSignals,
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
          gte(retentionCards.intervalDays, 21),
        ),
      );
    const strongTopicIds = strongCards.map((row) => row.topicId);
    if (strongTopicIds.length > 0) {
      const strongTopicRows = await findOwnedCurriculumTopics(db, {
        profileId,
        topicIds: strongTopicIds,
      });
      strongTopicTitles = strongTopicRows.map((row) => row.topicTitle);
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
          eq(subjects.status, 'active'),
        ),
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
      learningProfile,
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
                : []) as FocusAreaEntry[]),
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
          ? (silentClassification?.subjectName ?? null)
          : (subject?.name ?? null),
        topic?.topicTitle ?? null,
        {
          status: retentionStatusValue,
          strongTopics: strongTopicTitles,
        },
        Array.isArray(learningProfile.recentlyResolvedTopics)
          ? (learningProfile.recentlyResolvedTopics as Array<
              string | { topic: string; subject: string | null }
            >)
          : [],
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
        learningProfile.accommodationMode as string | null,
      ) || undefined
    : undefined;

  // 6. Build ExchangeContext
  // For interleaved sessions: use the topic list, clear single-topic fields
  const context: ExchangeContext = {
    sessionId,
    profileId,
    subjectName: effectiveSubjectName,
    topicTitle: interleavedTopics ? undefined : topic?.topicTitle,
    topicDescription: interleavedTopics
      ? undefined
      : (topic?.topicDescription ?? undefined),
    sessionType: session.sessionType,
    escalationRung: effectiveRung,
    exchangeHistory,
    birthYear: profile.birthYear,
    // BKT-C.1 — source the profile-level tutor language + pronouns here so
    // every downstream call path (processExchange, streamExchange) receives
    // the same personalization. Defaults: 'en' (DB NOT NULL) and null.
    // DB CHECK constraint guarantees this is a valid ConversationLanguage.
    // Drizzle infers `string`; parse to the union type for downstream safety.
    conversationLanguage: parseConversationLanguage(
      profile?.conversationLanguage,
    ),
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
    llmTier: llmRouting.llmTier,
    preferredLlmProvider: llmRouting.preferredProvider,
    llmProviderPolicy: llmRouting.providerPolicy,
    llmRoutingReason: llmRouting.routingReason,
    llmRoutingRung,
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
    // Personalisation: learner's display name for the mentor to use naturally.
    // WI-580 (F-076): adult owners only — a minor's real name never reaches a
    // third-party LLM provider.
    learnerName: resolvePromptLearnerName(profile),
    onboardingSignals: onboardingSignals.success
      ? onboardingSignals.data
      : undefined,
    isFirstEncounter,
    extractedSignalsToReflect,
    // B.3: Consecutive correct-answer streak at the current escalation rung.
    // Used by the prompt to trigger adaptive escalation when streak >= 4.
    correctStreak,
    challengeEligible: challengeReadiness.eligible,
    challengeRuntimeEnabled: challengeRoundRuntimeEnabled,
    challengeRound,
    currentUserMessageEventId: options?.currentUserMessageEventId,
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
  clientId?: string,
  userEventId?: string,
): Promise<{
  exchangeCount: number;
  aiEventId?: string;
  persistedUserMessage: boolean;
  /**
   * PII egress: session_events row id of the just-persisted
   * user_message. Lets dispatchers reference the learner's message by id
   * in Inngest event payloads instead of embedding the raw text (Inngest
   * persists payloads in its third-party event store).
   */
  userMessageEventId?: string;
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
      ...(behavioral.envelopeParseFailed !== undefined && {
        envelopeParseFailed: behavioral.envelopeParseFailed,
      }),
      ...(behavioral.envelopeParseFailureReason !== undefined && {
        envelopeParseFailureReason: behavioral.envelopeParseFailureReason,
      }),
      ...(behavioral.sourceAudit !== undefined && {
        sourceAudit: behavioral.sourceAudit,
      }),
      ...(behavioral.llmTier !== undefined && {
        llmTier: behavioral.llmTier,
      }),
      ...(behavioral.preferredLlmProvider !== undefined && {
        preferredLlmProvider: behavioral.preferredLlmProvider,
      }),
      ...(behavioral.llmProviderPolicy !== undefined && {
        llmProviderPolicy: behavioral.llmProviderPolicy,
      }),
      ...(behavioral.llmRoutingReason !== undefined && {
        llmRoutingReason: behavioral.llmRoutingReason,
      }),
      ...(behavioral.llmRoutingRung !== undefined && {
        llmRoutingRung: behavioral.llmRoutingRung,
      }),
      ...(behavioral.llmProvider !== undefined && {
        llmProvider: behavioral.llmProvider,
      }),
      ...(behavioral.llmModel !== undefined && {
        llmModel: behavioral.llmModel,
      }),
      ...(behavioral.llmFallbackUsed !== undefined && {
        llmFallbackUsed: behavioral.llmFallbackUsed,
      }),
      ...(behavioral.challengeRound !== undefined && {
        challengeRound: behavioral.challengeRound,
      }),
      ...(behavioral.challengeRoundVerdict !== undefined && {
        challengeRoundVerdict: behavioral.challengeRoundVerdict,
      }),
      ...(behavioral.draftedNote !== undefined && {
        draftedNote: behavioral.draftedNote,
      }),
    }),
    // Bug #348: persist envelope.signals.{evaluate_assessment,teach_back_assessment}
    // verbatim (snake_case wire shape) so parseEvaluateAssessment /
    // parseTeachBackAssessment can read them back from session_events.metadata.
    // Both parsers look for `metadata.signals.<key>` exactly — the shape here
    // MUST match envelope wire shape, not a camelCased rename. Only the keys
    // that were actually emitted are written; an undefined value means the
    // turn was not EVALUATE / TEACH_BACK and no `signals` object is added.
    ...(behavioral &&
      (behavioral.evaluateAssessment !== undefined ||
        behavioral.teachBackAssessment !== undefined) && {
        signals: {
          ...(behavioral.evaluateAssessment !== undefined && {
            evaluate_assessment: behavioral.evaluateAssessment,
          }),
          ...(behavioral.teachBackAssessment !== undefined && {
            teach_back_assessment: behavioral.teachBackAssessment,
          }),
        },
      }),
  };

  const now = new Date();
  const drillCorrect = behavioral?.drillCorrect ?? null;
  const drillTotal = behavioral?.drillTotal ?? null;
  const persisted = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    let clientPathUserMessageEventId: string | undefined;

    if (clientId) {
      const insertedUserRows = await txDb
        .insert(sessionEvents)
        .values({
          sessionId,
          ...(userEventId ? { id: userEventId } : {}),
          profileId,
          subjectId: session.subjectId,
          eventType: 'user_message' as const,
          content: userMessage,
          clientId,
        })
        .onConflictDoNothing({
          target: [sessionEvents.sessionId, sessionEvents.clientId],
          where: sql`${sessionEvents.clientId} IS NOT NULL`,
        })
        .returning({ id: sessionEvents.id });

      if (!insertedUserRows[0]?.id) {
        const freshSession = await getSession(txDb, profileId, sessionId);
        return {
          updated: {
            exchangeCount: freshSession?.exchangeCount ?? session.exchangeCount,
          },
          insertedEvents: [] as Array<{
            id: string;
            eventType: string | null;
          }>,
          persistedUserMessage: false,
          userMessageEventId: undefined as string | undefined,
        };
      }
      clientPathUserMessageEventId = insertedUserRows[0].id;
    }

    const [updated] = await txDb
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
          inArray(learningSessions.status, ['active', 'paused']),
          lt(learningSessions.exchangeCount, MAX_EXCHANGES_PER_SESSION),
        ),
      )
      .returning({ exchangeCount: learningSessions.exchangeCount });

    if (!updated) {
      const freshSession = await getSession(txDb, profileId, sessionId);
      if (
        freshSession?.status === 'completed' ||
        freshSession?.status === 'auto_closed'
      ) {
        throw new ConflictError(
          'Session is closed and cannot accept exchanges',
        );
      }
      throw new SessionExchangeLimitError(session.exchangeCount);
    }

    const insertedEvents = clientId
      ? await txDb
          .insert(sessionEvents)
          .values({
            sessionId,
            profileId,
            subjectId: session.subjectId,
            topicId: session.topicId ?? null,
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
      : await txDb
          .insert(sessionEvents)
          .values([
            {
              sessionId,
              ...(userEventId ? { id: userEventId } : {}),
              profileId,
              subjectId: session.subjectId,
              eventType: 'user_message' as const,
              content: userMessage,
            },
            {
              sessionId,
              profileId,
              subjectId: session.subjectId,
              topicId: session.topicId ?? null,
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

    return {
      updated,
      insertedEvents,
      persistedUserMessage: true,
      // PII egress: clientId path inserts the user_message separately
      // above; the non-clientId path inserts it alongside the ai_response,
      // so its id is recovered from insertedEvents below.
      userMessageEventId:
        clientPathUserMessageEventId ??
        insertedEvents.find((event) => event.eventType === 'user_message')?.id,
    };
  });
  const { updated, insertedEvents } = persisted;

  if (!persisted.persistedUserMessage) {
    return {
      exchangeCount: updated.exchangeCount,
      persistedUserMessage: false,
    };
  }

  const aiEventId = insertedEvents.find(
    (event) => event.eventType === 'ai_response',
  )?.id;

  await safeWrite(
    () =>
      applyContinuationScore(
        db,
        profileId,
        sessionId,
        behavioral?.retrievalScore,
      ),
    'session-exchange.continuation-score',
    { profileId, sessionId },
  );

  const sessionMetadata = session.metadata as Record<string, unknown> | null;
  const effectiveMode = sessionMetadata?.['effectiveMode'];

  if (aiEventId && effectiveMode === 'recitation') {
    // dedupeKey omitted — recordPracticeActivityEvent will use
    // buildPracticeActivityDedupeKey() so the format is identical to the
    // fluency_drill branch below. Standardised on the canonical builder so
    // duplicate detection works the same way across both OCR/session flows.
    await recordSessionPracticeActivityEvent(db, {
      profileId,
      subjectId: session.subjectId,
      activityType: 'recitation',
      activitySubtype: 'recitation',
      completedAt: now,
      sourceType: 'session_event',
      sourceId: aiEventId,
      metadata: {
        sessionId,
        exchangeCount: updated.exchangeCount,
      },
    });
  }

  if (aiEventId && drillCorrect != null && drillTotal != null) {
    await recordSessionPracticeActivityEvent(db, {
      profileId,
      subjectId: session.subjectId,
      activityType: 'fluency_drill',
      activitySubtype: 'language',
      completedAt: now,
      score: drillCorrect,
      total: drillTotal,
      sourceType: 'session_event',
      sourceId: aiEventId,
      metadata: {
        sessionId,
        exchangeCount: updated.exchangeCount,
      },
    });
  }

  if (previousRung !== effectiveRung) {
    await safeWrite(
      () =>
        db.insert(sessionEvents).values({
          sessionId,
          profileId,
          subjectId: session.subjectId,
          eventType: 'escalation' as const,
          content: `Escalated from rung ${previousRung} to ${effectiveRung}`,
          metadata: { fromRung: previousRung, toRung: effectiveRung },
        }),
      'session-exchange.escalation-audit',
      { profileId, sessionId },
    );
  }

  // B.1 monitoring: tone check — detect banned filler openers
  {
    const words = aiResponse.trim().split(/\s+/);
    const firstSixWords = words.slice(0, 6).join(' ').toLowerCase();
    const startsWithFiller = BANNED_FILLER_OPENERS.some((opener) =>
      firstSixWords.startsWith(opener),
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
    aiEventId,
    persistedUserMessage: true,
    userMessageEventId: persisted.userMessageEventId,
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
    llmTier?: LLMTier;
    subscriptionTier?: SubscriptionTier;
    quotaRemainingTurns?: number;
    quotaFractionRemaining?: number;
    clientId?: string;
    memoryFactsReadEnabled?: boolean;
    memoryFactsRelevanceEnabled?: boolean;
    semanticMemoryRetrievalEnabled?: boolean;
    challengeRoundRuntimeEnabled?: boolean;
    identityV2Enabled?: boolean;
  },
): Promise<{
  response: string;
  escalationRung: number;
  isUnderstandingCheck: boolean;
  exchangeCount: number;
  expectedResponseMinutes: number;
  aiEventId?: string;
  envelopeParseFailed?: boolean;
  envelopeParseFailureReason?: string;
  fluencyDrill?: FluencyDrillAnnotation;
  sourceAudit?: ExchangeSourceAudit;
  /**
   * F1.1 — Surface the interview-close signal to the route layer so the
   * mobile client / route handler can finalize an onboarding interview
   * deterministically. `true` when either the LLM emitted
   * `signals.ready_to_finish` OR this session is on the interview/onboarding
   * fast path AND the server-side hard cap {@link MAX_INTERVIEW_EXCHANGES}
   * has been reached. Always present for parity with the envelope contract.
   * [BUG-92 / CR-2026-05-19-C4]
   */
  readyToFinish: boolean;
  /**
   * [#384] Envelope signals mirrored from the streaming path so both code
   * paths expose the same client-facing shape. Absent means no prompt was
   * requested / no confidence was emitted for this turn.
   */
  notePrompt?: boolean;
  notePromptPostSession?: boolean;
  confidence?: 'low' | 'medium' | 'high';
  challengeRound?: ChallengeRoundSessionState;
  challengeOffer?: { pitch: string };
  draftedNote?: DraftedChallengeNote;
}> {
  // Early exchange limit check — runs before expensive prepareExchangeContext
  // which performs 9+ parallel DB queries and a quota check (issue #15, review item #4)
  await checkExchangeLimit(db, profileId, sessionId);

  const currentUserMessageEventId =
    options?.challengeRoundRuntimeEnabled === true
      ? generateUUIDv7()
      : undefined;
  const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
    await prepareExchangeContext(db, profileId, sessionId, input.message, {
      ...options,
      homeworkMode: input.homeworkMode,
      currentUserMessageEventId,
    });

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
        // safeSend prevents the dispatch from masking the original LlmStreamError
        // (`throw err` below). Without it, an Inngest hiccup here would propagate
        // and shadow the underlying processExchange failure.
        await safeSend(
          () =>
            inngest.send({
              name: 'app/orphan.persist.failed',
              data: {
                profileId,
                sessionId,
                route: 'session-exchange/process',
                reason: classifyOrphanError(err),
                error: String(persistErr),
              },
            }),
          'orphan.persist.failed',
          { profileId, sessionId, route: 'session-exchange/process' },
        );
        captureException(persistErr, {
          profileId,
          extra: { phase: 'orphan_persist_failed' },
        });
      }
    }
    throw err;
  }

  const challengeRoundRuntime = await applyChallengeRoundRuntimeSignals(
    db,
    profileId,
    session,
    context,
    {
      response: result.response,
      challengeRoundOffer: result.challengeRoundOffer,
      challengeRoundEvaluation: result.challengeRoundEvaluation ?? [],
      noteDraft: result.noteDraft,
      currentUserMessage: currentUserMessageEventId
        ? { id: currentUserMessageEventId, content: input.message }
        : undefined,
    },
  );

  // Compute time-to-answer: ms between last AI response and now.
  // [BUG-391] Defensive cast: neon-serverless returns Date objects for
  // timestamp columns, but belt-and-braces — ensure we always call .getTime()
  // on a real Date so a string value (e.g. under test mocks or schema drift)
  // produces a finite result rather than NaN silently propagating into the
  // persisted telemetry payload.
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() -
      (lastAiResponseAt instanceof Date
        ? lastAiResponseAt.getTime()
        : new Date(lastAiResponseAt as string).getTime())
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
      envelopeParseFailed: result.envelopeParseFailed,
      envelopeParseFailureReason: result.envelopeParseFailureReason,
      sourceAudit: result.sourceAudit,
      drillCorrect: result.fluencyDrill?.score?.correct,
      drillTotal: result.fluencyDrill?.score?.total,
      llmTier: context.llmTier,
      preferredLlmProvider: context.preferredLlmProvider,
      llmProviderPolicy: context.llmProviderPolicy,
      llmRoutingReason: context.llmRoutingReason,
      llmRoutingRung: context.llmRoutingRung ?? context.escalationRung,
      llmProvider: result.provider,
      llmModel: result.model,
      // Bug #348: forward EVALUATE / TEACH_BACK assessment signals onto
      // aiMetadata.signals so parseEvaluate/TeachBackAssessment can read them.
      evaluateAssessment: result.evaluateAssessment,
      teachBackAssessment: result.teachBackAssessment,
      challengeRound: challengeRoundRuntime.challengeRound,
      challengeRoundVerdict: challengeRoundRuntime.challengeRoundVerdict,
      draftedNote: challengeRoundRuntime.draftedNote,
    },
    options?.clientId,
    currentUserMessageEventId,
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
      context.isFirstEncounter === true,
      persisted.userMessageEventId,
    );
    // [WI-620] Calibration dispatch fires AFTER the user message is persisted so
    // it can reference the session_events row id (opaque) instead of carrying
    // the learner's raw answer / topic title across the Inngest trust boundary.
    await maybeDispatchReviewCalibration(
      db,
      profileId,
      { id: session.id, topicId: session.topicId },
      context.effectiveMode,
      context.conversationLanguage,
      input.message,
      context.topicTitle,
      persisted.userMessageEventId,
    );
  }

  // [BUG-92 / CR-2026-05-19-C4] Apply the server-side hard cap for interview /
  // onboarding flows. See `resolveReadyToFinish` JSDoc for the contract.
  const readyToFinish = resolveReadyToFinish({
    llmReadyToFinish: result.readyToFinish,
    exchangeCount: persisted.exchangeCount,
    sessionMetadata: session.metadata as Record<string, unknown> | null,
  });

  return {
    response: result.response,
    escalationRung: effectiveRung,
    isUnderstandingCheck: result.isUnderstandingCheck,
    exchangeCount: persisted.exchangeCount,
    expectedResponseMinutes: result.expectedResponseMinutes,
    aiEventId: persisted.aiEventId,
    envelopeParseFailed: result.envelopeParseFailed,
    envelopeParseFailureReason: result.envelopeParseFailureReason,
    fluencyDrill: result.fluencyDrill ?? undefined,
    sourceAudit: result.sourceAudit,
    readyToFinish,
    // [#384] Mirror streaming-path envelope signals so both code paths expose
    // the same client-facing shape. Consumers MUST NOT assume these are absent.
    notePrompt: result.notePrompt || undefined,
    notePromptPostSession: result.notePromptPostSession || undefined,
    confidence: result.confidence,
    challengeRound: challengeRoundRuntime.challengeRound,
    challengeOffer: challengeRoundRuntime.challengeOffer,
    draftedNote: challengeRoundRuntime.draftedNote,
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
    llmTier?: LLMTier;
    subscriptionTier?: SubscriptionTier;
    quotaRemainingTurns?: number;
    quotaFractionRemaining?: number;
    clientId?: string;
    memoryFactsReadEnabled?: boolean;
    memoryFactsRelevanceEnabled?: boolean;
    semanticMemoryRetrievalEnabled?: boolean;
    challengeRoundRuntimeEnabled?: boolean;
    identityV2Enabled?: boolean;
  },
): Promise<{
  stream: AsyncIterable<string>;
  onComplete: () => Promise<{
    /** Parsed assistant text persisted for the exchange. Useful when the
     *  streaming extractor yielded no visible chunks but the full envelope
     *  parsed cleanly at completion. */
    response?: string;
    exchangeCount: number;
    escalationRung: number;
    expectedResponseMinutes: number;
    aiEventId?: string;
    notePrompt?: boolean;
    notePromptPostSession?: boolean;
    fluencyDrill?: FluencyDrillAnnotation;
    confidence?: 'low' | 'medium' | 'high';
    sourceAudit?: ExchangeSourceAudit;
    /** Set when the source audit replaced already-streamed text; caller should
     *  emit a replace frame before done so the visible bubble matches what was
     *  persisted. */
    sourceReplacement?: string;
    /**
     * [#419] Server-side hard cap for interview/onboarding flows — mirrors
     * `processMessage`. `true` when the LLM signalled `signals.ready_to_finish`
     * OR the session has reached MAX_INTERVIEW_EXCHANGES. Streaming interview
     * sessions were previously missing this, allowing them to run unbounded.
     */
    readyToFinish?: boolean;
    /** [BUG-941] Set when the LLM response was empty or unparseable — caller
     *  MUST emit a `fallback` SSE frame and skip persisting the exchange so
     *  the raw envelope never reaches ai_response.content. */
    fallback?: ExchangeFallback;
    challengeRound?: ChallengeRoundSessionState;
    challengeOffer?: { pitch: string };
    draftedNote?: DraftedChallengeNote;
  }>;
}> {
  // Early exchange limit check — runs before expensive prepareExchangeContext
  // which performs 9+ parallel DB queries and a quota check (issue #15, review item #4)
  await checkExchangeLimit(db, profileId, sessionId);

  const currentUserMessageEventId =
    options?.challengeRoundRuntimeEnabled === true
      ? generateUUIDv7()
      : undefined;
  const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
    await prepareExchangeContext(db, profileId, sessionId, input.message, {
      ...options,
      homeworkMode: input.homeworkMode,
      currentUserMessageEventId,
    });

  // Compute time-to-answer before streaming begins.
  // [BUG-391] Same defensive cast as the non-streaming path above — ensure a
  // string value from schema drift never produces a silent NaN.
  const timeToAnswerMs = lastAiResponseAt
    ? Date.now() -
      (lastAiResponseAt instanceof Date
        ? lastAiResponseAt.getTime()
        : new Date(lastAiResponseAt as string).getTime())
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
              },
            );
          } catch (persistErr) {
            await safeSend(
              () =>
                inngest.send({
                  name: 'app/orphan.persist.failed',
                  data: {
                    profileId,
                    sessionId,
                    route: 'session-exchange/stream',
                    reason: classifyOrphanError(err),
                    error: String(persistErr),
                  },
                }),
              'orphan.persist.failed',
              { profileId, sessionId, route: 'session-exchange/stream' },
            );
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
              },
            );
          } catch (persistErr) {
            await safeSend(
              () =>
                inngest.send({
                  name: 'app/orphan.persist.failed',
                  data: {
                    profileId,
                    sessionId,
                    route: 'session-exchange/fallback',
                    reason: 'llm_empty_or_unparseable',
                    error: String(persistErr),
                  },
                }),
              'orphan.persist.failed',
              { profileId, sessionId, route: 'session-exchange/fallback' },
            );
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

      const parsed = isAppHelpQuery(input.message)
        ? applyAppHelpSignalGuard(outcome.parsed)
        : outcome.parsed;
      const privateSourcesForAudit = inferObviousReliableSourceForAudit(
        parsed.privateSources,
        result.sourceEvidence,
        parsed.cleanResponse,
      );
      const sourceAudit = auditExchangeSources(
        privateSourcesForAudit,
        result.sourceEvidence,
        { envelopeParseFailed: parsed.envelopeParseFailed },
      );
      const sourceSafe = applySourceAuditSafetyFallback(
        parsed.cleanResponse,
        sourceAudit,
      );
      const sourceReplacement =
        sourceSafe.response !== parsed.cleanResponse
          ? sourceSafe.response
          : undefined;
      const expectedResponseMinutes = estimateExpectedResponseMinutes(
        sourceSafe.response,
        context,
      );
      const challengeRoundRuntime = await applyChallengeRoundRuntimeSignals(
        db,
        profileId,
        session,
        context,
        {
          response: sourceSafe.response,
          challengeRoundOffer: parsed.challengeRoundOffer,
          challengeRoundEvaluation: parsed.challengeRoundEvaluation,
          noteDraft: parsed.noteDraft,
          currentUserMessage: currentUserMessageEventId
            ? { id: currentUserMessageEventId, content: input.message }
            : undefined,
        },
      );
      const persisted = await persistExchangeResult(
        db,
        profileId,
        sessionId,
        session,
        input.message,
        sourceSafe.response,
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
          sourceAudit: sourceSafe.sourceAudit,
          drillCorrect: parsed.fluencyDrill?.score?.correct,
          drillTotal: parsed.fluencyDrill?.score?.total,
          llmTier: context.llmTier,
          preferredLlmProvider: context.preferredLlmProvider,
          llmProviderPolicy: context.llmProviderPolicy,
          llmRoutingReason: context.llmRoutingReason,
          llmRoutingRung: context.llmRoutingRung ?? context.escalationRung,
          llmProvider: result.provider,
          llmModel: result.model,
          llmFallbackUsed: result.fallbackUsed === true,
          // Bug #348: forward EVALUATE / TEACH_BACK assessment signals from
          // the parsed envelope onto aiMetadata.signals.
          evaluateAssessment: parsed.evaluateAssessment,
          teachBackAssessment: parsed.teachBackAssessment,
          challengeRound: challengeRoundRuntime.challengeRound,
          challengeRoundVerdict: challengeRoundRuntime.challengeRoundVerdict,
          draftedNote: challengeRoundRuntime.draftedNote,
        },
        options?.clientId,
        currentUserMessageEventId,
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
          context.isFirstEncounter === true,
          persisted.userMessageEventId,
        );
        // [WI-620] Calibration dispatch fires AFTER the user message is
        // persisted so it references the session_events row id (opaque) rather
        // than carrying raw learner text / topic title across the Inngest
        // trust boundary.
        await maybeDispatchReviewCalibration(
          db,
          profileId,
          { id: session.id, topicId: session.topicId },
          context.effectiveMode,
          context.conversationLanguage,
          input.message,
          context.topicTitle,
          persisted.userMessageEventId,
        );
      }

      // [#419] Apply the server-side hard cap for interview / onboarding flows,
      // mirroring the non-streaming processMessage path. Without this, a
      // streaming interview session could run all the way to
      // MAX_EXCHANGES_PER_SESSION (50) when the LLM never emits the signal.
      const readyToFinish = resolveReadyToFinish({
        llmReadyToFinish: parsed.readyToFinish,
        exchangeCount: persisted.exchangeCount,
        sessionMetadata: session.metadata as Record<string, unknown> | null,
      });

      return {
        response: sourceSafe.response,
        exchangeCount: persisted.exchangeCount,
        escalationRung: effectiveRung,
        expectedResponseMinutes,
        aiEventId: persisted.aiEventId,
        notePrompt: parsed.notePrompt || undefined,
        notePromptPostSession: parsed.notePromptPostSession || undefined,
        fluencyDrill: parsed.fluencyDrill ?? undefined,
        confidence: parsed.confidence,
        sourceAudit: sourceSafe.sourceAudit,
        sourceReplacement,
        readyToFinish,
        challengeRound: challengeRoundRuntime.challengeRound,
        challengeOffer: challengeRoundRuntime.challengeOffer,
        draftedNote: challengeRoundRuntime.draftedNote,
      };
    },
  };
}
