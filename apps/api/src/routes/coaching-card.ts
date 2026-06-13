import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { coachingCardEndpointResponseSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getCoachingCardForProfile } from '../services/coaching-cards';
import { isIdentityV2Enabled } from '../config';

type CoachingCardRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const coachingCardRoutes = new Hono<CoachingCardRouteEnv>()
  // Get coaching card for authenticated profile
  .get('/coaching-card', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const result = await getCoachingCardForProfile(db, profileId, {
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(coachingCardEndpointResponseSchema.parse(result));
  });
