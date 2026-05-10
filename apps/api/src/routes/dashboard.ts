import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import {
  historyQuerySchema,
  dashboardResponseSchema,
  childDetailResponseSchema,
  childInventoryResponseSchema,
  childProgressHistoryResponseSchema,
  childSubjectTopicsResponseSchema,
  childSessionsResponseSchema,
  childSessionDetailResponseSchema,
  childMemoryResponseSchema,
  childReportsResponseSchema,
  childReportDetailResponseSchema,
  reportViewedResponseSchema,
  weeklyReportsResponseSchema,
  weeklyReportDetailResponseSchema,
  demoDashboardDataSchema,
} from '@eduagent/schemas';
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
  assertChildDashboardDataVisible,
  buildDemoDashboard,
} from '../services/dashboard';
import { listPendingNotices } from '../services/notices';
import {
  listWeeklyReportsForParentChild,
  getWeeklyReportForParentChild,
  markWeeklyReportViewed,
} from '../services/weekly-report';
import { assertParentAccess } from '../services/family-access';
import { notFound } from '../errors';
import { isMemoryFactsReadEnabled } from '../config';
import {
  getMemoryProjection,
  toCuratedView,
} from '../services/memory/projection';

type DashboardRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    MEMORY_FACTS_READ_ENABLED?: string;
  };
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

    const [children, pendingNotices] = await Promise.all([
      getChildrenForParent(db, profileId),
      listPendingNotices(db, profileId),
    ]);
    return c.json(
      dashboardResponseSchema.parse({
        children,
        pendingNotices,
        demoMode: false,
      }),
    );
  })

  // Get detailed child data
  .get('/dashboard/children/:profileId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth: assert parent→child link at route entry.
    // Service-layer guard exists, but a route-entry guard guarantees that
    // any future refactor (or a service that forgets the check) cannot
    // become an IDOR. 404 vs 403 are no longer indistinguishable.
    await assertParentAccess(db, parentProfileId, childProfileId);
    await assertChildDashboardDataVisible(db, childProfileId);

    const child = await getChildDetail(db, parentProfileId, childProfileId);
    return c.json(childDetailResponseSchema.parse({ child }));
  })

  .get('/dashboard/children/:profileId/inventory', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);

    const inventory = await getChildInventory(
      db,
      parentProfileId,
      childProfileId,
    );
    return c.json(childInventoryResponseSchema.parse({ inventory }));
  })

  .get(
    '/dashboard/children/:profileId/progress-history',
    zValidator('query', historyQuerySchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      const query = c.req.valid('query');

      // [BUG-834] Defense-in-depth at route entry.
      await assertParentAccess(db, parentProfileId, childProfileId);

      const history = await getChildProgressHistory(
        db,
        parentProfileId,
        childProfileId,
        query,
      );
      return c.json(childProgressHistoryResponseSchema.parse({ history }));
    },
  )

  // Get child's subject detail
  .get('/dashboard/children/:profileId/subjects/:subjectId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const subjectId = c.req.param('subjectId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);

    const topics = await getChildSubjectTopics(
      db,
      parentProfileId,
      childProfileId,
      subjectId,
    );
    return c.json(childSubjectTopicsResponseSchema.parse({ topics }));
  })

  // List child's sessions
  .get('/dashboard/children/:profileId/sessions', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId,
    );
    return c.json(childSessionsResponseSchema.parse({ sessions }));
  })

  // Single session detail (summary only, no transcript)
  .get('/dashboard/children/:profileId/sessions/:sessionId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const sessionId = c.req.param('sessionId');

    // [BUG-834] Defense-in-depth at route entry. Without this, getChildSessionDetail
    // returning null for "not found" is indistinguishable from "forbidden" — a future
    // refactor of the service could leak cross-family session IDs as 404 (enumeration).
    await assertParentAccess(db, parentProfileId, childProfileId);

    const session = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
    );
    if (!session) {
      return notFound(c, 'Session not found');
    }
    return c.json(childSessionDetailResponseSchema.parse({ session }));
  })

  // Curated memory view for parent
  .get('/dashboard/children/:profileId/memory', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    await assertParentAccess(db, parentProfileId, childProfileId);
    await assertChildDashboardDataVisible(db, childProfileId);

    const projection = await getMemoryProjection(db, childProfileId, {
      memoryFactsReadEnabled: isMemoryFactsReadEnabled(
        c.env.MEMORY_FACTS_READ_ENABLED,
      ),
    });

    if (!projection) {
      // [F-PV-09] No profile = no consent. Both flags off.
      return c.json(
        childMemoryResponseSchema.parse({
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
        }),
      );
    }

    return c.json(
      childMemoryResponseSchema.parse({ memory: toCuratedView(projection) }),
    );
  })

  .get('/dashboard/children/:profileId/reports', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);

    const reports = await getChildReports(db, parentProfileId, childProfileId);
    return c.json(childReportsResponseSchema.parse({ reports }));
  })

  .get('/dashboard/children/:profileId/reports/:reportId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);

    const report = await getChildReportDetail(
      db,
      parentProfileId,
      childProfileId,
      reportId,
    );
    if (!report) {
      return notFound(c, 'Report not found');
    }
    return c.json(childReportDetailResponseSchema.parse({ report }));
  })

  .post('/dashboard/children/:profileId/reports/:reportId/view', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);

    await markChildReportViewed(db, parentProfileId, childProfileId, reportId);
    return c.json(reportViewedResponseSchema.parse({ viewed: true }));
  })

  // [BUG-524] Weekly reports
  .get('/dashboard/children/:profileId/weekly-reports', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);
    await assertChildDashboardDataVisible(db, childProfileId);

    const reports = await listWeeklyReportsForParentChild(
      db,
      parentProfileId,
      childProfileId,
    );
    return c.json(weeklyReportsResponseSchema.parse({ reports }));
  })

  .get('/dashboard/children/:profileId/weekly-reports/:reportId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertParentAccess(db, parentProfileId, childProfileId);
    await assertChildDashboardDataVisible(db, childProfileId);

    const report = await getWeeklyReportForParentChild(
      db,
      parentProfileId,
      childProfileId,
      reportId,
    );
    if (!report) {
      return notFound(c, 'Report not found');
    }
    return c.json(weeklyReportDetailResponseSchema.parse({ report }));
  })

  .post(
    '/dashboard/children/:profileId/weekly-reports/:reportId/view',
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      const reportId = c.req.param('reportId');

      // [BUG-834] Defense-in-depth at route entry.
      await assertParentAccess(db, parentProfileId, childProfileId);
      await assertChildDashboardDataVisible(db, childProfileId);

      await markWeeklyReportViewed(
        db,
        parentProfileId,
        childProfileId,
        reportId,
      );
      return c.json(reportViewedResponseSchema.parse({ viewed: true }));
    },
  )

  // Get demo mode fixture data
  .get('/dashboard/demo', async (c) => {
    return c.json(demoDashboardDataSchema.parse(buildDemoDashboard()));
  });
