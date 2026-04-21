import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ERROR_CODES, historyQuerySchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import { apiError } from '../errors';
import {
  buildKnowledgeInventory,
  buildProgressHistory,
  listRecentMilestones,
  refreshProgressSnapshot,
} from '../services/snapshot-aggregation';
import { checkAndLogRateLimit } from '../services/settings';

type SnapshotProgressRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
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
    return c.json(inventory);
  })
  .get(
    '/progress/history',
    zValidator('query', historyQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const query = c.req.valid('query');

      const history = await buildProgressHistory(db, profileId, query);
      return c.json(history);
    }
  )
  .get(
    '/progress/milestones',
    zValidator('query', milestonesQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const query = c.req.valid('query');

      const milestones = await listRecentMilestones(
        db,
        profileId,
        query.limit ?? 5
      );
      return c.json({ milestones });
    }
  )
  .post('/progress/refresh', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const rateLimited = await checkAndLogRateLimit(
      db,
      profileId,
      c.get('account').id,
      'progress_refresh',
      { hours: 1, maxCount: 10 }
    );
    if (rateLimited) {
      return apiError(
        c,
        429,
        ERROR_CODES.RATE_LIMITED,
        'Progress refresh is limited to 10 times per hour.'
      );
    }

    const snapshot = await refreshProgressSnapshot(db, profileId);

    return c.json(snapshot);
  });
