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
  systemPromptBodySchema,
  ERROR_CODES,
  filingRetryEventSchema,
  LlmStreamError,
  RateLimitedError,
  SafetyFilterError,
  streamErrorFrameSchema,
  streamFallbackFrameSchema,
  UpstreamLlmError,
  getSubjectSessionsResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { z } from 'zod';
import type { AuthUser } from '../middleware/auth';
import { idempotencyPreflight } from '../middleware/idempotency';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { streamSSEUtf8 } from '../services/streaming/sse-utf8';
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
  getSubjectSessions,
} from '../services/session';
import type { LLMTier } from '../services/subscription';
import { notFound, apiError } from '../errors';
import { inngest } from '../inngest/client';
import { safeRefundQuota } from '../services/billing';
import {
  startInterleavedSession,
  NoInterleavedTopicsError,
} from '../services/interleaved';
import { generateRecallBridge } from '../services/recall-bridge';
import { getProfileAgeBracket } from '../services/profile';
import { markPersisted } from '../services/idempotency-marker';
import {
  isTopicIntentMatcherEnabled,
  isMemoryFactsReadEnabled,
  isMemoryFactsRelevanceEnabled,
} from '../config';

const logger = createLogger();

function isSafetyFilterError(err: unknown): boolean {
  return (
    err instanceof SafetyFilterError ||
    (err instanceof LlmStreamError && err.cause instanceof SafetyFilterError)
  );
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
    llmTier: LLMTier;
  };
};

export const sessionRoutes = new Hono<SessionRouteEnv>()
  .use('/sessions/:sessionId/stream', idempotencyPreflight({ flow: 'session' }))
  .use(
    '/sessions/:sessionId/messages',
    idempotencyPreflight({ flow: 'session' }),
  )
  .get('/sessions/resume-nudge', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const nudge = await getResumeNudgeCandidate(db, profileId);
    return c.json({ nudge });
  })
  // List past sessions for a subject (Past conversations on progress screen)
  .get(
    '/subjects/:subjectId/sessions',
    zValidator('param', z.object({ subjectId: z.string().uuid() })),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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
      const db = c.get('db');
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      const profileId = requireProfileId(c.get('profileId'));
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
        return c.json({ session }, 201);
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
      const db = c.get('db');
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const session = await startSession(db, profileId, subjectId, input);
        return c.json({ session }, 201);
      } catch (err) {
        if (err instanceof SubjectInactiveError) {
          return apiError(c, 403, ERROR_CODES.SUBJECT_INACTIVE, err.message);
        }
        throw err;
      }
    },
  )

  // Get session state
  .get('/sessions/:sessionId', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const session = await getSession(db, profileId, c.req.param('sessionId'));
    if (!session) return notFound(c, 'Session not found');
    return c.json({ session });
  })

  .patch(
    '/sessions/:sessionId/clear-continuation-depth',
    zValidator('param', sessionIdParamsSchema),
    async (c) => {
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId } = c.req.valid('param');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      const updated = await claimSessionForFilingRetry(
        db,
        profileId,
        sessionId,
      );

      if (!updated) {
        const fresh = await getSession(db, profileId, sessionId);
        if (!fresh) return notFound(c, 'Session not found');
        if (fresh.filingRetryCount >= 3) {
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
      await inngest.send({ name: 'app/filing.retry', data: retryPayload });

      const updatedSession = await getSession(db, profileId, sessionId);
      if (!updatedSession) return notFound(c, 'Session not found');
      return c.json({ session: updatedSession });
    },
  )

  // Send a message (the core learning exchange)
  .post(
    '/sessions/:sessionId/messages',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subscriptionId = c.get('subscriptionId');
      const sessionId = c.req.param('sessionId');
      const clientId = c.req.header('Idempotency-Key')?.trim() || undefined;

      const llmTier = c.get('llmTier');
      const memoryFactsReadEnabled = isMemoryFactsReadEnabled(
        c.env.MEMORY_FACTS_READ_ENABLED,
      );
      const memoryFactsRelevanceEnabled =
        memoryFactsReadEnabled &&
        isMemoryFactsRelevanceEnabled(c.env.MEMORY_FACTS_RELEVANCE_RETRIEVAL);

      try {
        const result = await processMessage(
          db,
          profileId,
          sessionId,
          c.req.valid('json'),
          {
            llmTier,
            voyageApiKey: c.env.VOYAGE_API_KEY,
            clientId,
            memoryFactsReadEnabled,
            memoryFactsRelevanceEnabled,
          },
        );
        await markPersisted({
          kv: c.env.IDEMPOTENCY_KV,
          profileId,
          flow: 'session',
          key: clientId,
        });
        return c.json(result);
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
        if (subscriptionId) {
          await safeRefundQuota(db, subscriptionId, {
            route: 'sessions.message',
            profileId,
          });
        }
        throw err;
      }
    },
  )

  .get('/sessions/:sessionId/transcript', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const transcript = await getSessionTranscript(
      db,
      profileId,
      c.req.param('sessionId'),
    );
    if (!transcript) return notFound(c, 'Session not found');
    return c.json(transcript);
  })

  .post('/sessions/:sessionId/evaluate-depth', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
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

    // [A-1] Observability events — consumed by ask-gate-observe.ts (decision +
    // timeout); awaited per CLAUDE.md "Silent recovery without escalation" rule.
    // [BUG-653] Inngest events are observability-only — never fail the request
    // when their delivery hiccups (network blip, rate-limit, partial outage).
    // The depth result is already in hand and is what the client asked for.
    try {
      await inngest.send({
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
      });

      if (result.method === 'fail_open') {
        await inngest.send({
          name: 'app/ask.gate_timeout',
          data: {
            sessionId,
            exchangeCount: transcript.session.exchangeCount,
          },
        });
      }
    } catch (err) {
      // Capture so the silent-recovery rule (CLAUDE.md → "Silent Recovery
      // Without Escalation is Banned") is satisfied — failures here surface
      // in Sentry rather than disappearing into stdout.
      captureException(err, {
        extra: {
          context: 'sessions.evaluate-depth.inngest_send',
          sessionId,
          method: result.method,
        },
      });
    }

    return c.json(result);
  })

  // Stream a message response via SSE
  .post(
    '/sessions/:sessionId/stream',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subscriptionId = c.get('subscriptionId');
      const sessionId = c.req.param('sessionId');
      const input = c.req.valid('json');
      const clientId = c.req.header('Idempotency-Key')?.trim() || undefined;

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      const llmTier = c.get('llmTier');
      const memoryFactsReadEnabled = isMemoryFactsReadEnabled(
        c.env.MEMORY_FACTS_READ_ENABLED,
      );
      const memoryFactsRelevanceEnabled =
        memoryFactsReadEnabled &&
        isMemoryFactsRelevanceEnabled(c.env.MEMORY_FACTS_RELEVANCE_RETRIEVAL);

      try {
        const { stream, onComplete } = await streamMessage(
          db,
          profileId,
          sessionId,
          input,
          {
            llmTier,
            voyageApiKey: c.env.VOYAGE_API_KEY,
            clientId,
            memoryFactsReadEnabled,
            memoryFactsRelevanceEnabled,
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
            const errMsg =
              streamErr instanceof Error
                ? streamErr.message
                : String(streamErr);
            const errStack =
              streamErr instanceof Error ? streamErr.stack : undefined;
            logger.error('[sessions/stream] LLM stream failed', {
              sessionId,
              error: errMsg,
              errorName:
                streamErr instanceof Error ? streamErr.name : typeof streamErr,
              stack: errStack,
            });
            captureException(streamErr, {
              profileId,
              extra: { sessionId, phase: 'llm_stream' },
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
                  error: errMsg,
                  errorName:
                    streamErr instanceof Error
                      ? streamErr.name
                      : typeof streamErr,
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
                    voyageApiKey: c.env.VOYAGE_API_KEY,
                    clientId,
                    memoryFactsReadEnabled,
                    memoryFactsRelevanceEnabled,
                  },
                );
                const eventType = chunkCount === 0 ? 'chunk' : 'replace';
                await sseStream.writeSSE({
                  data: JSON.stringify({
                    type: eventType,
                    content: fallback.response,
                  }),
                });
                await sseStream.writeSSE({
                  data: JSON.stringify({
                    type: 'done',
                    exchangeCount: fallback.exchangeCount,
                    escalationRung: fallback.escalationRung,
                    expectedResponseMinutes:
                      fallback.expectedResponseMinutes ?? 0,
                    aiEventId: fallback.aiEventId,
                  }),
                });
                await markPersisted({
                  kv: c.env.IDEMPOTENCY_KV,
                  profileId,
                  flow: 'session',
                  key: clientId,
                });
                return;
              } catch (fallbackErr) {
                logger.error(
                  '[sessions/stream] Non-streaming fallback failed',
                  {
                    sessionId,
                    error:
                      fallbackErr instanceof Error
                        ? fallbackErr.message
                        : String(fallbackErr),
                    errorName:
                      fallbackErr instanceof Error
                        ? fallbackErr.name
                        : typeof fallbackErr,
                  },
                );
                captureException(fallbackErr, {
                  profileId,
                  extra: {
                    sessionId,
                    phase: 'llm_stream_non_streaming_fallback',
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
              const frame = streamFallbackFrameSchema.parse({
                type: 'fallback',
                reason: result.fallback.reason,
                fallbackText: result.fallback.fallbackText,
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

            await sseStream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                exchangeCount: result.exchangeCount,
                escalationRung: result.escalationRung,
                expectedResponseMinutes: result.expectedResponseMinutes,
                aiEventId: result.aiEventId,
                notePrompt: result.notePrompt || undefined,
                notePromptPostSession:
                  result.notePromptPostSession || undefined,
                fluencyDrill: result.fluencyDrill || undefined,
                confidence: result.confidence || undefined,
              }),
            });
            await markPersisted({
              kv: c.env.IDEMPOTENCY_KV,
              profileId,
              flow: 'session',
              key: clientId,
            });
          } catch (err) {
            // [logging sweep] structured logger so PII fields land as JSON context
            logger.error('[sessions/stream] Post-stream processing failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
            captureException(err, { profileId, extra: { sessionId } });
            // Refund quota — user should not be charged for a failed exchange.
            // Wrap in try/catch: if safeRefundQuota throws, the error frame
            // must still be written so the client is never left hanging. [M-3]
            if (subscriptionId) {
              try {
                await safeRefundQuota(db, subscriptionId, {
                  route: 'sessions.stream.onComplete',
                  profileId,
                  sessionId,
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
        logger.error('[sessions/stream] Pre-stream setup failed', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : typeof err,
          stack: err instanceof Error ? err.stack : undefined,
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
          (err instanceof LlmStreamError &&
            err.cause instanceof UpstreamLlmError);
        if (
          !(err instanceof RateLimitedError) &&
          !isSafetyFilterError(err) &&
          !isUpstreamLlmError
        ) {
          logger.warn(
            '[sessions/stream] Pre-stream setup failed; trying non-streaming fallback',
            {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
              errorName: err instanceof Error ? err.name : typeof err,
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
                voyageApiKey: c.env.VOYAGE_API_KEY,
                clientId,
                memoryFactsReadEnabled,
                memoryFactsRelevanceEnabled,
              },
            );
            return streamSSEUtf8(c, async (sseStream) => {
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'chunk',
                  content: fallback.response,
                }),
              });
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'done',
                  exchangeCount: fallback.exchangeCount,
                  escalationRung: fallback.escalationRung,
                  expectedResponseMinutes:
                    fallback.expectedResponseMinutes ?? 0,
                  aiEventId: fallback.aiEventId,
                }),
              });
              await markPersisted({
                kv: c.env.IDEMPOTENCY_KV,
                profileId,
                flow: 'session',
                key: clientId,
              });
            });
          } catch (fallbackErr) {
            logger.error(
              '[sessions/stream] Pre-stream non-streaming fallback failed',
              {
                sessionId,
                error:
                  fallbackErr instanceof Error
                    ? fallbackErr.message
                    : String(fallbackErr),
                errorName:
                  fallbackErr instanceof Error
                    ? fallbackErr.name
                    : typeof fallbackErr,
              },
            );
            captureException(fallbackErr, {
              profileId,
              extra: {
                sessionId,
                phase: 'llm_pre_stream_non_streaming_fallback',
              },
            });
          }
        }

        // Refund quota on LLM failure — user should not be charged for a failed exchange
        // [BUG-661 / A-21] safeRefundQuota escalates if the refund itself fails.
        if (subscriptionId) {
          await safeRefundQuota(db, subscriptionId, {
            route: 'sessions.stream',
            profileId,
            sessionId,
          });
        }
        throw err;
      }
    },
  )

  // Close a session
  .post(
    '/sessions/:sessionId/close',
    zValidator('json', sessionCloseSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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

      const shouldDispatchCompletionEvent =
        result.summaryStatus !== 'pending' &&
        result.summaryStatus !== 'submitted';

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
            summaryTrackingHandled: result.summaryStatus === 'skipped',
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
    zValidator('json', systemPromptBodySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const body = c.req.valid('json');

      await recordSystemPrompt(
        db,
        profileId,
        c.req.param('sessionId'),
        body.content,
        body.metadata,
      );
      return c.json({ ok: true });
    },
  )

  .post(
    '/sessions/:sessionId/events',
    zValidator('json', sessionAnalyticsEventSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const body = c.req.valid('json');

      await recordSessionEvent(db, profileId, c.req.param('sessionId'), body);
      return c.json({ ok: true });
    },
  )

  .post(
    '/sessions/:sessionId/input-mode',
    zValidator('json', sessionInputModeSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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
    zValidator('json', homeworkStateSyncSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));

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
    zValidator('json', contentFlagSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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
  .get('/sessions/:sessionId/summary', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const summary = await getSessionSummary(
      db,
      profileId,
      c.req.param('sessionId'),
    );
    return c.json({ summary });
  })

  .post('/sessions/:sessionId/summary/skip', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const previousSummary = await getSessionSummary(
      db,
      profileId,
      c.req.param('sessionId'),
    );
    const result = await skipSummary(db, profileId, c.req.param('sessionId'));

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
        c.req.param('sessionId'),
        {
          summaryStatus: result.summary.status,
          summaryTrackingHandled: true,
        },
      );
      pipelineQueued = dispatch.pipelineQueued;
    }
    return c.json({
      ...result,
      pipelineQueued,
    });
  })

  // Submit learner summary ("Your Words")
  .post(
    '/sessions/:sessionId/summary',
    zValidator('json', summarySubmitSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const previousSummary = await getSessionSummary(
        db,
        profileId,
        c.req.param('sessionId'),
      );
      const result = await submitSummary(
        db,
        profileId,
        c.req.param('sessionId'),
        c.req.valid('json'),
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
          c.req.param('sessionId'),
          {
            summaryStatus: result.summary.status,
            qualityRating: qualityRatingFromSummaryStatus(
              result.summary.status,
            ),
            summaryTrackingHandled: true,
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
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
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
  .post('/sessions/:sessionId/recall-bridge', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const sessionId = c.req.param('sessionId');

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

    const result = await generateRecallBridge(db, profileId, sessionId);
    return c.json(result);
  });

function qualityRatingFromSummaryStatus(
  status: 'accepted' | 'submitted',
): number {
  return status === 'accepted' ? 4 : 2;
}

/**
 * BD-09: Returns whether the pipeline was successfully queued.
 * Callers surface `pipelineQueued: false` in the response so the client
 * knows post-processing (retention, XP, streaks, embeddings) may be delayed.
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
    summaryTrackingHandled?: boolean;
  },
): Promise<{ pipelineQueued: boolean }> {
  try {
    const completion = await getSessionCompletionContext(
      db,
      profileId,
      sessionId,
    );

    await inngest.send({
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
        ...(options.summaryTrackingHandled
          ? { summaryTrackingHandled: true }
          : {}),
        timestamp: new Date().toISOString(),
      },
    });

    return { pipelineQueued: true };
  } catch (err) {
    captureException(err, {
      profileId,
      extra: { sessionId },
    });
    logger.warn('[sessions] Failed to dispatch session.completed event', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { pipelineQueued: false };
  }
}
