import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { ERROR_CODES } from '@eduagent/schemas';

import {
  requireProfileId,
  type ProfileMeta,
} from '../middleware/profile-scope';
import type { AuthUser } from '../middleware/auth';
import { hashProfileIdForAnalytics } from '../services/analytics';

type AnalyticsRouteEnv = {
  Bindings: {
    ANALYTICS_HASH_KEY?: string;
  };
  Variables: {
    user: AuthUser;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

const analyticsHashRequestSchema = z.object({
  profileId: z.string().uuid(),
});

export const analyticsRoutes = new Hono<AnalyticsRouteEnv>().post(
  '/analytics/hash-profile-id',
  zValidator('json', analyticsHashRequestSchema),
  async (c) => {
    const scopedProfileId = requireProfileId(c.get('profileId'));
    const { profileId } = c.req.valid('json');

    if (profileId !== scopedProfileId) {
      return c.json(
        {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Profile hash request must match the selected profile',
        },
        403,
      );
    }

    const secret = c.env.ANALYTICS_HASH_KEY;
    if (!secret) {
      return c.json(
        {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'ANALYTICS_HASH_KEY is not configured',
        },
        500,
      );
    }

    return c.json({
      hash: await hashProfileIdForAnalytics(profileId, secret),
    });
  },
);
