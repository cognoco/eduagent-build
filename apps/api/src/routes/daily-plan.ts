import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getDailyPlan } from '../services/daily-plan';

type DailyPlanRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const dailyPlanRoutes = new Hono<DailyPlanRouteEnv>().get(
  '/daily-plan',
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    const result = await getDailyPlan(db, profileId);
    return c.json(result);
  }
);
