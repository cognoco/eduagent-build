import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { challengeRoundSessionStateSchema } from '@eduagent/schemas';

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
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const challengeRound = await acceptChallengeRound(
        db,
        profileId,
        c.req.valid('json'),
      );
      return c.json({
        challengeRound: challengeRoundSessionStateSchema.parse(challengeRound),
      });
    },
  )
  .post(
    '/challenge-round/decline',
    zValidator('json', declineChallengeRoundRequestSchema),
    async (c) => {
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const challengeRound = await declineChallengeRound(
        db,
        profileId,
        c.req.valid('json'),
      );
      return c.json({
        challengeRound: challengeRoundSessionStateSchema.parse(challengeRound),
      });
    },
  )
  .post(
    '/challenge-round/abort',
    zValidator('json', challengeRoundRequestSchema),
    async (c) => {
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const challengeRound = await abortChallengeRound(
        db,
        profileId,
        c.req.valid('json'),
      );
      // abort returns `undefined` when no round ever existed for the session,
      // so the schema must tolerate the absent case while still catching a
      // malformed defined shape.
      return c.json({
        challengeRound: challengeRoundSessionStateSchema
          .optional()
          .parse(challengeRound),
      });
    },
  );
