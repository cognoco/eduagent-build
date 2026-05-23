import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import {
  recapDetailResponseSchema,
  recapsQuerySchema,
  recapsResponseSchema,
} from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import type { ProfileMeta } from '../middleware/profile-scope';
import { notFound } from '../errors';
import { assertOwnerProfile } from '../services/family-access';
import { getRecapForParent, listRecapsForParent } from '../services/recaps';

type RecapsRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const recapsRoutes = new Hono<RecapsRouteEnv>()
  .get('/recaps', zValidator('query', recapsQuerySchema), async (c) => {
    assertOwnerProfile(c);

    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const query = c.req.valid('query');

    const recaps = await listRecapsForParent(db, parentProfileId, {
      childProfileId: query.childProfileId,
      limit: query.limit,
    });
    return c.json(recapsResponseSchema.parse({ recaps }));
  })
  .get('/recaps/:recapId', async (c) => {
    assertOwnerProfile(c);

    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const recap = await getRecapForParent(
      db,
      parentProfileId,
      c.req.param('recapId'),
    );

    if (!recap) return notFound(c, 'Recap not found');
    return c.json(recapDetailResponseSchema.parse({ recap }));
  });
