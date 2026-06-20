import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  supporteeStructuralSubjectsResponseSchema,
  supporterScopeListSchema,
} from '@eduagent/schemas';

import { withProfile, type RouteEnv } from '../route-utils/route-context';
import { resolveScopesForPerson } from '../services/scope-resolution';
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
