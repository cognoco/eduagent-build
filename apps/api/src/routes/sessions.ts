import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  sessionStartSchema,
  sessionMessageSchema,
  sessionCloseSchema,
  contentFlagSchema,
  sessionAnalyticsEventSchema,
  summarySubmitSchema,
  interleavedSessionStartSchema,
  homeworkStateSyncSchema,
  systemPromptBodySchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { streamSSE } from 'hono/streaming';
import { captureException } from '../services/sentry';
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
} from '../services/session';
import { notFound, apiError } from '../errors';
import { inngest } from '../inngest/client';
import { incrementQuota } from '../services/billing';
import {
  shouldPromptCasualSwitch,
  shouldWarnSummarySkip,
} from '../services/settings';
import { startInterleavedSession } from '../services/interleaved';
import { generateRecallBridge } from '../services/recall-bridge';

type SessionRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    VOYAGE_API_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
    subscriptionId: string;
  };
};

export const sessionRoutes = new Hono<SessionRouteEnv>()
  // Start a new learning session for a subject
  .post(
    '/subjects/:subjectId/sessions',
    zValidator('json', sessionStartSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      const profileId = c.get('profileId') ?? account.id;
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
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const session = await getSession(db, profileId, c.req.param('sessionId'));
    if (!session) return notFound(c, 'Session not found');
    return c.json({ session });
  })

  // Send a message (the core learning exchange)
  .post(
    '/sessions/:sessionId/messages',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subscriptionId = c.get('subscriptionId');

      try {
        const result = await processMessage(
          db,
          profileId,
          c.req.param('sessionId'),
          c.req.valid('json')
        );
        return c.json(result);
      } catch (err) {
        if (err instanceof SessionExchangeLimitError) {
          return apiError(c, 429, ERROR_CODES.VALIDATION_ERROR, err.message);
        }
        // Refund quota on LLM failure — user should not be charged for a failed exchange
        if (subscriptionId) {
          await incrementQuota(db, subscriptionId);
        }
        throw err;
      }
    }
  )

  .get('/sessions/:sessionId/transcript', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const transcript = await getSessionTranscript(
      db,
      profileId,
      c.req.param('sessionId')
    );
    if (!transcript) return notFound(c, 'Session not found');
    return c.json(transcript);
  })

  // Stream a message response via SSE
  .post(
    '/sessions/:sessionId/stream',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subscriptionId = c.get('subscriptionId');
      const sessionId = c.req.param('sessionId');
      const input = c.req.valid('json');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

      try {
        const { stream, onComplete } = await streamMessage(
          db,
          profileId,
          sessionId,
          input
        );

        return streamSSE(c, async (sseStream) => {
          let fullResponse = '';

          for await (const chunk of stream) {
            fullResponse += chunk;
            await sseStream.writeSSE({
              data: JSON.stringify({ type: 'chunk', content: chunk }),
            });
          }

          const result = await onComplete(fullResponse);
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              exchangeCount: result.exchangeCount,
              escalationRung: result.escalationRung,
              expectedResponseMinutes: result.expectedResponseMinutes,
              aiEventId: result.aiEventId,
            }),
          });
        });
      } catch (err) {
        // Refund quota on LLM failure — user should not be charged for a failed exchange
        if (subscriptionId) {
          await incrementQuota(db, subscriptionId);
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
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const body = c.req.valid('json');
      const result = await closeSession(
        db,
        profileId,
        c.req.param('sessionId'),
        body
      );

      const shouldDispatchCompletionEvent =
        result.summaryStatus !== 'pending' &&
        result.summaryStatus !== 'submitted';
      if (shouldDispatchCompletionEvent) {
        await dispatchSessionCompletedEvent(db, profileId, result.sessionId, {
          summaryStatus: result.summaryStatus,
          summaryTrackingHandled: result.summaryStatus === 'skipped',
        });
      }

      // Check if we should prompt the learner to switch to Casual Explorer
      const promptCasualSwitch = await shouldPromptCasualSwitch(db, profileId);

      return c.json({
        ...result,
        shouldPromptCasualSwitch: promptCasualSwitch,
      });
    }
  )

  .post(
    '/sessions/:sessionId/system-prompt',
    zValidator('json', systemPromptBodySchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
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
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const body = c.req.valid('json');

      await recordSessionEvent(db, profileId, c.req.param('sessionId'), body);
      return c.json({ ok: true });
    }
  )

  // Sync homework problem metadata + analytics events
  .post(
    '/sessions/:sessionId/homework-state',
    zValidator('json', homeworkStateSyncSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;

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
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
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
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const summary = await getSessionSummary(
      db,
      profileId,
      c.req.param('sessionId')
    );
    return c.json({ summary });
  })

  .post('/sessions/:sessionId/summary/skip', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const previousSummary = await getSessionSummary(
      db,
      profileId,
      c.req.param('sessionId')
    );
    const result = await skipSummary(db, profileId, c.req.param('sessionId'));
    if (
      !previousSummary ||
      previousSummary.status === 'pending' ||
      previousSummary.status === 'auto_closed'
    ) {
      await dispatchSessionCompletedEvent(
        db,
        profileId,
        c.req.param('sessionId'),
        {
          summaryStatus: result.summary.status,
          summaryTrackingHandled: true,
        }
      );
    }
    const promptCasualSwitch = await shouldPromptCasualSwitch(db, profileId);
    const warnSummarySkip = promptCasualSwitch
      ? false
      : await shouldWarnSummarySkip(db, profileId);
    return c.json({
      ...result,
      shouldPromptCasualSwitch: promptCasualSwitch,
      shouldWarnSummarySkip: warnSummarySkip,
    });
  })

  // Submit learner summary ("Your Words")
  .post(
    '/sessions/:sessionId/summary',
    zValidator('json', summarySubmitSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
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
      if (
        !previousSummary ||
        previousSummary.status === 'pending' ||
        previousSummary.status === 'auto_closed'
      ) {
        await dispatchSessionCompletedEvent(
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
      }
      return c.json(result);
    }
  )

  // Start an interleaved retrieval session (FR92)
  .post(
    '/sessions/interleaved',
    zValidator('json', interleavedSessionStartSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const input = c.req.valid('json');

      try {
        const result = await startInterleavedSession(db, profileId, input);
        return c.json(result, 201);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === 'No topics available for interleaved retrieval'
        ) {
          return apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, err.message);
        }
        throw err;
      }
    }
  )

  // Generate recall bridge questions after homework success (Story 2.7)
  .post('/sessions/:sessionId/recall-bridge', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
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
): Promise<void> {
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
  } catch (err) {
    captureException(err, {
      profileId,
      extra: { sessionId },
    });
    console.warn(
      `[sessions] Failed to dispatch session.completed event for ${sessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
