import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { getCoachingCardForProfile } from '../services/coaching-cards';

type CoachingCardRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const coachingCardRoutes = new Hono<CoachingCardRouteEnv>()
  // Get coaching card for authenticated profile
  .get('/coaching-card', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;

    const result = await getCoachingCardForProfile(db, profileId);
    return c.json(result);
  });
