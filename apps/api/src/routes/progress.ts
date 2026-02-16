import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

export const progressRoutes = new Hono<AuthEnv>()
  // Get subject progress with topic breakdown
  .get('/subjects/:subjectId/progress', async (c) => {
    const subjectId = c.req.param('subjectId');
    // TODO: Aggregate topic progress, completion vs verification counts
    // TODO: Verify subject belongs to user via c.get('user').userId
    return c.json({
      progress: {
        subjectId,
        name: 'Mock Subject',
        topicsTotal: 10,
        topicsCompleted: 3,
        topicsVerified: 1,
        urgencyScore: 0,
        retentionStatus: 'strong',
        lastSessionAt: null,
      },
    });
  })

  // Get detailed topic progress
  .get('/subjects/:subjectId/topics/:topicId/progress', async (c) => {
    const topicId = c.req.param('topicId');
    // TODO: Fetch retention, mastery, summary, XP for topic
    // TODO: Verify topic belongs to user via c.get('user').userId
    return c.json({
      topic: {
        topicId,
        title: 'Mock Topic',
        description: 'Mock description',
        completionStatus: 'not_started',
        retentionStatus: null,
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
    });
  })

  // Get overall progress across all subjects
  .get('/progress/overview', async (c) => {
    // TODO: Aggregate all subject progress for user via c.get('user').userId
    return c.json({
      subjects: [],
      totalTopicsCompleted: 0,
      totalTopicsVerified: 0,
    });
  })

  // Get "continue where I left off" suggestion
  .get('/progress/continue', async (c) => {
    // TODO: Find last topic in progress for user via c.get('user').userId
    return c.json({ suggestion: null });
  });
