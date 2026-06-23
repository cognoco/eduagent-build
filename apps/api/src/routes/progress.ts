import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
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
  childSessionsQuerySchema,
  childSessionsPageResponseSchema,
  learningResumeScopeSchema,
  childReportsResponseSchema,
  weeklyReportsResponseSchema,
  childReportDetailResponseSchema,
  weeklyReportDetailResponseSchema,
  reportViewedResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
import { notFound } from '../errors';
import { listProfileSessions } from '../services/session/session-crud';
import {
  getMonthlyReportForProfile,
  listMonthlyReportsForProfile,
  markMonthlyReportViewedForProfile,
} from '../services/monthly-report';
import { getOverdueTopicsGrouped } from '../services/overdue-topics';
import {
  getSubjectProgress,
  getTopicProgress,
  getOverallProgress,
  getContinueSuggestion,
  getLearningResumeTarget,
  getActiveSessionForTopic,
  resolveTopicSubject,
} from '../services/progress';
import { getProfileOverdueCount } from '../services/retention-data';
import {
  getWeeklyReportForProfile,
  listWeeklyReportsForProfile,
  markWeeklyReportViewedForProfile,
} from '../services/weekly-report';

type ProgressRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const progressRoutes = new Hono<ProgressRouteEnv>()
  // Get subject progress with topic breakdown
  .get('/subjects/:subjectId/progress', async (c) => {
    const { db, profileId } = withProfile(c);
    const subjectId = c.req.param('subjectId');

    const progress = await getSubjectProgress(db, profileId, subjectId);
    if (!progress) return notFound(c, 'Subject not found');
    return c.json(subjectProgressEndpointResponseSchema.parse({ progress }));
  })

  // Get detailed topic progress
  .get('/subjects/:subjectId/topics/:topicId/progress', async (c) => {
    const { db, profileId } = withProfile(c);
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');

    const topic = await getTopicProgress(db, profileId, subjectId, topicId);
    if (!topic) return notFound(c, 'Topic not found');
    return c.json(topicProgressEndpointResponseSchema.parse({ topic }));
  })

  // Get overall progress across all subjects
  .get('/progress/overview', async (c) => {
    const { db, profileId } = withProfile(c);

    const overview = await getOverallProgress(db, profileId);
    return c.json(progressOverviewResponseSchema.parse(overview));
  })

  // Get total overdue review count across the active profile
  .get('/progress/review-summary', async (c) => {
    const { db, profileId } = withProfile(c);

    const { overdueCount, nextReviewTopic, nextUpcomingReviewAt } =
      await getProfileOverdueCount(db, profileId);
    return c.json(
      reviewSummaryResponseSchema.parse({
        totalOverdue: overdueCount,
        nextReviewTopic,
        nextUpcomingReviewAt,
      }),
    );
  })

  .get('/progress/overdue-topics', async (c) => {
    const { db, profileId } = withProfile(c);

    const result = await getOverdueTopicsGrouped(db, profileId);
    return c.json(overdueTopicsResponseSchema.parse(result));
  })

  // List sessions for the active profile. Used by /progress self-reporting.
  .get(
    '/progress/sessions',
    zValidator('query', childSessionsQuerySchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const { cursor, limit } = c.req.valid('query');

      const result = await listProfileSessions(db, profileId, {
        cursor,
        limit,
      });
      return c.json(childSessionsPageResponseSchema.parse(result));
    },
  )

  // List monthly reports for the active profile. Parent-facing dashboard
  // routes still enforce parent-child access separately.
  .get('/progress/reports', async (c) => {
    const { db, profileId } = withProfile(c);

    const reports = await listMonthlyReportsForProfile(db, profileId);
    return c.json(childReportsResponseSchema.parse({ reports }));
  })

  // Get a monthly report for the active profile. The service filters on
  // childProfileId = active profile, so self-view links cannot read another
  // profile's report by guessing an ID.
  .get('/progress/reports/:reportId', async (c) => {
    const { db, profileId } = withProfile(c);
    const reportId = c.req.param('reportId');

    const report = await getMonthlyReportForProfile(db, profileId, reportId);
    if (!report) return notFound(c, 'Report not found');
    return c.json(childReportDetailResponseSchema.parse({ report }));
  })

  // [LEARN-29] Mark the active profile's OWN monthly report viewed. Before this
  // route existed the mobile self-view hook POSTed here and got a silent 404 on
  // every open, so viewedAt never persisted and the NEW badge re-fired forever.
  .post('/progress/reports/:reportId/view', async (c) => {
    const { db, profileId } = withProfile(c);
    const reportId = c.req.param('reportId');

    const viewed = await markMonthlyReportViewedForProfile(
      db,
      profileId,
      reportId,
    );
    if (!viewed) return notFound(c, 'Report not found');
    return c.json(reportViewedResponseSchema.parse({ viewed: true }));
  })

  // List weekly reports for the active profile.
  .get('/progress/weekly-reports', async (c) => {
    const { db, profileId } = withProfile(c);

    const reports = await listWeeklyReportsForProfile(db, profileId);
    return c.json(weeklyReportsResponseSchema.parse({ reports }));
  })

  // Get a weekly report for the active profile.
  .get('/progress/weekly-reports/:weeklyReportId', async (c) => {
    const { db, profileId } = withProfile(c);
    const reportId = c.req.param('weeklyReportId');

    const report = await getWeeklyReportForProfile(db, profileId, reportId);
    if (!report) return notFound(c, 'Report not found');
    return c.json(weeklyReportDetailResponseSchema.parse({ report }));
  })

  // [LEARN-29] Mark the active profile's OWN weekly report viewed (self-view
  // twin of the monthly route above; previously a non-existent endpoint).
  .post('/progress/weekly-reports/:weeklyReportId/view', async (c) => {
    const { db, profileId } = withProfile(c);
    const reportId = c.req.param('weeklyReportId');

    const viewed = await markWeeklyReportViewedForProfile(
      db,
      profileId,
      reportId,
    );
    if (!viewed) return notFound(c, 'Report not found');
    return c.json(reportViewedResponseSchema.parse({ viewed: true }));
  })

  // Get active/paused session for a specific topic [F-4]
  .get('/progress/topic/:topicId/active-session', async (c) => {
    const { db, profileId } = withProfile(c);
    const topicId = c.req.param('topicId');

    const result = await getActiveSessionForTopic(db, profileId, topicId);
    return c.json(activeSessionResponseSchema.parse(result));
  })

  // [F-009] Resolve a topic's parent subject — enables deep-links with topicId only
  .get('/topics/:topicId/resolve', async (c) => {
    const { db, profileId } = withProfile(c);
    const topicId = c.req.param('topicId');

    const result = await resolveTopicSubject(db, profileId, topicId);
    if (!result) return notFound(c, 'Topic not found');
    return c.json(topicResolveResponseSchema.parse(result));
  })

  // Get unified "continue learning" target for Home/Library/Progress.
  .get(
    '/progress/resume-target',
    zValidator('query', learningResumeScopeSchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const { subjectId, bookId, topicId } = c.req.valid('query');

      const target = await getLearningResumeTarget(db, profileId, {
        ...(subjectId ? { subjectId } : {}),
        ...(bookId ? { bookId } : {}),
        ...(topicId ? { topicId } : {}),
      });
      return c.json(resumeTargetResponseSchema.parse({ target }));
    },
  )

  // Get "continue where I left off" suggestion
  .get('/progress/continue', async (c) => {
    const { db, profileId } = withProfile(c);

    const suggestion = await getContinueSuggestion(db, profileId);
    return c.json(continueSuggestionResponseSchema.parse({ suggestion }));
  });
