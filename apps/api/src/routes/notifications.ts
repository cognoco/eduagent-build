import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import {
  childCapNotificationDismissResponseSchema,
  childCapNotificationsResponseSchema,
  childCapNotifyParentInputSchema,
  childCapNotifyParentResponseSchema,
  ForbiddenError,
} from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import {
  requireAccount,
  requireProfileId,
  type ProfileMeta,
} from '../middleware/profile-scope';
import type { Account } from '../services/account';
import { notFound } from '../errors';
import { assertOwnerProfile } from '../services/family-access';
import {
  dismissChildCapNotification,
  listActiveChildCapNotifications,
  recordChildCapNotificationForAccount,
} from '../services/child-cap-notifications';

type NotificationsRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

const notificationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const notificationsRoutes = new Hono<NotificationsRouteEnv>()
  .get('/notifications/child-cap', async (c) => {
    assertOwnerProfile(c);

    const notifications = await listActiveChildCapNotifications(
      c.get('db'),
      requireProfileId(c.get('profileId')),
    );
    return c.json(childCapNotificationsResponseSchema.parse({ notifications }));
  })
  .post(
    '/notifications/child-cap/:id/dismiss',
    zValidator('param', notificationParamsSchema),
    async (c) => {
      assertOwnerProfile(c);

      const dismissed = await dismissChildCapNotification(
        c.get('db'),
        requireProfileId(c.get('profileId')),
        c.req.valid('param').id,
      );
      if (!dismissed) return notFound(c, 'Notification not found');

      return c.json(
        childCapNotificationDismissResponseSchema.parse({ success: true }),
      );
    },
  )
  .post(
    '/notifications/child-cap/notify-parent',
    zValidator('json', childCapNotifyParentInputSchema),
    async (c) => {
      const profileId = requireProfileId(c.get('profileId'));
      const account = requireAccount(c.get('account'));
      if (c.get('profileMeta')?.isOwner === true) {
        throw new ForbiddenError(
          'Owner profiles do not create child-cap parent notifications.',
        );
      }

      const input = c.req.valid('json');
      await recordChildCapNotificationForAccount(c.get('db'), {
        accountId: account.id,
        childProfileId: profileId,
        kind: input.kind,
        resetsAt: input.resetsAt,
        occurredAt: new Date().toISOString(),
      });

      return c.json(childCapNotifyParentResponseSchema.parse({ sent: true }));
    },
  );
