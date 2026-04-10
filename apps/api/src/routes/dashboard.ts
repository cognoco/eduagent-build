import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  getChildrenForParent,
  getChildInventory,
  getChildDetail,
  getChildProgressHistory,
  getChildReportDetail,
  getChildReports,
  markChildReportViewed,
  getChildSubjectTopics,
  getChildSessions,
  getChildSessionTranscript,
} from '../services/dashboard';

type DashboardRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const historyQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(['daily', 'weekly']).optional(),
});

export const dashboardRoutes = new Hono<DashboardRouteEnv>()
  // Get parent dashboard data
  .get('/dashboard', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const children = await getChildrenForParent(db, profileId);
    return c.json({ children, demoMode: false });
  })

  // Get detailed child data
  .get('/dashboard/children/:profileId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    const child = await getChildDetail(db, parentProfileId, childProfileId);
    return c.json({ child });
  })

  .get('/dashboard/children/:profileId/inventory', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    const inventory = await getChildInventory(
      db,
      parentProfileId,
      childProfileId
    );
    return c.json({ inventory });
  })

  .get(
    '/dashboard/children/:profileId/progress-history',
    zValidator('query', historyQuerySchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      const query = c.req.valid('query');

      const history = await getChildProgressHistory(
        db,
        parentProfileId,
        childProfileId,
        query
      );
      return c.json({ history });
    }
  )

  // Get child's subject detail
  .get('/dashboard/children/:profileId/subjects/:subjectId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const subjectId = c.req.param('subjectId');

    const topics = await getChildSubjectTopics(
      db,
      parentProfileId,
      childProfileId,
      subjectId
    );
    return c.json({ topics });
  })

  // List child's sessions
  .get('/dashboard/children/:profileId/sessions', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId
    );
    return c.json({ sessions });
  })

  // Get session transcript
  .get(
    '/dashboard/children/:profileId/sessions/:sessionId/transcript',
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      const sessionId = c.req.param('sessionId');

      const transcript = await getChildSessionTranscript(
        db,
        parentProfileId,
        childProfileId,
        sessionId
      );
      return c.json({ transcript });
    }
  )

  .get('/dashboard/children/:profileId/reports', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    const reports = await getChildReports(db, parentProfileId, childProfileId);
    return c.json({ reports });
  })

  .get('/dashboard/children/:profileId/reports/:reportId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    const report = await getChildReportDetail(
      db,
      parentProfileId,
      childProfileId,
      reportId
    );
    return c.json({ report });
  })

  .post('/dashboard/children/:profileId/reports/:reportId/view', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    await markChildReportViewed(db, parentProfileId, childProfileId, reportId);
    return c.json({ viewed: true });
  })

  // Get demo mode fixture data
  .get('/dashboard/demo', async (c) => {
    return c.json({
      demoMode: true,
      children: [
        {
          profileId: 'demo-child-1',
          displayName: 'Alex',
          summary:
            'Alex: Math \u2014 5 problems, 3 guided. Science fading. 4 sessions this week (\u2191 from 2 last week).',
          sessionsThisWeek: 4,
          sessionsLastWeek: 2,
          totalTimeThisWeek: 180,
          totalTimeLastWeek: 90,
          trend: 'up',
          subjects: [
            { name: 'Mathematics', retentionStatus: 'strong' },
            { name: 'Science', retentionStatus: 'fading' },
          ],
          guidedVsImmediateRatio: 0.6,
          retentionTrend: 'stable',
        },
        {
          profileId: 'demo-child-2',
          displayName: 'Sam',
          summary:
            'Sam: English \u2014 steady progress. 3 sessions this week (\u2192 same as last week).',
          sessionsThisWeek: 3,
          sessionsLastWeek: 3,
          totalTimeThisWeek: 120,
          totalTimeLastWeek: 115,
          trend: 'stable',
          subjects: [{ name: 'English', retentionStatus: 'strong' }],
          guidedVsImmediateRatio: 0.3,
          retentionTrend: 'improving',
        },
      ],
    });
  });
