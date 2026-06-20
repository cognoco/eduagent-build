import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import {
  nowOverflowResponseSchema,
  nowQuerySchema,
  nowResponseSchema,
} from '@eduagent/schemas';

import { withProfile, type RouteEnv } from '../route-utils/route-context';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';

// S0 serves only `scope=self`. Supporter scopes (aggregated feed, per-edge
// fairness, attention items) are an S4 follow-on requiring the identity
// foundation model; do not add person/edge reads here.
export const nowRoutes = new Hono<RouteEnv>()
  .get('/now', zValidator('query', nowQuerySchema), async (c) => {
    const { db, profileId } = withProfile(c);
    const query = c.req.valid('query');
    const feed = await buildNowFeed(db, profileId, query);
    return c.json(nowResponseSchema.parse(feed));
  })
  .get('/now/overflow', zValidator('query', nowQuerySchema), async (c) => {
    const { db, profileId } = withProfile(c);
    const query = c.req.valid('query');
    const overflow = await buildNowOverflow(db, profileId, query);
    return c.json(nowOverflowResponseSchema.parse(overflow));
  });
