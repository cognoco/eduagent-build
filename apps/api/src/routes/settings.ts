import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  notificationPrefsSchema,
  learningModeUpdateSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
} from '../services/settings';

type SettingsRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const settingsRoutes = new Hono<SettingsRouteEnv>()
  // Get notification preferences
  .get('/settings/notifications', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const preferences = await getNotificationPrefs(db, profileId);
    return c.json({ preferences });
  })

  // Update notification preferences
  .put(
    '/settings/notifications',
    zValidator('json', notificationPrefsSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const body = c.req.valid('json');
      const preferences = await upsertNotificationPrefs(db, profileId, body);
      return c.json({ preferences });
    }
  )

  // Get learning mode
  .get('/settings/learning-mode', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const result = await getLearningMode(db, profileId);
    return c.json({ mode: result.mode });
  })

  // Update learning mode
  .put(
    '/settings/learning-mode',
    zValidator('json', learningModeUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const body = c.req.valid('json');
      const result = await upsertLearningMode(db, profileId, body.mode);
      return c.json({ mode: result.mode });
    }
  );
