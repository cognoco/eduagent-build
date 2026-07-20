import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  parkingLotAddSchema,
  parkingLotItemsResponseSchema,
  parkingLotAddResponseSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
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
    profileId: string | undefined;
  };
};

// [BUG-392] Guard path params against non-UUID input reaching the DB layer.
const sessionParamSchema = z.object({
  sessionId: z.string().uuid(),
});

const topicParamSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid(),
});

export const parkingLotRoutes = new Hono<ParkingLotRouteEnv>()
  // Get parked questions for a session
  .get(
    '/sessions/:sessionId/parking-lot',
    zValidator('param', sessionParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId } = c.req.valid('param');

      const result = await getParkingLotItems(db, profileId, sessionId);
      return c.json(parkingLotItemsResponseSchema.parse(result));
    },
  )

  // Get parked questions linked to a topic for topic review
  .get(
    '/subjects/:subjectId/topics/:topicId/parking-lot',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');

      const result = await getParkingLotItemsForTopic(db, profileId, topicId);
      return c.json(parkingLotItemsResponseSchema.parse(result));
    },
  )

  // Park a question for later
  .post(
    '/sessions/:sessionId/parking-lot',
    zValidator('param', sessionParamSchema),
    zValidator('json', parkingLotAddSchema),
    async (c) => {
      // [WI-161 / DS-072] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const { question } = c.req.valid('json');
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { sessionId } = c.req.valid('param');
      const session = await getSession(db, profileId, sessionId);
      if (!session) {
        return notFound(c, 'Session not found');
      }

      const item = await addParkingLotItem(
        db,
        profileId,
        sessionId,
        question,
        session.topicId ?? undefined,
      );

      if (!item) {
        return apiError(
          c,
          409,
          ERROR_CODES.QUOTA_EXCEEDED,
          `Parking lot limit reached (max ${MAX_ITEMS_PER_TOPIC} items per topic)`,
        );
      }

      return c.json(parkingLotAddResponseSchema.parse({ item }), 201);
    },
  );
