import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { getStreakData, getXpSummary } from '../services/streaks';

type StreakRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const streakRoutes = new Hono<StreakRouteEnv>()
  // Get current streak state
  .get('/streaks', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');

    const streak = await getStreakData(db, profileId);
    return c.json({ streak });
  })

  // Get XP summary
  .get('/xp', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');

    const xp = await getXpSummary(db, profileId);
    return c.json({ xp });
  });
