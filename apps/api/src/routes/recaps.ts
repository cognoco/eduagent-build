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
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import type { ProfileMeta } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
import { notFound } from '../errors';
import {
  assertOwnerProfile,
  assertCallerIsAccountOwner,
  assertCanReadProfile,
} from '../services/family-access';
import {
  getRecapForParent,
  listRecapsForParent,
  listRecapsForProfile,
} from '../services/recaps';

type RecapsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
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

export const recapsRoutes = new Hono<RecapsRouteEnv>()
  .get('/recaps', zValidator('query', recapsQuerySchema), async (c) => {
    assertOwnerProfile(c);
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(c);

    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const query = c.req.valid('query');

    const recaps = await listRecapsForParent(db, parentProfileId, {
      childProfileId: query.childProfileId,
      limit: query.limit,
    });
    return c.json(recapsResponseSchema.parse({ recaps }));
  })
  .get('/recaps/self', zValidator('query', recapsQuerySchema), async (c) => {
    // [WI-2416] Self-scoped: lists recaps for the header-resolved profileId.
    // profileScopeMiddleware only checks org membership, not caller-self —
    // assertCanReadProfile closes that gap (self OR guardian of an
    // uncredentialed charge).
    const { db, profileId } = withProfile(c);
    await assertCanReadProfile(c, profileId);
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
      // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
      await assertCallerIsAccountOwner(c);

      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const { recapId } = c.req.valid('param');
      const recap = await getRecapForParent(db, parentProfileId, recapId);

      if (!recap) return notFound(c, 'Recap not found');
      return c.json(recapDetailResponseSchema.parse({ recap }));
    },
  );
