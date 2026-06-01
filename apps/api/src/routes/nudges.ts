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
import {
  createNudge,
  listUnreadNudges,
  markAllNudgesRead,
  markNudgeRead,
} from '../services/nudge';

type NudgeRouteEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const nudgeRoutes = new Hono<NudgeRouteEnv>()
  .post('/nudges', zValidator('json', nudgeCreateSchema), async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const input = c.req.valid('json');
    // [WI-159 / DS-070] Guardian-to-learner sends remain owner-only writes.
    // Learner-to-guardian sends are intentionally route-allowed from a normal
    // non-owner learner profile: on the legacy account/profile model,
    // profileMeta.isOwner=false is both a managed learner's own active profile
    // and an explicit parent-proxy view. There is no server-verified explicit
    // proxy bit yet, so do not read X-Proxy-Mode here as a security boundary.
    // Service-layer family-link, direction/template, and consent checks still
    // prove the sender/recipient pair before any row is written.
    if (input.direction === 'guardian_to_learner') {
      assertNotProxyMode(c);
    }
    const result = await createNudge(db, {
      fromProfileId: profileId,
      toProfileId: input.toProfileId,
      direction: input.direction,
      template: input.template,
    });
    return c.json(nudgeCreateResponseSchema.parse(result));
  })
  .get('/nudges', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const nudges = await listUnreadNudges(c.get('db'), profileId);
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
