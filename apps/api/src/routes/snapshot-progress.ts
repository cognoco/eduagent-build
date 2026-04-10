import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ERROR_CODES, historyQuerySchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { apiError } from '../errors';
import {
  buildKnowledgeInventory,
  buildProgressHistory,
  listRecentMilestones,
  refreshProgressSnapshot,
} from '../services/snapshot-aggregation';
import {
  getRecentNotificationCount,
  logNotification,
} from '../services/settings';

type SnapshotProgressRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
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

    const refreshCount = await getRecentNotificationCount(
      db,
      profileId,
      'progress_refresh',
      1
    );

    if (refreshCount >= 10) {
      return apiError(
        c,
        429,
        ERROR_CODES.CONFLICT,
        'Progress refresh is limited to 10 times per hour.'
      );
    }

    const snapshot = await refreshProgressSnapshot(db, profileId);
    await logNotification(db, profileId, 'progress_refresh');

    return c.json(snapshot);
  });
