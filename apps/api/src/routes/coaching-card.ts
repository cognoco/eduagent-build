import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { coachingCardEndpointResponseSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertCanReadProfile } from '../services/family-access';
import { getCoachingCardForProfile } from '../services/coaching-cards';

type CoachingCardRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    // [WI-2877] Set server-side by accountMiddleware — required by
    // assertCanReadProfile.
    account: { id: string } | undefined;
    callerPersonId: string | undefined;
  };
};

export const coachingCardRoutes = new Hono<CoachingCardRouteEnv>()
  // Get coaching card for authenticated profile
  .get('/coaching-card', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    // [WI-2877] Central middleware (WI-2128) proves self-or-managed-charge
    // for the installed profile; consume its target-bound proof when
    // present, else run the fail-closed fallback (direct/unproven mounts).
    await assertCanReadProfile(c, profileId);

    const result = await getCoachingCardForProfile(db, profileId);
    return c.json(coachingCardEndpointResponseSchema.parse(result));
  });
