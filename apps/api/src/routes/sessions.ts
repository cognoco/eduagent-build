import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  sessionStartSchema,
  sessionMessageSchema,
  sessionCloseSchema,
  contentFlagSchema,
  summarySubmitSchema,
} from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const sessionRoutes = new Hono<AuthEnv>()
  // Start a new learning session for a subject
  .post(
    '/subjects/:subjectId/sessions',
    zValidator('json', sessionStartSchema),
    async (c) => {
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      const now = new Date().toISOString();

      // TODO: Verify subject belongs to user via c.get('user').userId
      // TODO: Create session record in learning_sessions table
      // TODO: Load topic from curriculum (use input.topicId or pick next topic)

      return c.json(
        {
          session: {
            id: 'placeholder',
            subjectId,
            topicId: input.topicId ?? null,
            sessionType: 'learning' as const,
            status: 'active' as const,
            escalationRung: 1,
            exchangeCount: 0,
            startedAt: now,
            lastActivityAt: now,
            endedAt: null,
            durationSeconds: null,
          },
        },
        201
      );
    }
  )

  // Get session state
  .get('/sessions/:sessionId', async (c) => {
    // TODO: Look up session by c.req.param('sessionId'), verify ownership via c.get('user').userId
    return c.json({ session: null });
  })

  // Send a message (the core learning exchange)
  .post(
    '/sessions/:sessionId/messages',
    zValidator('json', sessionMessageSchema),
    async (c) => {
      // TODO: Load session by c.req.param('sessionId'), verify ownership via c.get('user').userId
      // TODO: Process exchange via services/exchanges.ts using c.req.valid('json')
      // TODO: Persist exchange events to session_events table
      // TODO: Update session state (exchangeCount, lastActivityAt, escalationRung)
      return c.json({
        response: 'Mock AI tutor response',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 1,
      });
    }
  )

  // Close a session
  .post(
    '/sessions/:sessionId/close',
    zValidator('json', sessionCloseSchema),
    async (c) => {
      const sessionId = c.req.param('sessionId');

      // TODO: Update session status to 'completed', set endedAt and durationSeconds
      // TODO: Dispatch app/session.completed Inngest event with session data
      // TODO: Use c.req.valid('json').reason for close reason tracking

      return c.json({ message: 'Session closed', sessionId });
    }
  )

  // Flag content as incorrect
  .post(
    '/sessions/:sessionId/flag',
    zValidator('json', contentFlagSchema),
    async (c) => {
      // TODO: Store flag in content_flags table using c.req.valid('json')
      // TODO: Notify review queue for human moderation
      return c.json({ message: 'Content flagged for review. Thank you!' });
    }
  )

  // Get session summary
  .get('/sessions/:sessionId/summary', async (c) => {
    // TODO: Look up summary by c.req.param('sessionId'), verify ownership via c.get('user').userId
    return c.json({ summary: null });
  })

  // Submit learner summary ("Your Words")
  .post(
    '/sessions/:sessionId/summary',
    zValidator('json', summarySubmitSchema),
    async (c) => {
      const sessionId = c.req.param('sessionId');
      const { content } = c.req.valid('json');

      // TODO: Store summary in session_summaries table
      // TODO: Evaluate via services/summaries.ts and return AI feedback
      // TODO: Update summary status based on evaluation result

      return c.json({
        summary: {
          id: 'placeholder',
          sessionId,
          content,
          aiFeedback: 'Great summary! You captured the key concepts.',
          status: 'accepted' as const,
        },
      });
    }
  );
