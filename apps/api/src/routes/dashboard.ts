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
  childTopicSnapshotResponseSchema,
  childSessionsResponseSchema,
  childSessionDetailResponseSchema,
  childMemoryResponseSchema,
  childReportsResponseSchema,
  childReportDetailResponseSchema,
  reportViewedResponseSchema,
  weeklyReportsResponseSchema,
  weeklyReportDetailResponseSchema,
  demoDashboardDataSchema,
  progressSummarySchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
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
import {
  assertOwnerAndParentAccess,
  assertOwnerProfile,
  assertParentAccess,
} from '../services/family-access';
import { ForbiddenError, notFound } from '../errors';
import { createLogger } from '../services/logger';
import { isIdentityV2Enabled, isMemoryFactsReadEnabled } from '../config';
import {
  getMemoryProjection,
  toCuratedView,
} from '../services/memory/projection';
import { getProgressSummary } from '../services/progress-summary';
import { getChildTopicSnapshotForParent } from '../services/family-bridge';

type DashboardRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    MEMORY_FACTS_READ_ENABLED?: string;
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

const logger = createLogger();

export const dashboardRoutes = new Hono<DashboardRouteEnv>()
  // Get parent dashboard data
  .get('/dashboard', async (c) => {
    const { db, profileId } = withProfile(c);

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
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth: assert parent->child link at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    // [BUG-62] No consent-visibility gate here. The mobile child-detail screen
    // renders a dedicated consent-restricted panel for PENDING / REQUESTED /
    // WITHDRAWN states using the redacted child object that getChildDetail
    // returns via redactDashboardChild (zeroed metrics, restricted summary,
    // displayName preserved). A 403 at the route entry breaks that path and
    // the parent gets a generic "Try Again / Back to dashboard" error fallback.
    // Sub-routes (inventory, progress-history, sessions, memory, reports) keep
    // their own assertChildDashboardDataVisible guards because they don't have
    // a "restricted view" -- they should not return data at all.
    const child = await getChildDetail(db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(childDetailResponseSchema.parse({ child }));
  })

  .get('/dashboard/children/:profileId/inventory', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    const inventory = await getChildInventory(
      db,
      parentProfileId,
      childProfileId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    return c.json(childInventoryResponseSchema.parse({ inventory }));
  })

  .get('/dashboard/children/:profileId/progress-summary', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    await assertChildDashboardDataVisible(db, childProfileId);

    const summary = await getProgressSummary(
      db,
      parentProfileId,
      childProfileId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    return c.json(progressSummarySchema.parse(summary));
  })

  .get(
    '/dashboard/children/:profileId/progress-history',
    zValidator('query', historyQuerySchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      const query = c.req.valid('query');

      // [BUG-834] Defense-in-depth at route entry.
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
        identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
      });

      const history = await getChildProgressHistory(
        db,
        parentProfileId,
        childProfileId,
        query,
        { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
      );
      return c.json(childProgressHistoryResponseSchema.parse({ history }));
    },
  )

  // Get child's subject detail
  .get('/dashboard/children/:profileId/subjects/:subjectId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const subjectId = c.req.param('subjectId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    const topics = await getChildSubjectTopics(
      db,
      parentProfileId,
      childProfileId,
      subjectId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    return c.json(childSubjectTopicsResponseSchema.parse({ topics }));
  })

  .get('/dashboard/children/:profileId/topics/:topicId/snapshot', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const topicId = c.req.param('topicId');

    // Split from the sibling routes' assertOwnerAndParentAccess: the spec's
    // 404 IDOR contract requires us to hide *existence* of the topic from
    // anyone who is not its parent (linked or not). Owner gating stays 403
    // because non-owners shouldn't reach parent-admin endpoints at all; the
    // parent-link gate and topic-existence both surface as 404.
    // Source: docs/specs/2026-05-23-learn-this-too-bridge.md §Authorization
    // ("404, never 403, never reveal whether the topic ID exists").
    assertOwnerProfile(c);

    // [WP-6] v2 seam: the guardianship-edge guard re-point. Flag-off keeps the
    // legacy family_links route-entry guard + service path intact.
    const identityV2Enabled = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);

    try {
      // GUARD: Do NOT move assertOwnerProfile() inside this try — every
      // ForbiddenError thrown here is converted to 404 below to preserve the
      // IDOR contract. Non-owners must continue to surface as 403 via the
      // global error handler, not as 404.
      // Defense-in-depth: route-entry parent-link check before the service.
      // getChildTopicSnapshotForParent also runs the same guard.
      // [WI-786] Flag-gated: assertParentAccess dispatches to guardianship v2 or
      // legacy family_links based on identityV2Enabled.
      await assertParentAccess(db, parentProfileId, childProfileId, {
        identityV2Enabled,
      });

      const snapshot = await getChildTopicSnapshotForParent(
        db,
        parentProfileId,
        childProfileId,
        topicId,
        { identityV2Enabled },
      );
      if (!snapshot) return notFound(c, 'Topic not found');
      return c.json(childTopicSnapshotResponseSchema.parse({ snapshot }));
    } catch (error) {
      if (error instanceof ForbiddenError) {
        // Audit-log unauthorized parent-link probes. The 404 hides topic
        // existence from non-parents, but without this log an attacker
        // who holds a valid owner token could enumerate child profile
        // UUIDs at zero observable cost — every probe returns an
        // indistinguishable 404. Pattern mirrors `profile_scope.ownership_mismatch`.
        logger.warn('dashboard.snapshot.parent_access_denied', {
          parentProfileId,
          childProfileId,
          topicId,
        });
        return notFound(c, 'Topic not found');
      }
      throw error;
    }
  })

  // List child's sessions
  .get('/dashboard/children/:profileId/sessions', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    return c.json(childSessionsResponseSchema.parse({ sessions }));
  })

  // Single session detail (summary only, no transcript)
  .get('/dashboard/children/:profileId/sessions/:sessionId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const sessionId = c.req.param('sessionId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    const session = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    if (!session) {
      return notFound(c, 'Session not found');
    }
    return c.json(childSessionDetailResponseSchema.parse({ session }));
  })

  // Curated memory view for parent
  .get('/dashboard/children/:profileId/memory', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
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
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    const reports = await getChildReports(db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(childReportsResponseSchema.parse({ reports }));
  })

  .get('/dashboard/children/:profileId/reports/:reportId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    const report = await getChildReportDetail(
      db,
      parentProfileId,
      childProfileId,
      reportId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    if (!report) {
      return notFound(c, 'Report not found');
    }
    return c.json(childReportDetailResponseSchema.parse({ report }));
  })

  .post('/dashboard/children/:profileId/reports/:reportId/view', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });

    await markChildReportViewed(db, parentProfileId, childProfileId, reportId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(reportViewedResponseSchema.parse({ viewed: true }));
  })

  // [BUG-524] Weekly reports
  .get('/dashboard/children/:profileId/weekly-reports', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    await assertChildDashboardDataVisible(db, childProfileId);

    const reports = await listWeeklyReportsForParentChild(
      db,
      parentProfileId,
      childProfileId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    return c.json(weeklyReportsResponseSchema.parse({ reports }));
  })

  .get('/dashboard/children/:profileId/weekly-reports/:reportId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    await assertChildDashboardDataVisible(db, childProfileId);

    const report = await getWeeklyReportForParentChild(
      db,
      parentProfileId,
      childProfileId,
      reportId,
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    if (!report) {
      return notFound(c, 'Report not found');
    }
    return c.json(weeklyReportDetailResponseSchema.parse({ report }));
  })

  .post(
    '/dashboard/children/:profileId/weekly-reports/:reportId/view',
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      const reportId = c.req.param('reportId');

      // [BUG-834] Defense-in-depth at route entry.
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId, {
        identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
      });
      await assertChildDashboardDataVisible(db, childProfileId);

      await markWeeklyReportViewed(
        db,
        parentProfileId,
        childProfileId,
        reportId,
        { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
      );
      return c.json(reportViewedResponseSchema.parse({ viewed: true }));
    },
  )

  // Get demo mode fixture data
  .get('/dashboard/demo', async (c) => {
    return c.json(demoDashboardDataSchema.parse(buildDemoDashboard()));
  });
