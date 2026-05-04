import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import {
  streakEndpointResponseSchema,
  xpSummaryEndpointResponseSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getStreakData, getXpSummary } from '../services/streaks';

type StreakRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const streakRoutes = new Hono<StreakRouteEnv>()
  // Get current streak state
  .get('/streaks', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const streak = await getStreakData(db, profileId);
    return c.json(streakEndpointResponseSchema.parse({ streak }));
  })

  // Get XP summary
  .get('/xp', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const xp = await getXpSummary(db, profileId);
    return c.json(xpSummaryEndpointResponseSchema.parse({ xp }));
  });
