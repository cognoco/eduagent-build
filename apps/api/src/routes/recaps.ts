import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import {
  recapDetailResponseSchema,
  recapsQuerySchema,
  recapsResponseSchema,
} from '@eduagent/schemas';

const recapParamsSchema = z.object({ recapId: z.string().uuid() });

import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import type { ProfileMeta } from '../middleware/profile-scope';
import { notFound } from '../errors';
import { assertOwnerProfile } from '../services/family-access';
import {
  getRecapForParent,
  listRecapsForParent,
  listRecapsForProfile,
} from '../services/recaps';
import { isIdentityV2Enabled } from '../config';

type RecapsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    IDENTITY_V2_ENABLED?: string;
  };
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
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(recapsResponseSchema.parse({ recaps }));
  })
  .get('/recaps/self', zValidator('query', recapsQuerySchema), async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const query = c.req.valid('query');

    const recaps = await listRecapsForProfile(db, profileId, {
      limit: query.limit,
    });
    return c.json(recapsResponseSchema.parse({ recaps }));
  })
  .get(
    '/recaps/:recapId',
    zValidator('param', recapParamsSchema),
    async (c) => {
      assertOwnerProfile(c);

      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const { recapId } = c.req.valid('param');
      const recap = await getRecapForParent(db, parentProfileId, recapId, {
        identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
      });

      if (!recap) return notFound(c, 'Recap not found');
      return c.json(recapDetailResponseSchema.parse({ recap }));
    },
  );
