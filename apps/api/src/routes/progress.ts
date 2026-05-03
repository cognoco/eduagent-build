import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  getSubjectProgress,
  getTopicProgress,
  getOverallProgress,
  getContinueSuggestion,
  getLearningResumeTarget,
  getActiveSessionForTopic,
  resolveTopicSubject,
} from '../services/progress';
import { getOverdueTopicsGrouped } from '../services/overdue-topics';
import { getProfileOverdueCount } from '../services/retention-data';
import { notFound } from '../errors';
import {
  subjectProgressEndpointResponseSchema,
  topicProgressEndpointResponseSchema,
  progressOverviewResponseSchema,
  reviewSummaryResponseSchema,
  overdueTopicsResponseSchema,
  activeSessionResponseSchema,
  topicResolveResponseSchema,
  resumeTargetResponseSchema,
  continueSuggestionResponseSchema,
} from '@eduagent/schemas';

type ProgressRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const progressRoutes = new Hono<ProgressRouteEnv>()
  // Get subject progress with topic breakdown
  .get('/subjects/:subjectId/progress', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');

    const progress = await getSubjectProgress(db, profileId, subjectId);
    if (!progress) return notFound(c, 'Subject not found');
    return c.json(subjectProgressEndpointResponseSchema.parse({ progress }));
  })

  // Get detailed topic progress
  .get('/subjects/:subjectId/topics/:topicId/progress', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    const topic = await getTopicProgress(db, profileId, subjectId, topicId);
    if (!topic) return notFound(c, 'Topic not found');
    return c.json(topicProgressEndpointResponseSchema.parse({ topic }));
  })

  // Get overall progress across all subjects
  .get('/progress/overview', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const overview = await getOverallProgress(db, profileId);
    return c.json(progressOverviewResponseSchema.parse(overview));
  })

  // Get total overdue review count across the active profile
  .get('/progress/review-summary', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const { overdueCount, nextReviewTopic, nextUpcomingReviewAt } =
      await getProfileOverdueCount(db, profileId);
    return c.json(
      reviewSummaryResponseSchema.parse({
        totalOverdue: overdueCount,
        nextReviewTopic,
        nextUpcomingReviewAt,
      })
    );
  })

  .get('/progress/overdue-topics', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const result = await getOverdueTopicsGrouped(db, profileId);
    return c.json(overdueTopicsResponseSchema.parse(result));
  })

  // Get active/paused session for a specific topic [F-4]
  .get('/progress/topic/:topicId/active-session', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const topicId = c.req.param('topicId');

    const result = await getActiveSessionForTopic(db, profileId, topicId);
    return c.json(activeSessionResponseSchema.parse(result));
  })

  // [F-009] Resolve a topic's parent subject — enables deep-links with topicId only
  .get('/topics/:topicId/resolve', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const topicId = c.req.param('topicId');

    const result = await resolveTopicSubject(db, profileId, topicId);
    if (!result) return notFound(c, 'Topic not found');
    return c.json(topicResolveResponseSchema.parse(result));
  })

  // Get unified "continue learning" target for Home/Library/Progress.
  .get('/progress/resume-target', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.query('subjectId');
    const bookId = c.req.query('bookId');
    const topicId = c.req.query('topicId');

    const target = await getLearningResumeTarget(db, profileId, {
      ...(subjectId ? { subjectId } : {}),
      ...(bookId ? { bookId } : {}),
      ...(topicId ? { topicId } : {}),
    });
    return c.json(resumeTargetResponseSchema.parse({ target }));
  })

  // Get "continue where I left off" suggestion
  .get('/progress/continue', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const suggestion = await getContinueSuggestion(db, profileId);
    return c.json(continueSuggestionResponseSchema.parse({ suggestion }));
  });
