import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ConflictError,
  firstCurriculumSessionStartSchema,
  sessionStartSchema,
  sessionMessageSchema,
  sessionCloseSchema,
  contentFlagSchema,
  sessionAnalyticsEventSchema,
  sessionInputModeSchema,
  summarySubmitSchema,
  interleavedSessionStartSchema,
  homeworkStateSyncSchema,
  systemPromptIntentSchema,
  ERROR_CODES,
  filingRetryEventSchema,
  getSessionEffectiveMode,
  learningSessionSchema,
  RateLimitedError,
  recallBridgeResultSchema,
  retrySummaryFeedbackResultSchema,
  sessionAutoFileRequestedEventSchema,
  getSubjectSessionsResponseSchema,
  type SubscriptionTier,
  type QuotaModel,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { z } from 'zod';
import type { AuthUser } from '../middleware/auth';
import { idempotencyPreflight } from '../middleware/idempotency';
import { type ProfileMeta } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile } from '../route-utils/route-context';
import { streamSSEUtf8 } from '../route-utils/sse-utf8';
import { addBreadcrumb, captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import {
  startSession,
  startFirstCurriculumSession,
  SubjectInactiveError,
  CurriculumSessionNotReadyError,
  SessionExchangeLimitError,
  ConsentWithdrawnError,
  getSession,
  clearContinuationDepth,
  processMessage,
  streamMessage,
  closeSession,
  flagContent,
  getSessionSummary,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  skipSummary,
  submitSummary,
  retrySummaryFeedback,
  syncHomeworkState,
  setSessionInputMode,
  getResumeNudgeCandidate,
  claimSessionForFilingRetry,
  markSessionKeptOutOfLibrary,
  requestSessionLibraryFiling,
  restoreSessionForAutoFiling,
  resetFilingForRetry,
  getSubjectSessions,
  dispatchClosePathAutoFileIfEligible,
  dispatchSessionCompletedEvent,
} from '../services/session';
import type { LLMTier } from '../services/subscription';
import { notFound, apiError } from '../errors';
import { inngest } from '../inngest/client';
import { safeSend, safeWrite } from '../services/safe-non-core';
import {
  recordActivationEvent,
  deriveActivationProfileShape,
} from '../services/activation-events';
import { refundQuotaOrEscalate } from '../services/billing';
import {
  startInterleavedSession,
  NoInterleavedTopicsError,
} from '../services/interleaved';
import { generateRecallBridge } from '../services/recall-bridge';
import { getMentorNoticeReceipt } from '../services/mentor-notices';
import {
  markPersisted,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from '../services/idempotency-marker';
import { parseConversationLanguage } from '../services/llm';
import { streamSessionResponse } from '../services/session/session-stream-response';
import {
  isChallengeRoundEnabledForProfile,
  isReviewCallbackOpenerEnabled,
  isChallengeRoundGraderEnabled,
  isTopicIntentMatcherEnabled,
  isMemoryFactsReadEnabled,
  isMemoryFactsRelevanceEnabled,
  isJudgeFrameworkEnabled,
  isJudgeEnforcementEnabled,
  isMentorNoticeEnabled,
} from '../config';
import { FILING_CONFIG } from '../config/filing';

const logger = createLogger();

// WI-1504: launch activation instrumentation. occurrenceKey is deliberately
// omitted — first_session_started should record only the FIRST session a
// profile starts, not every session, so the default profile-scoped
// dedupeKey (no occurrence suffix) lets onConflictDoNothing keep only the
// earliest row per profile. (first_session_completed is recorded inside
// dispatchSessionCompletedEvent — services/session/session-filing-dispatch.ts
// — the single choke point all three completion routes share.)
async function recordFirstSessionStarted(
  db: Database,
  profileId: string,
  sessionId: string,
  route: string,
  profileMeta: { isOwner: boolean } | undefined,
): Promise<void> {
  await safeWrite(
    () =>
      recordActivationEvent(db, {
        eventType: 'first_session_started',
        profileId,
        profileShape: profileMeta
          ? deriveActivationProfileShape(profileMeta)
          : null,
        route,
        metadata: { sessionId },
      }),
    'sessions.start.first_session_started',
    { profileId, sessionId },
  );
}

// [BUG-CONT-DEPTH-SWEEP] DONE: every /:sessionId endpoint in this file now
// applies zValidator('param', sessionIdParamsSchema) for consistent UUID
// validation and early rejection of malformed IDs (verified 2026-06-09 — all
// of GET /sessions/:sessionId, /transcript, /recall-bridge,
// /close, /messages, /stream, /summary, etc. carry the param validator).

// retryFilingParamsSchema was byte-identical to sessionIdParamsSchema; consolidated.
const sessionIdParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

type SessionRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    VOYAGE_API_KEY?: string;
    MATCHER_ENABLED?: string;
    CHALLENGE_ROUND_RUNTIME_ENABLED?: string;
    MENTOR_NOTICE_ENABLED?: string;
    CHALLENGE_ROUND_COHORT_PROFILE_IDS?: string;
    REVIEW_CALLBACK_OPENER_ENABLED?: string;
    CHALLENGE_ROUND_GRADER_ENABLED?: string;
    JUDGE_FRAMEWORK_ENABLED?: string;
    JUDGE_ENFORCEMENT_ENABLED?: string;
    MEMORY_FACTS_READ_ENABLED?: string;
    MEMORY_FACTS_RELEVANCE_RETRIEVAL?: string;
    IDEMPOTENCY_KV?: KVNamespace;
    ENVIRONMENT?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    subscriptionId: string;
    subscriptionTier: SubscriptionTier | undefined;
    llmTier: LLMTier;
    /** [CR-2026-05-19-C6] Set by metering middleware; used to refund to the correct pool. */
    quotaDecrementSource: 'monthly' | 'top_up' | undefined;
    /** [CR-2026-05-19-C6] Set by metering middleware when source is top_up. */
    quotaDecrementTopUpCreditId: string | undefined;
    /** Set by metering middleware; keeps refund routing stable if tier state changes mid-request. */
    quotaDecrementQuotaModel: QuotaModel | undefined;
    /** Set when the handler refunds its metered turn so middleware does not charge it again. */
    quotaRefunded: boolean | undefined;
    quotaRemainingTurns: number | undefined;
    quotaFractionRemaining: number | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const sessionRoutes = new Hono<SessionRouteEnv>()
  .use('/sessions/:sessionId/stream', idempotencyPreflight({ flow: 'session' }))
  .use(
    '/sessions/:sessionId/messages',
    idempotencyPreflight({ flow: 'session' }),
  )
  .get('/sessions/resume-nudge', async (c) => {
    const { db, profileId } = withProfile(c);
    const nudge = await getResumeNudgeCandidate(db, profileId);
    return c.json({ nudge });
  })
  // List past sessions for a subject (Past conversations on progress screen)
  .get(
    '/subjects/:subjectId/sessions',
    zValidator('param', z.object({ subjectId: z.string().uuid() })),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const { subjectId } = c.req.valid('param');
      const sessions = await getSubjectSessions(db, profileId, subjectId);
      return c.json(getSubjectSessionsResponseSchema.parse({ sessions }));
    },
  )
  // Start a new learning session for a subject
  .post(
    '/subjects/:subjectId/sessions/first-curriculum',
    zValidator('json', firstCurriculumSessionStartSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      try {
        const session = await startFirstCurriculumSession(
          db,
          profileId,
          subjectId,
          input,
          {
            matcherEnabled: isTopicIntentMatcherEnabled(c.env.MATCHER_ENABLED),
          },
        );
        await recordFirstSessionStarted(
          db,
          profileId,
          session.id,
          'POST /subjects/:subjectId/sessions/first-curriculum',
          c.get('profileMeta'),
        );
        // [L8-F11] Validate response shape against the public contract.
        return c.json({ session: learningSessionSchema.parse(session) }, 201);
      } catch (err) {
        if (err instanceof CurriculumSessionNotReadyError) {
          return apiError(c, 409, ERROR_CODES.CONFLICT, err.message);
        }
        if (err instanceof SubjectInactiveError) {
          return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
        }
        throw err;
      }
    },
  )

  .post(
    '/subjects/:subjectId/sessions',
    zValidator('json', sessionStartSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      try {
        const session = await startSession(db, profileId, subjectId, input);
        await recordFirstSessionStarted(
          db,
          profileId,
          session.id,
          'POST /subjects/:subjectId/sessions',
          c.get('profileMeta'),
        );
        // [L8-F11] Validate response shape against the public contract.
        return c.json({ session: learningSessionSchema.parse(session) }, 201);
      } catch (err) {
        if (err instanceof SubjectInactiveError) {
          return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
        }
        throw err;
      }
    },
  )

  // Get session state
  // [BUG-95 / A1-HIGH] zValidator('param', sessionIdParamsSchema) added per
  // the self-documented BUG-CONT-DEPTH-SWEEP follow-up. Malformed sessionIds
  // are rejected with 400 before any DB call.
  .get(
    '/sessions/:sessionId',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const session = await getSession(
        db,
        profileId,
        c.req.valid('param').sessionId,
      );
      if (!session) return notFound(c, 'Session not found');
      return c.json({ session: learningSessionSchema.parse(session) });
    },
  )

  .patch(
    '/sessions/:sessionId/clear-continuation-depth',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');
      const session = await clearContinuationDepth(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');
      return c.json({ session: learningSessionSchema.parse(session) });
    },
  )

  .post(
    '/sessions/:sessionId/retry-filing',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      if (getSessionEffectiveMode(session) === 'freeform') {
        const reset = await resetFilingForRetry(db, profileId, sessionId);
        if (!reset) {
          const fresh = await getSession(db, profileId, sessionId);
          if (!fresh) return notFound(c, 'Session not found');
          throw new ConflictError(
            `Session is not in a retriable state (status: ${
              fresh.filingStatus ?? 'null'
            })`,
          );
        }

        await dispatchSessionAutoFileRequested(
          profileId,
          sessionId,
          'retry',
          reset.dispatchId,
        );

        const updatedSession = await getSession(db, profileId, sessionId);
        return c.json({
          session: learningSessionSchema.parse(updatedSession ?? reset.session),
        });
      }

      const updated = await claimSessionForFilingRetry(
        db,
        profileId,
        sessionId,
      );

      if (!updated) {
        const fresh = await getSession(db, profileId, sessionId);
        if (!fresh) return notFound(c, 'Session not found');
        if (fresh.filingRetryCount >= FILING_CONFIG.maxRetries) {
          throw new RateLimitedError(
            'Retry limit reached for this session.',
            ERROR_CODES.RATE_LIMITED,
          );
        }
        throw new ConflictError(
          `Session is not in a retriable state (status: ${
            fresh.filingStatus ?? 'null'
          })`,
        );
      }

      const retryPayload = filingRetryEventSchema.parse({
        profileId,
        sessionId,
        sessionMode:
          session.sessionType === 'homework' ? 'homework' : 'freeform',
      });
      // core-send: user-initiated filing retry — dispatch must throw on
      // failure so the user is not told "queued" when nothing was queued.
      // [BUG-820] Key by sessionId so a double-tapped retry does not enqueue
      // two parallel filing workers for the same session.
      await inngest.send({
        id: `filing-retry-${sessionId}`,
        name: 'app/filing.retry',
        data: retryPayload,
      });

      const updatedSession = await getSession(db, profileId, sessionId);
      if (!updatedSession) return notFound(c, 'Session not found');
      return c.json({
        session: learningSessionSchema.parse(updatedSession),
      });
    },
  )

  .post(
    '/sessions/:sessionId/library-filing/keep-out',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      // [F-117] Server-derived proxy-mode write guard — a non-owner proxy
      // caller must not mutate a child's library-filing state.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');

      const session = await markSessionKeptOutOfLibrary(
        db,
        profileId,
        sessionId,
      );
      if (!session) return notFound(c, 'Session not found');

      return c.json({ session: learningSessionSchema.parse(session) });
    },
  )

  .post(
    '/sessions/:sessionId/library-filing/add',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      // [F-117] Server-derived proxy-mode write guard — also blocks the
      // Inngest auto-file dispatch below from firing on a child's behalf.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');

      const request = await requestSessionLibraryFiling(
        db,
        profileId,
        sessionId,
      );
      if (!request) {
        throw new ConflictError('Session is not eligible for Library filing.');
      }

      await dispatchSessionAutoFileRequested(
        profileId,
        sessionId,
        'user_requested',
        request.dispatchId,
      );

      return c.json({
        session: learningSessionSchema.parse(request.session),
      });
    },
  )

  .post(
    '/sessions/:sessionId/library-filing/restore',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      // [F-117] Server-derived proxy-mode write guard — also blocks the
      // Inngest auto-file dispatch below from firing on a child's behalf.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');

      const request = await restoreSessionForAutoFiling(
        db,
        profileId,
        sessionId,
      );
      if (!request) {
        throw new ConflictError('Session is not kept out of Library.');
      }

      await dispatchSessionAutoFileRequested(
        profileId,
        sessionId,
        'restore',
        request.dispatchId,
      );

      return c.json({
        session: learningSessionSchema.parse(request.session),
      });
    },
  )

  // Send a message (the core learning exchange)
  .post(
    '/sessions/:sessionId/messages',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', sessionMessageSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const subscriptionId = c.get('subscriptionId');
      const sessionId = c.req.valid('param').sessionId;
      // [BUG-100 / A1-LOW] Defensive length check in addition to the middleware
      // bound. Idempotency middleware already rejects keys > MAX length, but
      // this handler can also be reached via paths that bypass that
      // middleware; duplicating the cap keeps the value used as a cache key
      // from ever exceeding the documented contract.
      const rawClientId = c.req.header('Idempotency-Key')?.trim();
      const clientId =
        rawClientId && rawClientId.length <= MAX_IDEMPOTENCY_KEY_LENGTH
          ? rawClientId
          : undefined;

      const llmTier = c.get('llmTier');
      const subscriptionTier = c.get('subscriptionTier');
      const quotaRemainingTurns = c.get('quotaRemainingTurns');
      const quotaFractionRemaining = c.get('quotaFractionRemaining');
      const memoryFactsReadEnabled = isMemoryFactsReadEnabled(
        c.env.MEMORY_FACTS_READ_ENABLED,
      );
      const memoryFactsRelevanceEnabled =
        memoryFactsReadEnabled &&
        isMemoryFactsRelevanceEnabled(c.env.MEMORY_FACTS_RELEVANCE_RETRIEVAL);
      const challengeRoundRuntimeEnabled = isChallengeRoundEnabledForProfile(
        c.env.CHALLENGE_ROUND_RUNTIME_ENABLED,
        profileId,
        c.env.CHALLENGE_ROUND_COHORT_PROFILE_IDS,
      );
      const mentorNoticeEnabled = isMentorNoticeEnabled(
        c.env.MENTOR_NOTICE_ENABLED,
      );
      const reviewCallbackOpenerEnabled = isReviewCallbackOpenerEnabled(
        c.env.REVIEW_CALLBACK_OPENER_ENABLED,
      );
      const judgeFrameworkEnabled = isJudgeFrameworkEnabled(
        c.env.JUDGE_FRAMEWORK_ENABLED,
      );
      const judgeEnforcementEnabled = isJudgeEnforcementEnabled(
        c.env.JUDGE_ENFORCEMENT_ENABLED,
      );

      try {
        const result = await processMessage(
          db,
          profileId,
          sessionId,
          c.req.valid('json'),
          {
            llmTier,
            subscriptionTier,
            quotaRemainingTurns,
            quotaFractionRemaining,
            voyageApiKey: c.env.VOYAGE_API_KEY,
            clientId,
            memoryFactsReadEnabled,
            memoryFactsRelevanceEnabled,
            challengeRoundRuntimeEnabled,
            mentorNoticeEnabled,
            reviewCallbackOpenerEnabled,
            judgeFrameworkEnabled,
            judgeEnforcementEnabled,
            challengeRoundGraderEnabled: isChallengeRoundGraderEnabled(
              c.env?.CHALLENGE_ROUND_GRADER_ENABLED,
            ),
          },
        );
        await markPersisted({
          kv: c.env.IDEMPOTENCY_KV,
          profileId,
          flow: 'session',
          key: clientId,
        });
        // [BUG-92 / CR-2026-05-19-C4] processMessage surfaces `readyToFinish`
        // (LLM `signals.ready_to_finish` OR server-side hard cap
        // MAX_INTERVIEW_EXCHANGES) — it flows through `clientResult` to the
        // mobile client, which uses it to close an interview/onboarding
        // session deterministically. Do NOT strip readyToFinish here.
        const { sourceAudit: privateSourceAudit, ...clientResult } = result;
        void privateSourceAudit;
        return c.json(clientResult);
      } catch (err) {
        if (err instanceof SessionExchangeLimitError) {
          return apiError(
            c,
            429,
            ERROR_CODES.EXCHANGE_LIMIT_EXCEEDED,
            err.message,
          );
        }

        // [WI-2372] Consent withdrawn — gate threw before any LLM dispatch.
        if (err instanceof ConsentWithdrawnError) {
          return apiError(c, 403, ERROR_CODES.CONSENT_WITHDRAWN, err.message);
        }

        // Refund quota on LLM failure — user should not be charged for a failed exchange
        // [BUG-661 / A-21] safeRefundQuota escalates if the refund itself fails.
        // [BUG-821] refundQuotaOrEscalate escalates if a decrement happened but
        // subscriptionId is missing, instead of silently dropping the refund.
        // [CR-2026-05-19-C6] Thread source/topUpCreditId so top-up refunds
        // credit the original batch instead of inflating monthly quota.
        await refundQuotaOrEscalate(db, subscriptionId, {
          route: 'sessions.message',
          profileId,
          source: c.get('quotaDecrementSource'),
          quotaModel: c.get('quotaDecrementQuotaModel'),
          topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
        });
        throw err;
      }
    },
  )

  .get(
    '/sessions/:sessionId/transcript',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const transcript = await getSessionTranscript(
        db,
        profileId,
        c.req.valid('param').sessionId,
      );
      if (!transcript) return notFound(c, 'Session not found');
      return c.json(transcript);
    },
  )

  // Stream a message response via SSE
  .post(
    '/sessions/:sessionId/stream',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', sessionMessageSchema),
    async (c) => {
      // [WI-171 / DS-082] Server-derived proxy-mode write guard.
      // The stream endpoint persists messages and triggers LLM exchanges
      // (DeepSec Found-In lines 868, 924, 943, 956, 972, 991 — all inside
      // this handler's write paths).
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const subscriptionId = c.get('subscriptionId');
      const sessionId = c.req.valid('param').sessionId;
      const input = c.req.valid('json');
      // [BUG-100 / A1-LOW] Belt-and-suspenders length cap — see the matching
      // comment on /messages above.
      const rawStreamClientId = c.req.header('Idempotency-Key')?.trim();
      const clientId =
        rawStreamClientId &&
        rawStreamClientId.length <= MAX_IDEMPOTENCY_KEY_LENGTH
          ? rawStreamClientId
          : undefined;

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      const llmTier = c.get('llmTier');
      const subscriptionTier = c.get('subscriptionTier');
      const quotaRemainingTurns = c.get('quotaRemainingTurns');
      const quotaFractionRemaining = c.get('quotaFractionRemaining');
      const memoryFactsReadEnabled = isMemoryFactsReadEnabled(
        c.env.MEMORY_FACTS_READ_ENABLED,
      );
      const memoryFactsRelevanceEnabled =
        memoryFactsReadEnabled &&
        isMemoryFactsRelevanceEnabled(c.env.MEMORY_FACTS_RELEVANCE_RETRIEVAL);
      const challengeRoundRuntimeEnabled = isChallengeRoundEnabledForProfile(
        c.env.CHALLENGE_ROUND_RUNTIME_ENABLED,
        profileId,
        c.env.CHALLENGE_ROUND_COHORT_PROFILE_IDS,
      );
      const mentorNoticeEnabled = isMentorNoticeEnabled(
        c.env.MENTOR_NOTICE_ENABLED,
      );
      const reviewCallbackOpenerEnabled = isReviewCallbackOpenerEnabled(
        c.env.REVIEW_CALLBACK_OPENER_ENABLED,
      );
      const judgeFrameworkEnabled = isJudgeFrameworkEnabled(
        c.env.JUDGE_FRAMEWORK_ENABLED,
      );
      const judgeEnforcementEnabled = isJudgeEnforcementEnabled(
        c.env.JUDGE_ENFORCEMENT_ENABLED,
      );

      try {
        return await streamSessionResponse({
          db,
          profileId,
          sessionId,
          input,
          session,
          subscriptionId,
          quota: {
            source: c.get('quotaDecrementSource'),
            quotaModel: c.get('quotaDecrementQuotaModel'),
            topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
          },
          idempotencyKv: c.env.IDEMPOTENCY_KV,
          streamOptions: {
            llmTier,
            subscriptionTier,
            quotaRemainingTurns,
            quotaFractionRemaining,
            voyageApiKey: c.env.VOYAGE_API_KEY,
            clientId,
            memoryFactsReadEnabled,
            memoryFactsRelevanceEnabled,
            challengeRoundRuntimeEnabled,
            mentorNoticeEnabled,
            reviewCallbackOpenerEnabled,
            judgeFrameworkEnabled,
            judgeEnforcementEnabled,
            challengeRoundGraderEnabled: isChallengeRoundGraderEnabled(
              c.env?.CHALLENGE_ROUND_GRADER_ENABLED,
            ),
          },
          createSseResponse: (handler) => streamSSEUtf8(c, handler),
          deps: {
            streamMessage,
            processMessage,
            refundQuotaOrEscalate,
            markPersisted,
            sendEmptyReplyFallbackEvent: async (event) =>
              safeSend(
                () =>
                  inngest.send({
                    name: 'app/exchange.empty_reply_fallback',
                    data: {
                      sessionId: event.sessionId,
                      profileId: event.profileId,
                      flow: 'session',
                      exchangeCount: event.exchangeCount,
                      reason: event.reason,
                    },
                  }),
                'sessions.stream.empty_reply_fallback',
                {
                  sessionId: event.sessionId,
                  profileId: event.profileId,
                  reason: event.reason,
                },
              ),
            logger,
            captureException,
            addBreadcrumb,
          },
        });
      } catch (err) {
        if (err instanceof SessionExchangeLimitError) {
          return apiError(
            c,
            429,
            ERROR_CODES.EXCHANGE_LIMIT_EXCEEDED,
            err.message,
          );
        }
        // [WI-2372] Consent withdrawn — gate threw before any streaming began.
        if (err instanceof ConsentWithdrawnError) {
          return apiError(c, 403, ERROR_CODES.CONSENT_WITHDRAWN, err.message);
        }
        throw err;
      }
    },
  )

  // Close a session
  .post(
    '/sessions/:sessionId/close',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', sessionCloseSchema),
    async (c) => {
      // [WI-171 / DS-082] Server-derived proxy-mode write guard.
      // close persists session state + dispatches the completion event
      // (DeepSec Found-In lines 1020, 1056).
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const body = c.req.valid('json');

      // [ASSUMP-F5-sweep] Only 'pending' and 'skipped' are valid client-declared
      // summaryStatus values. 'accepted' and 'submitted' are server-side
      // transitions (summary evaluation → session-completed pipeline).
      // 'auto_closed' is set exclusively by the stale-session cleanup job.
      // If a tampered client sends 'accepted', it would bypass the summary
      // review gate and trigger the completion pipeline prematurely (XP,
      // retention, vocabulary extraction) without the learner ever writing
      // a summary. Silently downgrade to undefined so closeSession falls
      // back to its default logic.
      const sanitizedSummaryStatus =
        body.summaryStatus === 'pending' || body.summaryStatus === 'skipped'
          ? body.summaryStatus
          : undefined;

      const result = await closeSession(
        db,
        profileId,
        c.req.valid('param').sessionId,
        { ...body, summaryStatus: sanitizedSummaryStatus },
      );

      if (
        result.message === 'Session closed' ||
        result.message === 'Session auto-closed'
      ) {
        await dispatchClosePathAutoFileIfEligible(
          db,
          profileId,
          result.sessionId,
        );
      }

      // BUG-398: stale-session cron owns the dispatch for auto_closed; exclude here to prevent double-fire
      const shouldDispatchCompletionEvent =
        result.summaryStatus !== 'pending' &&
        result.summaryStatus !== 'submitted' &&
        result.summaryStatus !== 'auto_closed';

      // BD-09: Surface pipeline status so client knows if post-processing was queued.
      // Default false — only true when dispatch actually succeeds.
      let pipelineQueued = false;
      if (shouldDispatchCompletionEvent) {
        const dispatch = await dispatchSessionCompletedEvent(
          db,
          profileId,
          result.sessionId,
          {
            summaryStatus: result.summaryStatus,
          },
        );
        pipelineQueued = dispatch.pipelineQueued;
      }

      return c.json({
        ...result,
        pipelineQueued,
      });
    },
  )

  .post(
    '/sessions/:sessionId/system-prompt',
    zValidator('param', sessionIdParamsSchema),
    // WI-373: the client sends a typed intent, never free-form system text.
    // The schema rejects any `content` field (the former injection vector).
    zValidator('json', systemPromptIntentSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const intent = c.req.valid('json');

      // Server owns the prompt text: recordSystemPrompt resolves the intent to
      // the canonical string and stamps provenance (metadata.source='server').
      await recordSystemPrompt(
        db,
        profileId,
        c.req.valid('param').sessionId,
        intent,
      );
      return c.json({ ok: true });
    },
  )

  .post(
    '/sessions/:sessionId/events',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', sessionAnalyticsEventSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const body = c.req.valid('json');

      await recordSessionEvent(
        db,
        profileId,
        c.req.valid('param').sessionId,
        body,
      );
      return c.json({ ok: true });
    },
  )

  .post(
    '/sessions/:sessionId/input-mode',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', sessionInputModeSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const session = await setSessionInputMode(
        db,
        profileId,
        c.req.valid('param').sessionId,
        c.req.valid('json'),
      );
      return c.json({ session: learningSessionSchema.parse(session) });
    },
  )

  // Sync homework problem metadata + analytics events
  .post(
    '/sessions/:sessionId/homework-state',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', homeworkStateSyncSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);

      const result = await syncHomeworkState(
        db,
        profileId,
        c.req.valid('param').sessionId,
        c.req.valid('json'),
      );

      return c.json(result);
    },
  )

  // Flag content as incorrect
  .post(
    '/sessions/:sessionId/flag',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', contentFlagSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const result = await flagContent(
        db,
        profileId,
        c.req.valid('param').sessionId,
        c.req.valid('json'),
      );
      return c.json(result);
    },
  )

  // Get session summary
  .get(
    '/sessions/:sessionId/summary',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');
      const summary = await getSessionSummary(db, profileId, sessionId, {
        mentorNoticeEnabled: isMentorNoticeEnabled(c.env.MENTOR_NOTICE_ENABLED),
      });
      return c.json({ summary });
    },
  )

  .post(
    '/sessions/:sessionId/summary/skip',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');
      const previousSummary = await getSessionSummary(db, profileId, sessionId);
      const result = await skipSummary(db, profileId, sessionId);

      // BD-09: Surface pipeline status so client knows if post-processing was queued.
      // Default false — only true when dispatch actually succeeds.
      let pipelineQueued = false;
      if (
        !previousSummary ||
        previousSummary.status === 'pending' ||
        previousSummary.status === 'auto_closed'
      ) {
        const dispatch = await dispatchSessionCompletedEvent(
          db,
          profileId,
          sessionId,
          {
            summaryStatus: result.summary.status,
          },
        );
        pipelineQueued = dispatch.pipelineQueued;
      }
      return c.json({
        ...result,
        pipelineQueued,
      });
    },
  )

  // Retry AI feedback for an already-saved learner summary. This route never
  // re-submits content or dispatches session completion side effects.
  .post(
    '/sessions/:sessionId/summary/retry-feedback',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');
      const profileMeta = c.get('profileMeta');
      const result = await retrySummaryFeedback(db, profileId, sessionId, {
        conversationLanguage: parseConversationLanguage(
          profileMeta?.conversationLanguage,
        ),
      });

      return c.json(retrySummaryFeedbackResultSchema.parse(result));
    },
  )

  // Submit learner summary ("Your Words")
  .post(
    '/sessions/:sessionId/summary',
    zValidator('param', sessionIdParamsSchema),
    zValidator('json', summarySubmitSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');
      const previousSummary = await getSessionSummary(db, profileId, sessionId);
      // i18n Phase 1 — thread conversation_language to summary evaluation.
      const summaryProfileMeta = c.get('profileMeta');
      const result = await submitSummary(
        db,
        profileId,
        sessionId,
        c.req.valid('json'),
        {
          conversationLanguage: parseConversationLanguage(
            summaryProfileMeta?.conversationLanguage,
          ),
        },
      );
      // BD-09: Surface pipeline status so client knows if post-processing was queued.
      // Default false — only true when dispatch actually succeeds.
      let pipelineQueued = false;
      if (
        !previousSummary ||
        previousSummary.status === 'pending' ||
        previousSummary.status === 'auto_closed'
      ) {
        const dispatch = await dispatchSessionCompletedEvent(
          db,
          profileId,
          sessionId,
          {
            summaryStatus: result.summary.status,
            ...(result.summary.feedbackStatus === 'available'
              ? {
                  qualityRating: qualityRatingFromSummaryStatus(
                    result.summary.status,
                  ),
                }
              : {}),
          },
        );
        pipelineQueued = dispatch.pipelineQueued;
      }
      return c.json({ ...result, pipelineQueued });
    },
  )

  // Start an interleaved retrieval session (FR92)
  .post(
    '/sessions/interleaved',
    zValidator('json', interleavedSessionStartSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const input = c.req.valid('json');

      try {
        const result = await startInterleavedSession(db, profileId, input);
        return c.json(result, 201);
      } catch (err) {
        if (err instanceof NoInterleavedTopicsError) {
          return apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, err.message);
        }
        throw err;
      }
    },
  )

  // Generate recall bridge questions after homework success (Story 2.7)
  .post(
    '/sessions/:sessionId/recall-bridge',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { sessionId } = c.req.valid('param');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      if (session.sessionType !== 'homework') {
        return apiError(
          c,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Recall bridge is only available for homework sessions',
        );
      }

      if (
        isMentorNoticeEnabled(c.env.MENTOR_NOTICE_ENABLED) &&
        (await getMentorNoticeReceipt(db, profileId, sessionId))
      ) {
        return apiError(
          c,
          409,
          ERROR_CODES.RECALL_BRIDGE_SUPPRESSED,
          'Recall Bridge is suppressed because a mentor notice was captured',
        );
      }

      // i18n Phase 1 — profile-scope middleware exposes the active profile's
      // conversation_language. Forward it so the recall-bridge LLM prose
      // matches the learner's selected UI language.
      const profileMeta = c.get('profileMeta');
      const result = await generateRecallBridge(db, profileId, sessionId, {
        conversationLanguage: parseConversationLanguage(
          profileMeta?.conversationLanguage,
        ),
      });
      // [L8-F9] Validate response shape against the public contract.
      return c.json(recallBridgeResultSchema.parse(result));
    },
  );

function qualityRatingFromSummaryStatus(
  status: 'accepted' | 'submitted',
): number {
  return status === 'accepted' ? 4 : 2;
}

async function dispatchSessionAutoFileRequested(
  profileId: string,
  sessionId: string,
  reason: 'user_requested' | 'retry' | 'restore',
  dispatchId: string,
): Promise<void> {
  const payload = sessionAutoFileRequestedEventSchema.parse({
    profileId,
    sessionId,
    requestedAt: new Date().toISOString(),
    reason,
    dispatchId,
  });

  // core-send: user-initiated Library filing must not show pending work unless queued.
  await inngest.send({
    id: `auto-file-${sessionId}-${dispatchId}`,
    name: 'app/session.auto_file_requested',
    data: payload,
  });
}
