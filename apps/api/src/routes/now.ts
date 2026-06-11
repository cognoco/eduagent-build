import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import type { Database } from '@eduagent/database';
import {
  nowOverflowResponseSchema,
  nowQuerySchema,
  nowResponseSchema,
} from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';

type NowRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

// S0 serves only `scope=self`. Supporter scopes (aggregated feed, per-edge
// fairness, attention items) are an S4 follow-on requiring the identity
// foundation model; do not add person/edge reads here.
export const nowRoutes = new Hono<NowRouteEnv>()
  .get('/now', zValidator('query', nowQuerySchema), async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { scope } = c.req.valid('query');
    const feed = await buildNowFeed(db, profileId, scope);
    return c.json(nowResponseSchema.parse(feed));
  })
  .get('/now/overflow', zValidator('query', nowQuerySchema), async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { scope } = c.req.valid('query');
    const overflow = await buildNowOverflow(db, profileId, scope);
    return c.json(nowOverflowResponseSchema.parse(overflow));
  });
