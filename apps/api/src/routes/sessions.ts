import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ConflictError,
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
  RateLimitedError,
  streamFallbackFrameSchema,
} from '@eduagent/schemas';
import { learningSessions, type Database } from '@eduagent/database';
import { and, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { streamSSEUtf8 } from '../services/streaming/sse-utf8';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import {
  startSession,
  SubjectInactiveError,
  SessionExchangeLimitError,
  getSession,
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
} from '../services/session';
import type { LLMTier } from '../services/subscription';
import { notFound, apiError } from '../errors';
import { inngest } from '../inngest/client';
import { safeRefundQuota } from '../services/billing';
import {
  shouldPromptCasualSwitch,
  getSkipWarningFlags,
} from '../services/settings';
import {
  startInterleavedSession,
  NoInterleavedTopicsError,
} from '../services/interleaved';
import { generateRecallBridge } from '../services/recall-bridge';
import { getProfileAgeBracket } from '../services/profile';

const logger = createLogger();
const retryFilingParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

type SessionRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    VOYAGE_API_KEY?: string;
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
  .get('/sessions/resume-nudge', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const nudge = await getResumeNudgeCandidate(db, profileId);
    return c.json({ nudge });
  })
  // Start a new learning session for a subject
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
    }
  )

  // Get session state
  .get('/sessions/:sessionId', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const session = await getSession(db, profileId, c.req.param('sessionId'));
    if (!session) return notFound(c, 'Session not found');
    return c.json({ session });
  })

  .post(
    '/sessions/:sessionId/retry-filing',
    zValidator('param', retryFilingParamsSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId } = c.req.valid('param');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

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
        .returning();

      if (!updated) {
        const fresh = await getSession(db, profileId, sessionId);
        if (!fresh) return notFound(c, 'Session not found');
        if (fresh.filingRetryCount >= 3) {
          throw new RateLimitedError(
            'Retry limit reached for this session.',
            ERROR_CODES.RATE_LIMITED
          );
        }
        throw new ConflictError(
          `Session is not in a retriable state (status: ${
            fresh.filingStatus ?? 'null'
          })`
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
    }
  )

  // Send a message (the core learning exchange)
  .post(
    '/sessions/:sessionId/messages',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subscriptionId = c.get('subscriptionId');

      const llmTier = c.get('llmTier');

      try {
        const result = await processMessage(
          db,
          profileId,
          c.req.param('sessionId'),
          c.req.valid('json'),
          { llmTier, voyageApiKey: c.env.VOYAGE_API_KEY }
        );
        return c.json(result);
      } catch (err) {
        if (err instanceof SessionExchangeLimitError) {
          return apiError(
            c,
            429,
            ERROR_CODES.EXCHANGE_LIMIT_EXCEEDED,
            err.message
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
    }
  )

  .get('/sessions/:sessionId/transcript', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const transcript = await getSessionTranscript(
      db,
      profileId,
      c.req.param('sessionId')
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

    const ageBracket = await getProfileAgeBracket(db, profileId);
    const result = await evaluateSessionDepth(transcript, { ageBracket });
    const learnerWordCount = transcript.exchanges.reduce((sum, exchange) => {
      if (exchange.role !== 'user') return sum;
      return sum + exchange.content.split(/\s+/).filter(Boolean).length;
    }, 0);

    // [A-1] Observability events — no Inngest handler; awaited per CLAUDE.md rule.
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

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      const llmTier = c.get('llmTier');

      try {
        const { stream, onComplete } = await streamMessage(
          db,
          profileId,
          sessionId,
          input,
          { llmTier, voyageApiKey: c.env.VOYAGE_API_KEY }
        );

        return streamSSEUtf8(c, async (sseStream) => {
          // [BUG-866] Track chunk count so we can detect zero-token streams.
          let chunkCount = 0;
          for await (const chunk of stream) {
            if (chunk.trim().length > 0) chunkCount++;
            await sseStream.writeSSE({
              data: JSON.stringify({ type: 'chunk', content: chunk }),
            });
          }

          // [BUG-866] Structured metric on zero-token stream — "silent recovery
          // without escalation is banned" (CLAUDE.md). logger.warn alone is not
          // queryable; captureException makes this event discoverable in Sentry
          // so ops can measure how often the failure mode fires in production.
          if (chunkCount === 0) {
            logger.warn('[sessions/stream] Zero-token stream completed', {
              surface: 'sessions.stream',
              sessionId,
              profileId,
              tokensReceived: 0,
            });
            captureException(new Error('Zero-token stream completed'), {
              profileId,
              extra: {
                surface: 'sessions.stream',
                sessionId,
                tokensReceived: 0,
              },
            });
          }

          try {
            // onComplete reads the raw envelope via rawResponsePromise internally —
            // the clean reply text from the stream is not needed.
            const result = await onComplete();

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
              // Refund quota before emitting frames — safe to call even if the
              // refund itself fails (safeRefundQuota escalates internally).
              if (subscriptionId) {
                await safeRefundQuota(db, subscriptionId, {
                  route: 'sessions.stream.fallback',
                  profileId,
                  sessionId,
                });
              }
              await sseStream.writeSSE({ data: JSON.stringify(frame) });
              await sseStream.writeSSE({
                data: JSON.stringify({
                  type: 'done',
                  exchangeCount: 0,
                  escalationRung: result.escalationRung,
                  expectedResponseMinutes: 0,
                }),
              });
              return;
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
          } catch (err) {
            // [logging sweep] structured logger so PII fields land as JSON context
            logger.error('[sessions/stream] Post-stream processing failed', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
            captureException(err, { profileId, extra: { sessionId } });
            // Refund quota — user should not be charged for a failed exchange
            // [BUG-661 / A-21] safeRefundQuota escalates if the refund itself fails.
            if (subscriptionId) {
              await safeRefundQuota(db, subscriptionId, {
                route: 'sessions.stream.onComplete',
                profileId,
                sessionId,
              });
            }
            await sseStream.writeSSE({
              data: JSON.stringify({
                type: 'error',
                message: 'Failed to save session progress. Please try again.',
              }),
            });
          }
        });
      } catch (err) {
        if (err instanceof SessionExchangeLimitError) {
          return apiError(
            c,
            429,
            ERROR_CODES.EXCHANGE_LIMIT_EXCEEDED,
            err.message
          );
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
    }
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
        { ...body, summaryStatus: sanitizedSummaryStatus }
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
          }
        );
        pipelineQueued = dispatch.pipelineQueued;
      }

      // Check if we should prompt the learner to switch to Casual Explorer
      const promptCasualSwitch = await shouldPromptCasualSwitch(db, profileId);

      return c.json({
        ...result,
        shouldPromptCasualSwitch: promptCasualSwitch,
        pipelineQueued,
      });
    }
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
        body.metadata
      );
      return c.json({ ok: true });
    }
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
    }
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
        c.req.valid('json')
      );
      return c.json({ session });
    }
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
        c.req.valid('json')
      );

      return c.json(result);
    }
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
        c.req.valid('json')
      );
      return c.json(result);
    }
  )

  // Get session summary
  .get('/sessions/:sessionId/summary', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const summary = await getSessionSummary(
      db,
      profileId,
      c.req.param('sessionId')
    );
    return c.json({ summary });
  })

  .post('/sessions/:sessionId/summary/skip', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const previousSummary = await getSessionSummary(
      db,
      profileId,
      c.req.param('sessionId')
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
        }
      );
      pipelineQueued = dispatch.pipelineQueued;
    }
    const {
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
    } = await getSkipWarningFlags(db, profileId);
    return c.json({
      ...result,
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
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
        c.req.param('sessionId')
      );
      const result = await submitSummary(
        db,
        profileId,
        c.req.param('sessionId'),
        c.req.valid('json')
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
              result.summary.status
            ),
            summaryTrackingHandled: true,
          }
        );
        pipelineQueued = dispatch.pipelineQueued;
      }
      return c.json({ ...result, pipelineQueued });
    }
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
    }
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
        'Recall bridge is only available for homework sessions'
      );
    }

    const result = await generateRecallBridge(db, profileId, sessionId);
    return c.json(result);
  });

function qualityRatingFromSummaryStatus(
  status: 'accepted' | 'submitted'
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
  }
): Promise<{ pipelineQueued: boolean }> {
  try {
    const completion = await getSessionCompletionContext(
      db,
      profileId,
      sessionId
    );

    await inngest.send({
      name: 'app/session.completed',
      data: {
        profileId,
        sessionId: completion.sessionId,
        topicId: completion.topicId,
        subjectId: completion.subjectId,
        sessionType: completion.sessionType,
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
