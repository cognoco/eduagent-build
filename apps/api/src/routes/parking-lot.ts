import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { parkingLotAddSchema } from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const parkingLotRoutes = new Hono<AuthEnv>()
  // Get parked questions for a session
  .get('/sessions/:sessionId/parking-lot', async (c) => {
    // TODO: Query parking_lot_items for c.req.param('sessionId'), verify ownership via c.get('user').userId
    return c.json({ items: [], count: 0 });
  })

  // Park a question for later
  .post(
    '/sessions/:sessionId/parking-lot',
    zValidator('json', parkingLotAddSchema),
    async (c) => {
      const { question } = c.req.valid('json');

      // TODO: Store in parking_lot_items table for c.req.param('sessionId')
      // TODO: Check max 10 items per topic, return 409 if limit reached
      // TODO: Verify session ownership via c.get('user').userId

      return c.json(
        {
          item: {
            id: 'placeholder',
            question,
            explored: false,
            createdAt: new Date().toISOString(),
          },
        },
        201
      );
    }
  );
