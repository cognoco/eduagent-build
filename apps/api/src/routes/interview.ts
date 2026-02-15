import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { interviewMessageSchema } from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const interviewRoutes = new Hono<AuthEnv>()
  // Start or continue an interview for a subject
  .post(
    '/subjects/:subjectId/interview',
    zValidator('json', interviewMessageSchema),
    async (c) => {
      // TODO: Load or create onboarding draft via c.req.param('subjectId'), call processInterviewExchange with c.req.valid('json')
      return c.json({
        response: 'Mock interview response',
        isComplete: false,
        exchangeCount: 1,
      });
    }
  )
  // Get current interview state
  .get('/subjects/:subjectId/interview', async (c) => {
    // TODO: Look up onboarding draft for this subject via c.req.param('subjectId')
    return c.json({
      state: null, // null means no interview started
    });
  });
