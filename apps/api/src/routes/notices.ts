import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import type { Database } from '@eduagent/database';
import { noticeSeenResponseSchema } from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { markPendingNoticeSeen } from '../services/notices';

type NoticesRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const noticeParamSchema = z.object({
  id: z.string().uuid(),
});

export const noticesRoutes = new Hono<NoticesRouteEnv>().post(
  '/notices/:id/seen',
  zValidator('param', noticeParamSchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { id } = c.req.valid('param');

    await markPendingNoticeSeen(db, profileId, id);
    return c.json(noticeSeenResponseSchema.parse({ seen: true }));
  }
);
