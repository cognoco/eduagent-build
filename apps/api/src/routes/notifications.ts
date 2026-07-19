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
import {
  assertOwnerProfile,
  assertCallerIsAccountOwner,
} from '../services/family-access';
import { dismissChildCapNotification } from '../services/child-cap-notifications';
import {
  listActiveChildCapNotificationsV2,
  recordChildCapNotificationForAccountV2,
} from '../services/billing/billing-v2';

type NotificationsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    // [WI-1989] The authenticated caller's own person id, resolved server-side
    // by accountMiddleware — required by assertCallerIsAccountOwner.
    callerPersonId: string | undefined;
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
    // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
    await assertCallerIsAccountOwner(c);

    const ownerProfileId = requireProfileId(c.get('profileId'));
    const notifications = await listActiveChildCapNotificationsV2(
      c.get('db'),
      ownerProfileId,
    );
    return c.json(childCapNotificationsResponseSchema.parse({ notifications }));
  })
  .post(
    '/notifications/child-cap/:id/dismiss',
    zValidator('param', notificationParamsSchema),
    async (c) => {
      assertOwnerProfile(c);
      // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
      await assertCallerIsAccountOwner(c);

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
      const recordPayload = {
        accountId: account.id,
        childProfileId: profileId,
        kind: input.kind,
        resetsAt: input.resetsAt,
        occurredAt: new Date().toISOString(),
      };
      await recordChildCapNotificationForAccountV2(c.get('db'), recordPayload);

      return c.json(childCapNotifyParentResponseSchema.parse({ sent: true }));
    },
  );
