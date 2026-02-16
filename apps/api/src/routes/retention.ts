import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  recallTestSubmitSchema,
  relearnTopicSchema,
  teachingPreferenceSchema,
} from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const retentionRoutes = new Hono<AuthEnv>()
  // Get retention status for all topics in subject
  .get('/subjects/:subjectId/retention', async (c) => {
    // TODO: Fetch retention cards for all topics in subject via c.req.param('subjectId')
    // TODO: Verify subject belongs to user via c.get('user').userId
    return c.json({ topics: [], reviewDueCount: 0 });
  })

  // Get retention card for single topic
  .get('/topics/:topicId/retention', async (c) => {
    // TODO: Fetch retention card by c.req.param('topicId'), verify ownership via c.get('user').userId
    return c.json({ card: null });
  })

  // Submit a delayed recall test
  .post(
    '/retention/recall-test',
    zValidator('json', recallTestSubmitSchema),
    async (c) => {
      // TODO: Evaluate recall answer via services/retention.ts using c.req.valid('json')
      // TODO: Update SM-2 parameters (easeFactor, interval, repetitions)
      // TODO: Update XP status based on result

      return c.json({
        result: {
          passed: true,
          masteryScore: 0.75,
          xpChange: 'verified',
          nextReviewAt: new Date().toISOString(),
        },
      });
    }
  )

  // Start relearning a topic
  .post(
    '/retention/relearn',
    zValidator('json', relearnTopicSchema),
    async (c) => {
      const { topicId, method } = c.req.valid('json');

      // TODO: Reset mastery score for topic via services/retention.ts
      // TODO: Create new learning session with appropriate teaching method
      // TODO: Mark topic as needs_deepening if not already

      return c.json({ message: 'Relearn started', topicId, method });
    }
  )

  // Get topics needing extra review
  .get('/subjects/:subjectId/needs-deepening', async (c) => {
    // TODO: Query needs_deepening_topics for subject via c.req.param('subjectId')
    // TODO: Verify subject belongs to user via c.get('user').userId
    return c.json({ topics: [], count: 0 });
  })

  // Get teaching method preference
  .get('/subjects/:subjectId/teaching-preference', async (c) => {
    // TODO: Query teaching_preferences for subject via c.req.param('subjectId')
    // TODO: Verify subject belongs to user via c.get('user').userId
    return c.json({ preference: null });
  })

  // Set teaching method preference
  .put(
    '/subjects/:subjectId/teaching-preference',
    zValidator('json', teachingPreferenceSchema),
    async (c) => {
      const subjectId = c.req.param('subjectId');
      const { method } = c.req.valid('json');

      // TODO: Upsert teaching preference via services/adaptive-teaching.ts
      // TODO: Verify subject belongs to user via c.get('user').userId

      return c.json({ preference: { subjectId, method } });
    }
  )

  // Reset teaching preference (FR66)
  .delete('/subjects/:subjectId/teaching-preference', async (c) => {
    // TODO: Delete teaching preference for subject via c.req.param('subjectId')
    // TODO: Verify subject belongs to user via c.get('user').userId
    return c.json({ message: 'Teaching preference reset' });
  });
