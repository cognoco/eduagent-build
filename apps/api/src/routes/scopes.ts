import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  supporteeStructuralSubjectsResponseSchema,
  supporterColdStartSchema,
  supporterScopeListSchema,
} from '@eduagent/schemas';

import {
  requireCallerPersonId,
  withProfile,
  type RouteEnv,
} from '../route-utils/route-context';
import { assertCanReadProfile } from '../services/family-access';
import { resolveScopesForPerson } from '../services/scope-resolution';
import { resolveSupporterColdStart } from '../services/supporter-coldstart';
import { readSupporteeStructuralSubjects } from '../services/supporter-structural-mask';

const personIdParamSchema = z.object({
  personId: z.string().uuid(),
});

type ScopesRouteEnv = {
  Bindings: RouteEnv['Bindings'];
  Variables: RouteEnv['Variables'] & {
    // [WI-2881] Set server-side by accountMiddleware — required by
    // assertCanReadProfile on the self-scope handlers.
    account: { id: string } | undefined;
  };
};

export const scopesRoutes = new Hono<ScopesRouteEnv>()
  .get('/scopes', async (c) => {
    const { db, profileId } = withProfile(c);
    // [WI-2881] Central middleware (WI-2128) proves self-or-managed-charge
    // for the installed profile; consume its target-bound proof when
    // present, else run the fail-closed fallback (direct/unproven mounts).
    // Self-scope handler only (G31); the supporter-edge handler below
    // (GET /scopes/:personId/subjects, G32) is WI-2518's remit.
    await assertCanReadProfile(c, profileId);
    const scopes = await resolveScopesForPerson(db, profileId);
    return c.json(supporterScopeListSchema.parse(scopes));
  })
  .get('/scopes/coldstart', async (c) => {
    // [WI-2237 deferred-sweep] see resolveSupporterColdStart — intentionally
    // exempt from the accepted-visibility gate (WI-2395 tracks the deferral).
    const { db, profileId } = withProfile(c);
    // [WI-2881] Read-authority guard — see /scopes above.
    await assertCanReadProfile(c, profileId);
    const coldStart = await resolveSupporterColdStart(db, profileId);
    return c.json(supporterColdStartSchema.parse(coldStart));
  })
  .get(
    '/scopes/:personId/subjects',
    zValidator('param', personIdParamSchema),
    async (c) => {
      const { db } = withProfile(c);
      const callerPersonId = requireCallerPersonId(c);
      const { personId } = c.req.valid('param');
      const subjects = await readSupporteeStructuralSubjects(
        db,
        callerPersonId,
        personId,
      );
      return c.json(supporteeStructuralSubjectsResponseSchema.parse(subjects));
    },
  );
