import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import {
  streakEndpointResponseSchema,
  xpSummaryEndpointResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertCanReadProfile } from '../services/family-access';
import { getStreakData, getXpSummary } from '../services/streaks';

type StreakRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    // [WI-2881] Set server-side by accountMiddleware — required by
    // assertCanReadProfile.
    account: { id: string } | undefined;
    callerPersonId: string | undefined;
  };
};

export const streakRoutes = new Hono<StreakRouteEnv>()
  // Get current streak state
  .get('/streaks', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    // [WI-2881] Central middleware (WI-2128) proves self-or-managed-charge
    // for the installed profile; consume its target-bound proof when
    // present, else run the fail-closed fallback (direct/unproven mounts).
    await assertCanReadProfile(c, profileId);

    const streak = await getStreakData(db, profileId);
    return c.json(streakEndpointResponseSchema.parse({ streak }));
  })

  // Get XP summary
  .get('/xp', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    // [WI-2881] Read-authority guard — see /streaks above.
    await assertCanReadProfile(c, profileId);

    const xp = await getXpSummary(db, profileId);
    return c.json(xpSummaryEndpointResponseSchema.parse({ xp }));
  });
