import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { topicSkipSchema, curriculumChallengeSchema } from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const curriculumRoutes = new Hono<AuthEnv>()
  // Get curriculum for a subject
  .get('/subjects/:subjectId/curriculum', async (c) => {
    // TODO: Fetch current curriculum with topics via c.req.param('subjectId')
    return c.json({ curriculum: null });
  })
  // Skip a topic
  .post(
    '/subjects/:subjectId/curriculum/skip',
    zValidator('json', topicSkipSchema),
    async (c) => {
      const { topicId } = c.req.valid('json');
      return c.json({ message: 'Topic skipped', topicId });
    }
  )
  // Challenge/regenerate curriculum
  .post(
    '/subjects/:subjectId/curriculum/challenge',
    zValidator('json', curriculumChallengeSchema),
    async (c) => {
      // TODO: Use c.req.valid('json') feedback to regenerate curriculum
      return c.json({ message: 'Curriculum regeneration started' });
    }
  )
  // Explain topic ordering
  .get('/subjects/:subjectId/curriculum/topics/:topicId/explain', async (c) => {
    // TODO: Call LLM to explain pedagogical reasoning via c.req.param('topicId')
    return c.json({ explanation: 'Mock explanation for topic ordering' });
  });
