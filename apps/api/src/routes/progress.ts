import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getSubjectProgress,
  getTopicProgress,
  getOverallProgress,
  getContinueSuggestion,
} from '../services/progress';
import { notFound } from '../errors';

type ProgressRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const progressRoutes = new Hono<ProgressRouteEnv>()
  // Get subject progress with topic breakdown
  .get('/subjects/:subjectId/progress', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    const progress = await getSubjectProgress(db, profileId, subjectId);
    if (!progress) return notFound(c, 'Subject not found');
    return c.json({ progress });
  })

  // Get detailed topic progress
  .get('/subjects/:subjectId/topics/:topicId/progress', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    const topic = await getTopicProgress(db, profileId, subjectId, topicId);
    if (!topic) return notFound(c, 'Topic not found');
    return c.json({ topic });
  })

  // Get overall progress across all subjects
  .get('/progress/overview', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;

    const overview = await getOverallProgress(db, profileId);
    return c.json(overview);
  })

  // Get "continue where I left off" suggestion
  .get('/progress/continue', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;

    const suggestion = await getContinueSuggestion(db, profileId);
    return c.json({ suggestion });
  });
