import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import { historyQuerySchema } from '@eduagent/schemas';
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
  getChildSessionDetail,
} from '../services/dashboard';
import { getLearningProfile } from '../services/learner-profile';
import { buildCuratedMemoryView } from '../services/curated-memory';
import { assertParentAccess } from '../services/family-access';

type DashboardRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

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

  // Single session detail (summary only, no transcript)
  .get('/dashboard/children/:profileId/sessions/:sessionId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const sessionId = c.req.param('sessionId');

    const session = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId
    );
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json({ session });
  })

  // Curated memory view for parent
  .get('/dashboard/children/:profileId/memory', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    await assertParentAccess(db, parentProfileId, childProfileId);
    const profile = await getLearningProfile(db, childProfileId);

    if (!profile) {
      // [F-PV-09] No profile = no consent. Both flags off.
      return c.json({
        memory: {
          categories: [],
          parentContributions: [],
          settings: {
            memoryEnabled: true,
            collectionEnabled: false,
            injectionEnabled: false,
            accommodationMode: null,
          },
        },
      });
    }

    const memory = buildCuratedMemoryView(profile);
    return c.json({ memory });
  })

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
          exchangesThisWeek: 0,
          exchangesLastWeek: 0,
          trend: 'up',
          subjects: [
            { name: 'Mathematics', retentionStatus: 'strong' },
            { name: 'Science', retentionStatus: 'fading' },
          ],
          guidedVsImmediateRatio: 0.6,
          retentionTrend: 'stable',
          totalSessions: 12,
          currentStreak: 3,
          longestStreak: 7,
          totalXp: 450,
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
          exchangesThisWeek: 0,
          exchangesLastWeek: 0,
          trend: 'stable',
          subjects: [{ name: 'English', retentionStatus: 'strong' }],
          guidedVsImmediateRatio: 0.3,
          retentionTrend: 'improving',
          totalSessions: 8,
          currentStreak: 1,
          longestStreak: 5,
          totalXp: 280,
        },
      ],
    });
  });
