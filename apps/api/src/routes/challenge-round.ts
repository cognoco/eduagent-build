import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile, type RouteEnv } from '../route-utils/route-context';
import {
  acceptChallengeRound,
  abortChallengeRound,
  declineChallengeRound,
} from '../services/challenge-round/route-actions';

const challengeRoundRequestSchema = z.object({
  sessionId: z.string().uuid(),
  topicId: z.string().uuid(),
});

const declineChallengeRoundRequestSchema = challengeRoundRequestSchema.extend({
  dontAskAgain: z.boolean().default(false),
});

export const challengeRoundRoutes = new Hono<RouteEnv>()
  .post(
    '/challenge-round/accept',
    zValidator('json', challengeRoundRequestSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const challengeRound = await acceptChallengeRound(
        db,
        profileId,
        c.req.valid('json'),
      );
      return c.json({ challengeRound });
    },
  )
  .post(
    '/challenge-round/decline',
    zValidator('json', declineChallengeRoundRequestSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const challengeRound = await declineChallengeRound(
        db,
        profileId,
        c.req.valid('json'),
      );
      return c.json({ challengeRound });
    },
  )
  .post(
    '/challenge-round/abort',
    zValidator('json', challengeRoundRequestSchema),
    async (c) => {
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const challengeRound = await abortChallengeRound(
        db,
        profileId,
        c.req.valid('json'),
      );
      return c.json({ challengeRound });
    },
  );
