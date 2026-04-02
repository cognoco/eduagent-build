import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { homeCardInteractionSchema, ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getHomeCardsForProfile,
  trackHomeCardInteraction,
} from '../services/home-cards';

type HomeCardRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const homeCardRoutes = new Hono<HomeCardRouteEnv>()
  .get('/home-cards', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');

    if (!profileId) {
      return c.json(
        {
          error: {
            code: ERROR_CODES.PROFILE_NOT_FOUND,
            message: 'Active profile required',
          },
        },
        400
      );
    }

    const result = await getHomeCardsForProfile(db, profileId);
    return c.json(result);
  })
  .post(
    '/home-cards/interactions',
    zValidator('json', homeCardInteractionSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = c.get('profileId');

      if (!profileId) {
        return c.json(
          {
            error: {
              code: ERROR_CODES.PROFILE_NOT_FOUND,
              message: 'Active profile required',
            },
          },
          400
        );
      }

      await trackHomeCardInteraction(db, profileId, c.req.valid('json'));
      return c.json({ ok: true });
    }
  );
