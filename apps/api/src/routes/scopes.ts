import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  supporteeStructuralSubjectsResponseSchema,
  supporterColdStartSchema,
  supporterScopeListSchema,
} from '@eduagent/schemas';

import { withProfile, type RouteEnv } from '../route-utils/route-context';
import { resolveScopesForPerson } from '../services/scope-resolution';
import { resolveSupporterColdStart } from '../services/supporter-coldstart';
import { readSupporteeStructuralSubjects } from '../services/supporter-structural-mask';

const personIdParamSchema = z.object({
  personId: z.string().uuid(),
});

export const scopesRoutes = new Hono<RouteEnv>()
  .get('/scopes', async (c) => {
    const { db, profileId } = withProfile(c);
    const scopes = await resolveScopesForPerson(db, profileId);
    return c.json(supporterScopeListSchema.parse(scopes));
  })
  .get('/scopes/coldstart', async (c) => {
    // [WI-2237 deferred-sweep] see resolveSupporterColdStart — intentionally
    // exempt from the accepted-visibility gate (WI-2395 tracks the deferral).
    const { db, profileId } = withProfile(c);
    const coldStart = await resolveSupporterColdStart(db, profileId);
    return c.json(supporterColdStartSchema.parse(coldStart));
  })
  .get(
    '/scopes/:personId/subjects',
    zValidator('param', personIdParamSchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const { personId } = c.req.valid('param');
      const subjects = await readSupporteeStructuralSubjects(
        db,
        profileId,
        personId,
      );
      return c.json(supporteeStructuralSubjectsResponseSchema.parse(subjects));
    },
  );
