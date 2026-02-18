import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  sessionStartSchema,
  sessionMessageSchema,
  sessionCloseSchema,
  contentFlagSchema,
  summarySubmitSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { streamSSE } from 'hono/streaming';
import {
  startSession,
  getSession,
  processMessage,
  streamMessage,
  closeSession,
  flagContent,
  getSessionSummary,
  submitSummary,
} from '../services/session';
import { notFound } from '../errors';

type SessionRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
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
      const session = await startSession(db, profileId, subjectId, input);
      return c.json({ session }, 201);
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
      const result = await processMessage(
        db,
        profileId,
        c.req.param('sessionId'),
        c.req.valid('json')
      );
      return c.json(result);
    }
  )

  // Stream a message response via SSE
  .post(
    '/sessions/:sessionId/stream',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const sessionId = c.req.param('sessionId');
      const input = c.req.valid('json');

      const session = await getSession(db, profileId, sessionId);
      if (!session) return notFound(c, 'Session not found');

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
          }),
        });
      });
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
      const result = await closeSession(
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

  // Submit learner summary ("Your Words")
  .post(
    '/sessions/:sessionId/summary',
    zValidator('json', summarySubmitSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const result = await submitSummary(
        db,
        profileId,
        c.req.param('sessionId'),
        c.req.valid('json')
      );
      return c.json(result);
    }
  );
