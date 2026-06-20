import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import {
  nowOverflowResponseSchema,
  nowQuerySchema,
  nowResponseSchema,
} from '@eduagent/schemas';

import { withProfile, type RouteEnv } from '../route-utils/route-context';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';

// S4 widens `/now` from self-only to supporter hub/person scopes. Supporter
// visibility is derived at read time from active supportership edges.
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
