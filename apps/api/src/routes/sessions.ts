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
  LlmStreamError,
  RateLimitedError,
  recallBridgeResultSchema,
  SafetyFilterError,
  streamErrorFrameSchema,
  streamFallbackFrameSchema,
  sessionAutoFileRequestedEventSchema,
  UpstreamLlmError,
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
  getSession,
  clearContinuationDepth,
  processMessage,
  streamMessage,
  closeSession,
  flagContent,
  getSessionSummary,
  getSessionCompletionContext,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  skipSummary,
  submitSummary,
  syncHomeworkState,
  setSessionInputMode,
  evaluateSessionDepth,
  getResumeNudgeCandidate,
  claimSessionForFilingRetry,
  markSessionKeptOutOfLibrary,
  requestSessionLibraryFiling,
  restoreSessionForAutoFiling,
  resetFilingForRetry,
  getSubjectSessions,
  dispatchClosePathAutoFileIfEligible,
} from '../services/session';
import type { LLMTier } from '../services/subscription';
import { notFound, apiError } from '../errors';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';
import { safeRefundQuota } from '../services/billing';
import {
  startInterleavedSession,
  NoInterleavedTopicsError,
} from '../services/interleaved';
import { generateRecallBridge } from '../services/recall-bridge';
import { getProfileAgeBracket } from '../services/profile';
import {
  markPersisted,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from '../services/idempotency-marker';
import { CircuitOpenError, parseConversationLanguage } from '../services/llm';
import {
  isChallengeRoundRuntimeEnabled,
  isTopicIntentMatcherEnabled,
  isMemoryFactsReadEnabled,
  isMemoryFactsRelevanceEnabled,
} from '../config';
import { FILING_CONFIG } from '../config/filing';

const logger = createLogger();

// [BUG-98 / A1-MED] Stack traces are no longer included in the fields that
// flow into structured logs (Logpush → Grafana/Datadog). Sentry captures the
// error object directly so the stack is preserved in Sentry's frame view —
// we just don't echo it through logger.error any more, which prevents stack
// leakage through downstream log processors.
function getErrorDebugFields(err: unknown): {
  error: string;
  errorName: string;
  cause?: string;
  causeName?: string;
  circuitKey?: string;
} {
  const cause = err instanceof Error ? err.cause : undefined;
  const circuitKey =
    err instanceof CircuitOpenError
      ? err.circuitKey
      : cause instanceof CircuitOpenError
        ? cause.circuitKey
        : undefined;
  return {
    error: err instanceof Error ? err.message : String(err),
    errorName: err instanceof Error ? err.name : typeof err,
    cause: cause instanceof Error ? cause.message : undefined,
    causeName: cause instanceof Error ? cause.name : undefined,
    circuitKey,
  };
}

function isSafetyFilterError(err: unknown): boolean {
  return (
    err instanceof SafetyFilterError ||
    (err instanceof LlmStreamError && err.cause instanceof SafetyFilterError)
  );
}

/**
 * [BUG-797] Structural shape of the completion/UI fields that a `processMessage`
 * (non-streaming) or `onComplete` (streaming) result carries through to the
 * SSE `done` frame. All three done-frame writers (normal streaming completion,
 * mid-stream non-streaming fallback, pre-stream non-streaming fallback) MUST
 * emit the same set of fields — otherwise interview/onboarding closure and UI
 * hint delivery (`readyToFinish`, `notePrompt`, `notePromptPostSession`,
 * `fluencyDrill`, `confidence`) silently vanish on the degradation paths while
 * the normal path keeps working, making the regression nearly invisible.
 */
interface DoneFrameSource {
  exchangeCount: number;
  escalationRung: number;
  expectedResponseMinutes?: number;
  aiEventId?: string;
  notePrompt?: boolean;
  notePromptPostSession?: boolean;
  fluencyDrill?: unknown;
  confidence?: 'low' | 'medium' | 'high';
  readyToFinish?: boolean;
  challengeRound?: unknown;
  challengeOffer?: { pitch: string };
  draftedNote?: unknown;
}

/**
 * [BUG-797] Single source of truth for the SSE `done` frame payload so the
 * normal streaming completion and both non-streaming fallback paths cannot
 * drift in which completion/UI signals they forward to the client.
 */
function buildDoneFramePayload(source: DoneFrameSource) {
  return {
    type: 'done' as const,
    exchangeCount: source.exchangeCount,
    escalationRung: source.escalationRung,
    expectedResponseMinutes: source.expectedResponseMinutes ?? 0,
    aiEventId: source.aiEventId,
    notePrompt: source.notePrompt || undefined,
    notePromptPostSession: source.notePromptPostSession || undefined,
    fluencyDrill: source.fluencyDrill || undefined,
    confidence: source.confidence || undefined,
    // [#419] Propagate the server-side readyToFinish flag so the streaming /
    // fallback paths reach parity with processMessage (non-streaming).
    readyToFinish: source.readyToFinish ?? undefined,
    challengeRound: source.challengeRound,
    challengeOffer: source.challengeOffer,
    draftedNote: source.draftedNote,
  };
}

// [BUG-CONT-DEPTH-SWEEP] Follow-up: apply zValidator('param', sessionIdParamsSchema)
// to ALL /:sessionId endpoints in this file (GET /sessions/:sessionId,
// /transcript, /evaluate-depth, /recall-bridge, /close, etc.) for consistent
// UUID validation and early rejection of malformed IDs.

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
      const session = await getSession(db, profileId, c.req.param('sessionId'));
      if (!session) return notFound(c, 'Session not found');
      return c.json({ session });
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
      return c.json({ session });
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
        return c.json({ session: updatedSession ?? reset.session });
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
      return c.json({ session: updatedSession });
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

      return c.json({ session });
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

      return c.json({ session: request.session });
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

      return c.json({ session: request.session });
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
      const sessionId = c.req.param('sessionId');
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
      const challengeRoundRuntimeEnabled = isChallengeRoundRuntimeEnabled(
        c.env.CHALLENGE_ROUND_RUNTIME_ENABLED,
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

        // Refund quota on LLM failure — user should not be charged for a failed exchange
        // [BUG-661 / A-21] safeRefundQuota escalates if the refund itself fails.
        // [CR-2026-05-19-C6] Thread source/topUpCreditId so top-up refunds
        // credit the original batch instead of inflating monthly quota.
        if (subscriptionId) {
          await safeRefundQuota(db, subscriptionId, {
            route: 'sessions.message',
            profileId,
            source: c.get('quotaDecrementSource'),
            quotaModel: c.get('quotaDecrementQuotaModel'),
            topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
          });
        }
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
        c.req.param('sessionId'),
      );
      if (!transcript) return notFound(c, 'Session not found');
      return c.json(transcript);
    },
  )

  .post(
    '/sessions/:sessionId/evaluate-depth',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const sessionId = c.req.param('sessionId');
      const transcript = await getSessionTranscript(db, profileId, sessionId);
      if (!transcript) return notFound(c, 'Session not found');
      if (transcript.archived) {
        return apiError(
          c,
          410,
          ERROR_CODES.SESSION_ARCHIVED,
          'Session transcript has been archived',
        );
      }

      const ageBracket = await getProfileAgeBracket(db, profileId);
      const result = await evaluateSessionDepth(transcript, { ageBracket });
      const learnerWordCount = transcript.exchanges.reduce((sum, exchange) => {
        if (exchange.role !== 'user') return sum;
        return sum + exchange.content.split(/\s+/).filter(Boolean).length;
      }, 0);

      // [A-1] [BUG-653] Observability events — consumed by ask-gate-observe.ts.
      // safeSend isolates the dispatch: the depth result is already in hand and is
      // what the client asked for; a dispatch hiccup must not fail the request.
      // Both events are independent calls so a failure on the first does not
      // suppress the second.
      await safeSend(
        () =>
          inngest.send({
            name: 'app/ask.gate_decision',
            data: {
              sessionId,
              meaningful: result.meaningful,
              reason: result.reason,
              method: result.method,
              exchangeCount: transcript.session.exchangeCount,
              learnerWordCount,
              topicCount: result.topics.length,
            },
          }),
        'ask.gate_decision',
        { sessionId, profileId, method: result.method },
      );

      if (result.method === 'fail_open') {
        await safeSend(
          () =>
            inngest.send({
              name: 'app/ask.gate_timeout',
              data: {
                sessionId,
                exchangeCount: transcript.session.exchangeCount,
              },
            }),
          'ask.gate_timeout',
          { sessionId, profileId },
        );
      }

      return c.json(result);
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
      const sessionId = c.req.param('sessionId');
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
      const challengeRoundRuntimeEnabled = isChallengeRoundRuntimeEnabled(
        c.env.CHALLENGE_ROUND_RUNTIME_ENABLED,
      );

      try {
        const { stream, onComplete } = await streamMessage(
          db,
          profileId,
          sessionId,
          input,
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
          },
        );

        return streamSSEUtf8(c, async (sseStream) => {
          // [BUG-866] Track chunk count so we can detect zero-token streams.
          let chunkCount = 0;
          try {
            for await (const chunk of stream) {
              if (chunk.trim().length > 0) chunkCount++;
              await sseStream.writeSSE({
                data: JSON.stringify({ type: 'chunk', content: chunk }),
              });
            }
          } catch (streamErr) {
            const debugFields = getErrorDebugFields(streamErr);
            logger.error('[sessions/stream] LLM stream failed', {
              surface: 'sessions.stream',
              phase: 'llm_stream_drain',
              sessionId,
              profileId,
              chunkCount,
              ...debugFields,
            });
            captureException(streamErr, {
              profileId,
              extra: {
                sessionId,
                phase: 'llm_stream',
                chunkCount,
                circuitKey: debugFields.circuitKey,
                errorName: debugFields.errorName,
                causeName: debugFields.causeName,
              },
            });

            if (
              !(streamErr instanceof RateLimitedError) &&
              !isSafetyFilterError(streamErr)
            ) {
              logger.warn(
                chunkCount === 0
                  ? '[sessions/stream] Stream failed before visible text; trying non-streaming fallback'
                  : '[sessions/stream] Stream failed after visible text; replacing partial reply with non-streaming fallback',
                {
                  sessionId,
                  chunkCount,
                  profileId,
                  circuitKey: debugFields.circuitKey,
                  error: debugFields.error,
                  errorName: debugFields.errorName,
                  causeName: debugFields.causeName,
                },
              );
              try {
                const fallback = await processMessage(
                  db,
                  profileId,
                  sessionId,
                  input,
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
                  },
                );
                const eventType = chunkCount === 0 ? 'chunk' : 'replace';
                await sseStream.writeSSE({
                  data: JSON.stringify({
                    type: eventType,
                    content: fallback.response,
                  }),
                });
                // [BUG-797] Mirror the full completion/UI signal set the
                // normal streaming done frame sends — readyToFinish, notePrompt,
                // notePromptPostSession, fluencyDrill, confidence — so
                // interview/onboarding closure and UI hints survive the
                // mid-stream non-streaming fallback path.
                await sseStream.writeSSE({
                  data: JSON.stringify(buildDoneFramePayload(fallback)),
                });
                await markPersisted({
                  kv: c.env.IDEMPOTENCY_KV,
                  profileId,
                  flow: 'session',
                  key: clientId,
                });
                return;
              } catch (fallbackErr) {
                const fallbackDebugFields = getErrorDebugFields(fallbackErr);
                logger.error(
                  '[sessions/stream] Non-streaming fallback failed',
                  {
                    surface: 'sessions.stream',
                    phase: 'llm_stream_fallback',
                    sessionId,
                    profileId,
                    parentErrorName: debugFields.errorName,
                    parentCircuitKey: debugFields.circuitKey,
                    ...fallbackDebugFields,
                  },
                );
                captureException(fallbackErr, {
                  profileId,
                  extra: {
                    sessionId,
                    phase: 'llm_stream_non_streaming_fallback',
                    parentErrorName: debugFields.errorName,
                    parentCircuitKey: debugFields.circuitKey,
                    circuitKey: fallbackDebugFields.circuitKey,
                    errorName: fallbackDebugFields.errorName,
                    causeName: fallbackDebugFields.causeName,
                  },
                });
              }
            }

            if (subscriptionId) {
              try {
                await safeRefundQuota(db, subscriptionId, {
                  route: 'sessions.stream.llm_error',
                  profileId,
                  sessionId,
                  // [CR-2026-05-19-C6] Refund to the same pool the decrement
                  // consumed; otherwise top-up consumptions silently inflate
                  // monthly quota on every LLM failure.
                  source: c.get('quotaDecrementSource'),
                  quotaModel: c.get('quotaDecrementQuotaModel'),
                  topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
                });
              } catch (refundErr) {
                captureException(refundErr, {
                  profileId,
                  extra: { sessionId, route: 'sessions.stream.llm_error' },
                });
              }
            }
            // Map error to a stable machine-readable code so clients can
            // classify failures without brittle message parsing.
            const errorCode: string = (() => {
              if (streamErr instanceof RateLimitedError)
                return 'quota_exhausted';
              if (isSafetyFilterError(streamErr)) return 'safety_filter';
              return 'unknown_error';
            })();
            await sseStream.writeSSE({
              data: JSON.stringify(
                streamErrorFrameSchema.parse({
                  type: 'error',
                  code: errorCode,
                  message:
                    'Something went wrong while generating a reply. Please try again.',
                }),
              ),
            });
            return;
          }

          try {
            // onComplete reads the raw envelope via rawResponsePromise internally —
            // the clean reply text from the stream is not needed.
            const result = await onComplete();

            if (chunkCount === 0) {
              const zeroTokenRecovered =
                result.fallback !== undefined ||
                (result.response?.trim().length ?? 0) > 0;
              const zeroTokenRecovery = result.fallback
                ? 'fallback_frame'
                : 'parsed_reply';

              logger.warn('[sessions/stream] Zero-token stream completed', {
                surface: 'sessions.stream',
                sessionId,
                profileId,
                tokensReceived: 0,
                recovered: zeroTokenRecovered,
                recovery: zeroTokenRecovery,
              });
              addBreadcrumb(
                'Zero-token stream completed',
                'sessions.stream',
                'warning',
                {
                  sessionId,
                  tokensReceived: 0,
                  recovered: zeroTokenRecovered,
                  recovery: zeroTokenRecovery,
                },
              );
              captureException(new Error('Zero-token stream completed'), {
                profileId,
                extra: {
                  sessionId,
                  tokensReceived: 0,
                  recovered: zeroTokenRecovered,
                  surface: 'sessions.stream',
                  recovery: zeroTokenRecovery,
                },
              });
            }

            // [BUG-941] If the LLM response was empty or unparseable, emit a
            // typed `fallback` SSE frame so the client shows a meaningful
            // recovery prompt instead of raw envelope JSON. Refund quota because
            // the exchange was not persisted.
            if (result.fallback) {
              // Capture into a const so TS narrowing survives into the async
              // safeSend closure below (property narrowing on `result.fallback`
              // is otherwise reset inside a nested function).
              const fallbackInfo = result.fallback;
              const frame = streamFallbackFrameSchema.parse({
                type: 'fallback',
                reason: fallbackInfo.reason,
                fallbackText: fallbackInfo.fallbackText,
              });
              // Refund quota before emitting frames. safeRefundQuota escalates
              // internally, but if it throws we must still emit the SSE frames
              // so the client is never left with a truncated stream. [M-3]
              if (subscriptionId) {
                try {
                  await safeRefundQuota(db, subscriptionId, {
                    route: 'sessions.stream.fallback',
                    profileId,
                    sessionId,
                    // [CR-2026-05-19-C6] See sessions.stream.llm_error.
                    source: c.get('quotaDecrementSource'),
                    quotaModel: c.get('quotaDecrementQuotaModel'),
                    topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
                  });
                } catch (refundErr) {
                  captureException(refundErr, {
                    profileId,
                    extra: { sessionId, route: 'sessions.stream.fallback' },
                  });
                  logger.error(
                    '[sessions/stream] safeRefundQuota threw in fallback path',
                    {
                      sessionId,
                      error:
                        refundErr instanceof Error
                          ? refundErr.message
                          : String(refundErr),
                    },
                  );
                }
              }
              await sseStream.writeSSE({ data: JSON.stringify(frame) });
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'done',
                  // [CR-PR129-M1] Use the persisted session count — the failed
                  // exchange was not saved, so this is the correct current total.
                  exchangeCount: session.exchangeCount,
                  escalationRung: result.escalationRung,
                  expectedResponseMinutes: 0,
                }),
              });
              // [BUG-796] Dispatch the observability terminus event so the rate
              // of empty-reply / unparseable-envelope fallbacks is queryable via
              // the exchange-empty-reply-fallback Inngest handler. Without this
              // the handler is wired-but-untriggered (worse than dead code per
              // AGENTS.md). Non-core observability: safeSend captures dispatch
              // failure to Sentry without breaking the SSE stream the client has
              // already received. Frames are flushed above, so this only delays
              // stream close by the dispatch round-trip (bounded by safeSend's
              // 2s timeout).
              await safeSend(
                () =>
                  inngest.send({
                    name: 'app/exchange.empty_reply_fallback',
                    data: {
                      sessionId,
                      profileId,
                      flow: 'session',
                      exchangeCount: session.exchangeCount,
                      reason: fallbackInfo.reason,
                    },
                  }),
                'sessions.stream.empty_reply_fallback',
                {
                  sessionId,
                  profileId,
                  reason: fallbackInfo.reason,
                },
              );
              return;
            }

            if (chunkCount === 0 && result.response?.trim()) {
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'chunk',
                  content: result.response,
                }),
              });
            }

            if (chunkCount > 0 && result.sourceReplacement?.trim()) {
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'replace',
                  content: result.sourceReplacement,
                }),
              });
            }

            await sseStream.writeSSE({
              data: JSON.stringify(buildDoneFramePayload(result)),
            });
            await markPersisted({
              kv: c.env.IDEMPOTENCY_KV,
              profileId,
              flow: 'session',
              key: clientId,
            });
          } catch (err) {
            const debugFields = getErrorDebugFields(err);
            // [logging sweep] structured logger so PII fields land as JSON context
            logger.error('[sessions/stream] Post-stream processing failed', {
              surface: 'sessions.stream',
              phase: 'on_complete',
              sessionId,
              profileId,
              chunkCount,
              ...debugFields,
            });
            captureException(err, {
              profileId,
              extra: {
                sessionId,
                phase: 'on_complete',
                chunkCount,
                circuitKey: debugFields.circuitKey,
                errorName: debugFields.errorName,
                causeName: debugFields.causeName,
              },
            });
            // Refund quota — user should not be charged for a failed exchange.
            // Wrap in try/catch: if safeRefundQuota throws, the error frame
            // must still be written so the client is never left hanging. [M-3]
            if (subscriptionId) {
              try {
                await safeRefundQuota(db, subscriptionId, {
                  route: 'sessions.stream.onComplete',
                  profileId,
                  sessionId,
                  // [CR-2026-05-19-C6] See sessions.stream.llm_error.
                  source: c.get('quotaDecrementSource'),
                  quotaModel: c.get('quotaDecrementQuotaModel'),
                  topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
                });
              } catch (refundErr) {
                captureException(refundErr, {
                  profileId,
                  extra: { sessionId, route: 'sessions.stream.onComplete' },
                });
                logger.error(
                  '[sessions/stream] safeRefundQuota threw in onComplete catch',
                  {
                    sessionId,
                    error:
                      refundErr instanceof Error
                        ? refundErr.message
                        : String(refundErr),
                  },
                );
              }
            }
            await sseStream.writeSSE({
              data: JSON.stringify(
                streamErrorFrameSchema.parse({
                  type: 'error',
                  message: 'Failed to save session progress. Please try again.',
                }),
              ),
            });
          }
        });
      } catch (err) {
        const debugFields = getErrorDebugFields(err);
        logger.error('[sessions/stream] Pre-stream setup failed', {
          surface: 'sessions.stream',
          phase: 'pre_stream_setup',
          sessionId,
          profileId,
          ...debugFields,
        });
        if (err instanceof SessionExchangeLimitError) {
          return apiError(
            c,
            429,
            ERROR_CODES.EXCHANGE_LIMIT_EXCEEDED,
            err.message,
          );
        }

        const isUpstreamLlmError =
          err instanceof UpstreamLlmError ||
          err instanceof CircuitOpenError ||
          (err instanceof LlmStreamError &&
            (err.cause instanceof UpstreamLlmError ||
              err.cause instanceof CircuitOpenError));
        if (
          !(err instanceof RateLimitedError) &&
          !isSafetyFilterError(err) &&
          !isUpstreamLlmError
        ) {
          logger.warn(
            '[sessions/stream] Pre-stream setup failed; trying non-streaming fallback',
            {
              sessionId,
              profileId,
              circuitKey: debugFields.circuitKey,
              error: debugFields.error,
              errorName: debugFields.errorName,
              causeName: debugFields.causeName,
            },
          );
          try {
            const fallback = await processMessage(
              db,
              profileId,
              sessionId,
              input,
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
              },
            );
            return streamSSEUtf8(c, async (sseStream) => {
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'chunk',
                  content: fallback.response,
                }),
              });
              // [BUG-797] Mirror the full completion/UI signal set the normal
              // streaming done frame sends so interview/onboarding closure and
              // UI hints survive the pre-stream non-streaming fallback path.
              await sseStream.writeSSE({
                data: JSON.stringify(buildDoneFramePayload(fallback)),
              });
              await markPersisted({
                kv: c.env.IDEMPOTENCY_KV,
                profileId,
                flow: 'session',
                key: clientId,
              });
            });
          } catch (fallbackErr) {
            const fallbackDebugFields = getErrorDebugFields(fallbackErr);
            logger.error(
              '[sessions/stream] Pre-stream non-streaming fallback failed',
              {
                surface: 'sessions.stream',
                phase: 'pre_stream_fallback',
                sessionId,
                profileId,
                parentErrorName: debugFields.errorName,
                parentCircuitKey: debugFields.circuitKey,
                ...fallbackDebugFields,
              },
            );
            captureException(fallbackErr, {
              profileId,
              extra: {
                sessionId,
                phase: 'llm_pre_stream_non_streaming_fallback',
                parentErrorName: debugFields.errorName,
                parentCircuitKey: debugFields.circuitKey,
                circuitKey: fallbackDebugFields.circuitKey,
                errorName: fallbackDebugFields.errorName,
                causeName: fallbackDebugFields.causeName,
              },
            });
          }
        }

        // Refund quota on LLM failure — user should not be charged for a failed exchange
        // [BUG-661 / A-21] safeRefundQuota escalates if the refund itself fails.
        // [CR-2026-05-19-C6] See sessions.stream.llm_error for pool-routing
        // rationale.
        if (subscriptionId) {
          await safeRefundQuota(db, subscriptionId, {
            route: 'sessions.stream',
            profileId,
            sessionId,
            source: c.get('quotaDecrementSource'),
            quotaModel: c.get('quotaDecrementQuotaModel'),
            topUpCreditId: c.get('quotaDecrementTopUpCreditId'),
          });
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
        c.req.param('sessionId'),
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
      await recordSystemPrompt(db, profileId, c.req.param('sessionId'), intent);
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

      await recordSessionEvent(db, profileId, c.req.param('sessionId'), body);
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
        c.req.param('sessionId'),
        c.req.valid('json'),
      );
      return c.json({ session });
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
        c.req.param('sessionId'),
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
        c.req.param('sessionId'),
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
      const summary = await getSessionSummary(db, profileId, sessionId);
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
            qualityRating: qualityRatingFromSummaryStatus(
              result.summary.status,
            ),
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

/**
 * [BUG-153] Dispatches the CORE app/session.completed event that drives the
 * entire post-session pipeline (retention scoring, XP, streaks, embeddings,
 * memory extraction, dashboard rollups). A silent drop here was producing
 * stranded sessions — the user finished the session, but their streak,
 * memories, and dashboard never updated. Per AGENTS.md
 * "Silent recovery without escalation is banned" AND the explicit
 * core-send vs safe-non-core rule: this is a CORE dispatch and dispatch
 * failure MUST short-circuit the user action so the client retries.
 *
 * Returns `{ pipelineQueued: true }` on success — kept for response shape
 * compatibility with callers that include it in the response body. On
 * failure, the error propagates (captured first for Sentry context) so
 * the global onError handler converts it into a 5xx the client can retry.
 *
 * core-send: pipeline integrity — silent drop breaks dashboard/streaks/memory
 */
async function dispatchSessionCompletedEvent(
  db: Database,
  profileId: string,
  sessionId: string,
  options: {
    summaryStatus:
      | 'pending'
      | 'submitted'
      | 'accepted'
      | 'skipped'
      | 'auto_closed';
    qualityRating?: number;
  },
): Promise<{ pipelineQueued: boolean }> {
  const completion = await getSessionCompletionContext(
    db,
    profileId,
    sessionId,
  );

  try {
    // core-send: pipeline integrity — silent drop breaks dashboard/streaks/memory
    // [BUG-820] Inngest event-key dedup. Three routes can reach this dispatch
    // without idempotency middleware: POST /sessions/:id/close, /summary,
    // and /summary/skip. closeSession's CAS at session-crud.ts only protects
    // the DB write — `summaryStatus='skipped'` is not in the early-exit set,
    // so a retried /close (mobile retry, proxy retry, double-tap) re-runs
    // the dispatch. Without an explicit `id:`, Inngest treats each send as
    // a new event and the entire post-session pipeline (XP, streaks, memory
    // extraction, retention scoring, embeddings) double-applies. Keying by
    // (sessionId, summaryStatus) lets a legitimate status transition (e.g.
    // 'skipped' → 'submitted') still dispatch once per transition while a
    // retry within the same transition is deduped by Inngest.
    await inngest.send({
      id: `session-completed-${completion.sessionId}-${options.summaryStatus}`,
      name: 'app/session.completed',
      data: {
        profileId,
        sessionId: completion.sessionId,
        topicId: completion.topicId,
        subjectId: completion.subjectId,
        sessionType: completion.sessionType,
        ...(completion.mode ? { mode: completion.mode } : {}),
        verificationType: completion.verificationType,
        interleavedTopicIds: completion.interleavedTopicIds,
        escalationRungs: completion.escalationRungs,
        exchangeCount: completion.exchangeCount,
        summaryStatus: options.summaryStatus,
        ...(options.qualityRating != null
          ? { qualityRating: options.qualityRating }
          : {}),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Capture context BEFORE rethrowing so Sentry has the session/profile
    // attached. The global onError handler will also see the throw and
    // return a 5xx to the client so it retries — exactly what we want for
    // a CORE event whose silent drop breaks the entire post-session
    // pipeline (retention, XP, streaks, embeddings, memory).
    captureException(err, {
      profileId,
      extra: {
        sessionId,
        event: 'sessions.dispatch_completed_failed',
        summaryStatus: options.summaryStatus,
      },
    });
    logger.error('[sessions] CORE app/session.completed dispatch failed', {
      sessionId,
      profileId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return { pipelineQueued: true };
}
