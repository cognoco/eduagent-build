import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { parkingLotAddSchema, ERROR_CODES } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getParkingLotItems,
  getParkingLotItemsForTopic,
  addParkingLotItem,
  MAX_ITEMS_PER_TOPIC,
} from '../services/parking-lot-data';
import { getSession } from '../services/session';
import { apiError, notFound } from '../errors';

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
    const profileId = c.get('profileId');
    const sessionId = c.req.param('sessionId');

    const result = await getParkingLotItems(db, profileId, sessionId);
    return c.json(result);
  })

  // Get parked questions linked to a topic for topic review
  .get('/subjects/:subjectId/topics/:topicId/parking-lot', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');
    const topicId = c.req.param('topicId');

    const result = await getParkingLotItemsForTopic(db, profileId, topicId);
    return c.json(result);
  })

  // Park a question for later
  .post(
    '/sessions/:sessionId/parking-lot',
    zValidator('json', parkingLotAddSchema),
    async (c) => {
      const { question } = c.req.valid('json');
      const db = c.get('db');
      const profileId = c.get('profileId');
      const sessionId = c.req.param('sessionId');
      const session = await getSession(db, profileId, sessionId);
      if (!session) {
        return notFound(c, 'Session not found');
      }

      const item = await addParkingLotItem(
        db,
        profileId,
        sessionId,
        question,
        session.topicId ?? undefined
      );

      if (!item) {
        return apiError(
          c,
          409,
          ERROR_CODES.QUOTA_EXCEEDED,
          `Parking lot limit reached (max ${MAX_ITEMS_PER_TOPIC} items per topic)`
        );
      }

      return c.json({ item }, 201);
    }
  );
