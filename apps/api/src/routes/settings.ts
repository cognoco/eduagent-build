import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  notificationPrefsSchema,
  learningModeUpdateSchema,
} from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const settingsRoutes = new Hono<AuthEnv>()
  // Get notification preferences
  .get('/settings/notifications', async (c) => {
    // TODO: Fetch notification preferences for user via c.get('user').userId
    return c.json({
      preferences: {
        reviewReminders: false,
        dailyReminders: false,
        pushEnabled: false,
        maxDailyPush: 3,
      },
    });
  })

  // Update notification preferences
  .put(
    '/settings/notifications',
    zValidator('json', notificationPrefsSchema),
    async (c) => {
      const body = c.req.valid('json');
      // TODO: Upsert notification preferences for user via c.get('user').userId
      return c.json({
        preferences: {
          ...body,
          maxDailyPush: body.maxDailyPush ?? 3,
        },
      });
    }
  )

  // Get learning mode
  .get('/settings/learning-mode', async (c) => {
    // TODO: Fetch learning mode for user via c.get('user').userId
    return c.json({ mode: 'serious' });
  })

  // Update learning mode
  .put(
    '/settings/learning-mode',
    zValidator('json', learningModeUpdateSchema),
    async (c) => {
      const body = c.req.valid('json');
      // TODO: Upsert learning mode for user via c.get('user').userId
      return c.json({ mode: body.mode });
    }
  );
