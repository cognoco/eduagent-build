import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  notificationPrefsSchema,
  learningModeUpdateSchema,
  pushTokenRegisterSchema,
  analogyDomainUpdateSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
  registerPushToken,
} from '../services/settings';
import { notifyParentToSubscribe } from '../services/notifications';
import {
  getAnalogyDomain,
  setAnalogyDomain,
} from '../services/retention-data';

type SettingsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };
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
  )

  // Register push token
  .post(
    '/settings/push-token',
    zValidator('json', pushTokenRegisterSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const body = c.req.valid('json');
      await registerPushToken(db, profileId, body.token);
      return c.json({ registered: true });
    }
  )

  // Notify parent to subscribe (child-friendly paywall)
  .post('/settings/notify-parent-subscribe', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const result = await notifyParentToSubscribe(db, profileId, {
      resendApiKey: c.env.RESEND_API_KEY,
      emailFrom: c.env.EMAIL_FROM,
    });
    return c.json(result);
  })

  // Get analogy domain preference for a subject (FR134-137)
  .get('/settings/subjects/:subjectId/analogy-domain', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');
    const analogyDomain = await getAnalogyDomain(db, profileId, subjectId);
    return c.json({ analogyDomain });
  })

  // Update analogy domain preference for a subject (FR134-137)
  .put(
    '/settings/subjects/:subjectId/analogy-domain',
    zValidator('json', analogyDomainUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subjectId = c.req.param('subjectId');
      const body = c.req.valid('json');
      const analogyDomain = await setAnalogyDomain(
        db,
        profileId,
        subjectId,
        body.analogyDomain
      );
      return c.json({ analogyDomain });
    }
  );
