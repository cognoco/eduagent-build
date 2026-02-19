import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { parkingLotAddSchema, ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getParkingLotItems,
  addParkingLotItem,
} from '../services/parking-lot-data';
import { apiError } from '../errors';

type ParkingLotRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const parkingLotRoutes = new Hono<ParkingLotRouteEnv>()
  // Get parked questions for a session
  .get('/sessions/:sessionId/parking-lot', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const sessionId = c.req.param('sessionId');

    const result = await getParkingLotItems(db, profileId, sessionId);
    return c.json(result);
  })

  // Park a question for later
  .post(
    '/sessions/:sessionId/parking-lot',
    zValidator('json', parkingLotAddSchema),
    async (c) => {
      const { question } = c.req.valid('json');
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const sessionId = c.req.param('sessionId');

      const item = await addParkingLotItem(db, profileId, sessionId, question);

      if (!item) {
        return apiError(
          c,
          409,
          ERROR_CODES.QUOTA_EXCEEDED,
          'Parking lot limit reached (max 10 items per session)'
        );
      }

      return c.json({ item }, 201);
    }
  );
