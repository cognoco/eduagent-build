import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  NotFoundError,
  nudgeCreateResponseSchema,
  nudgeCreateSchema,
  nudgeListResponseSchema,
  nudgeMarkReadResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

import type { Account } from '../services/account';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { isIdentityV2Enabled } from '../config';
import {
  createNudge,
  listUnreadNudges,
  markAllNudgesRead,
  markNudgeRead,
} from '../services/nudge';

type NudgeRouteEnv = {
  Bindings: { DATABASE_URL: string; IDENTITY_V2_ENABLED?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const nudgeRoutes = new Hono<NudgeRouteEnv>()
  .post('/nudges', zValidator('json', nudgeCreateSchema), async (c) => {
    // [WI-159 / DS-070] Server-derived proxy-mode write guard.
    assertNotProxyMode(c);
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const input = c.req.valid('json');
    const result = await createNudge(
      db,
      {
        fromProfileId: profileId,
        toProfileId: input.toProfileId,
        template: input.template,
      },
      { identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED) },
    );
    return c.json(nudgeCreateResponseSchema.parse(result));
  })
  .get('/nudges', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const nudges = await listUnreadNudges(c.get('db'), profileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(nudgeListResponseSchema.parse({ nudges }));
  })
  .patch('/nudges/:id/read', async (c) => {
    // [WI-159 / DS-070] Server-derived proxy-mode write guard.
    assertNotProxyMode(c);
    const count = await markNudgeRead(
      c.get('db'),
      requireProfileId(c.get('profileId')),
      c.req.param('id'),
    );
    if (count === 0) throw new NotFoundError('Nudge');
    return c.json(nudgeMarkReadResponseSchema.parse({ success: true, count }));
  })
  .post('/nudges/mark-read', async (c) => {
    // [WI-159 / DS-070] Server-derived proxy-mode write guard.
    assertNotProxyMode(c);
    const count = await markAllNudgesRead(
      c.get('db'),
      requireProfileId(c.get('profileId')),
    );
    return c.json(nudgeMarkReadResponseSchema.parse({ success: true, count }));
  });
