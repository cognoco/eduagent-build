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
  verifiedProofResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
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
  assertChargeNotCredentialed,
  assertOwnerAndParentAccess,
  assertOwnerProfile,
  assertParentAccess,
  assertCallerIsAccountOwner,
} from '../services/family-access';
import { ForbiddenError, notFound } from '../errors';
import { createLogger } from '../services/logger';
import { isMemoryFactsReadEnabled } from '../config';
import {
  getMemoryProjection,
  toCuratedView,
} from '../services/memory/projection';
import { getProgressSummary } from '../services/progress-summary';
import { getChildTopicSnapshotForParent } from '../services/family-bridge';
import { getLatestVerifiedProofForChild } from '../services/parent-proof';

type DashboardRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    MEMORY_FACTS_READ_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    // [WI-1989] The authenticated caller's own person id, resolved server-side
    // by accountMiddleware — required by assertCallerIsAccountOwner.
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

const logger = createLogger();

export const dashboardRoutes = new Hono<DashboardRouteEnv>()
  // Get parent dashboard data
  .get('/dashboard', async (c) => {
    const { db, profileId } = withProfile(c);

    // [WI-2397] Caller-identity gate — mirrors the WI-1989 gate already on
    // every sibling /dashboard/children/* route. Without this, a same-account
    // non-owner could send X-Profile-Id = the owner's profile id and read the
    // owner's children list + pending notices (cross-ORG reads are already
    // blocked by profileScopeMiddleware's account-scoped resolution — this
    // closes the same-account residual).
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can view the family dashboard.',
    );

    const [children, pendingNotices] = await Promise.all([
      getChildrenForParent(
        db,
        profileId,
        c.get('callerPersonId'),
        c.get('account').id,
      ),
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
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    // [BUG-62] No consent-visibility gate here. The mobile child-detail screen
    // renders a dedicated consent-restricted panel for PENDING / REQUESTED /
    // WITHDRAWN states using the redacted child object that getChildDetail
    // returns via redactDashboardChild (zeroed metrics, restricted summary,
    // displayName preserved). A 403 at the route entry breaks that path and
    // the parent gets a generic "Try Again / Back to dashboard" error fallback.
    // Sub-routes (inventory, progress-history, sessions, memory, reports) keep
    // their own assertChildDashboardDataVisible guards because they don't have
    // a "restricted view" -- they should not return data at all.
    const child = await getChildDetail(
      db,
      parentProfileId,
      childProfileId,
      c.get('callerPersonId'),
      c.get('account').id,
    );
    return c.json(childDetailResponseSchema.parse({ child }));
  })

  .get('/dashboard/children/:profileId/inventory', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const inventory = await getChildInventory(
      db,
      parentProfileId,
      childProfileId,
      c.get('callerPersonId'),
      c.get('account').id,
    );
    return c.json(childInventoryResponseSchema.parse({ inventory }));
  })

  .get('/dashboard/children/:profileId/progress-summary', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );
    await assertChildDashboardDataVisible(db, childProfileId);

    const summary = await getProgressSummary(
      db,
      parentProfileId,
      childProfileId,
      c.get('callerPersonId'),
      c.get('account').id,
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
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
      await assertCallerIsAccountOwner(
        c,
        'Only the account owner can perform administrative actions on child profiles.',
      );

      const history = await getChildProgressHistory(
        db,
        parentProfileId,
        childProfileId,
        c.get('callerPersonId'),
        c.get('account').id,
        query,
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
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const topics = await getChildSubjectTopics(
      db,
      parentProfileId,
      childProfileId,
      subjectId,
      c.get('callerPersonId'),
      c.get('account').id,
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
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc. Kept
    // outside the try below for the same reason as assertOwnerProfile: a
    // non-owner-caller spoof must surface as 403, not fold into the 404 IDOR
    // contract.
    await assertCallerIsAccountOwner(c);

    try {
      // GUARD: Do NOT move assertOwnerProfile() / assertCallerIsAccountOwner()
      // inside this try — every ForbiddenError thrown here is converted to 404
      // below to preserve the IDOR contract. Non-owners must continue to
      // surface as 403 via the global error handler, not as 404.
      // Defense-in-depth: route-entry parent-link check before the service.
      // getChildTopicSnapshotForParent also runs the same guard.
      await assertParentAccess(db, parentProfileId, childProfileId);
      // [WI-787] Credentialed-charge suppression stays INSIDE this try so its
      // ForbiddenError is audit-logged and converted to 404 like the
      // parent-link denial — on this IDOR-hidden route topic existence must
      // stay hidden, so a credentialed charge surfaces as 404, not 403.
      await assertChargeNotCredentialed(db, childProfileId);
      const snapshot = await getChildTopicSnapshotForParent(
        db,
        parentProfileId,
        childProfileId,
        topicId,
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
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const sessions = await getChildSessions(
      db,
      parentProfileId,
      childProfileId,
      c.get('callerPersonId'),
      c.get('account').id,
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
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const session = await getChildSessionDetail(
      db,
      parentProfileId,
      childProfileId,
      sessionId,
      c.get('callerPersonId'),
      c.get('account').id,
    );
    if (!session) {
      return notFound(c, 'Session not found');
    }
    return c.json(childSessionDetailResponseSchema.parse({ session }));
  })

  // [WI-1658] Latest verified-proof receipt (parent home card)
  .get('/dashboard/children/:profileId/verified-proof', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const proof = await getLatestVerifiedProofForChild(
      db,
      parentProfileId,
      childProfileId,
    );
    return c.json(verifiedProofResponseSchema.parse(proof));
  })

  // Curated memory view for parent
  .get('/dashboard/children/:profileId/memory', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );
    await assertChargeNotCredentialed(db, childProfileId);
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
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const reports = await getChildReports(
      db,
      parentProfileId,
      childProfileId,
      c.get('callerPersonId'),
      c.get('account').id,
    );
    return c.json(childReportsResponseSchema.parse({ reports }));
  })

  .get('/dashboard/children/:profileId/reports/:reportId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    const report = await getChildReportDetail(
      db,
      parentProfileId,
      childProfileId,
      reportId,
      c.get('callerPersonId'),
      c.get('account').id,
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
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );

    await markChildReportViewed(
      db,
      parentProfileId,
      childProfileId,
      reportId,
      c.get('callerPersonId'),
      c.get('account').id,
    );
    return c.json(reportViewedResponseSchema.parse({ viewed: true }));
  })

  // [BUG-524] Weekly reports
  .get('/dashboard/children/:profileId/weekly-reports', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );
    await assertChildDashboardDataVisible(db, childProfileId);

    const reports = await listWeeklyReportsForParentChild(
      db,
      parentProfileId,
      childProfileId,
    );
    return c.json(weeklyReportsResponseSchema.parse({ reports }));
  })

  .get('/dashboard/children/:profileId/weekly-reports/:reportId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    const reportId = c.req.param('reportId');

    // [BUG-834] Defense-in-depth at route entry.
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(
      c,
      'Only the account owner can perform administrative actions on child profiles.',
    );
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
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      const reportId = c.req.param('reportId');

      // [BUG-834] Defense-in-depth at route entry.
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
      await assertCallerIsAccountOwner(
        c,
        'Only the account owner can perform administrative actions on child profiles.',
      );
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
