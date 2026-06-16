import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  ERROR_CODES,
  historyQuerySchema,
  knowledgeInventorySchema,
  progressHistorySchema,
  milestonesResponseSchema,
  refreshProgressResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  requireProfileId,
  requireAccount,
  type ProfileMeta,
} from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { apiError } from '../errors';
import {
  buildKnowledgeInventory,
  buildProgressHistory,
  listRecentMilestones,
  refreshProgressSnapshot,
} from '../services/snapshot-aggregation';
import { checkAndLogRateLimit } from '../services/settings';
import { isIdentityV2Enabled } from '../config';

type SnapshotProgressRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

const milestonesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const snapshotProgressRoutes = new Hono<SnapshotProgressRouteEnv>()
  .get('/progress/inventory', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const inventory = await buildKnowledgeInventory(db, profileId);
    return c.json(knowledgeInventorySchema.parse(inventory));
  })
  .get(
    '/progress/history',
    zValidator('query', historyQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const query = c.req.valid('query');

      const history = await buildProgressHistory(db, profileId, query);
      return c.json(progressHistorySchema.parse(history));
    },
  )
  .get(
    '/progress/milestones',
    zValidator('query', milestonesQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const query = c.req.valid('query');

      // [F-144] listRecentMilestones backfills (writes) missed milestones. In
      // proxy mode (a parent acting on a child via X-Profile-Id, isOwner=false)
      // the read is allowed but the write must not fire on the child's behalf.
      // Fail CLOSED on unknown ownership: only an explicitly-confirmed owner
      // profile may trigger the backfill write. This is stricter than
      // assertNotProxyMode (which only treats absent profileMeta as proxy) —
      // here even a present-but-non-true isOwner suppresses the write, the safe
      // direction for a write-on-read (the read itself still returns).
      const allowBackfill = c.get('profileMeta')?.isOwner === true;

      const milestones = await listRecentMilestones(
        db,
        profileId,
        query.limit ?? 5,
        allowBackfill,
      );
      return c.json(milestonesResponseSchema.parse({ milestones }));
    },
  )
  .post('/progress/refresh', async (c) => {
    // [WI-174 / DS-085] Server-derived proxy-mode write guard.
    assertNotProxyMode(c);
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const rateLimited = await checkAndLogRateLimit(
      db,
      profileId,
      requireAccount(c.get('account')).id,
      'progress_refresh',
      { hours: 1, maxCount: 10 },
      {
        identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
        callerPersonId: c.get('callerPersonId'),
      },
    );
    if (rateLimited) {
      return apiError(
        c,
        429,
        ERROR_CODES.RATE_LIMITED,
        'Progress refresh is limited to 10 times per hour.',
      );
    }

    const snapshot = await refreshProgressSnapshot(db, profileId);

    return c.json(refreshProgressResponseSchema.parse(snapshot));
  });
