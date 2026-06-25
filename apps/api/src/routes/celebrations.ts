import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  celebrationSeenSchema,
  pendingCelebrationsQuerySchema,
  pendingCelebrationsResponseSchema,
  celebrationSeenResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { getCelebrationLevel } from '../services/settings';
import {
  filterCelebrationsByLevel,
  getPendingCelebrations,
  markCelebrationsSeen,
} from '../services/celebrations';

type CelebrationRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const celebrationRoutes = new Hono<CelebrationRouteEnv>()
  .get(
    '/celebrations/pending',
    zValidator('query', pendingCelebrationsQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { viewer: rawViewer } = c.req.valid('query');
      const viewer = rawViewer === 'parent' ? 'parent' : 'child';
      const celebrations = await getPendingCelebrations(db, profileId, viewer);

      if (viewer === 'parent') {
        return c.json(
          pendingCelebrationsResponseSchema.parse({
            pendingCelebrations: celebrations,
          }),
        );
      }

      const celebrationLevel = await getCelebrationLevel(db, profileId);

      return c.json(
        pendingCelebrationsResponseSchema.parse({
          pendingCelebrations: filterCelebrationsByLevel(
            celebrations,
            celebrationLevel,
          ),
        }),
      );
    },
  )
  .post(
    '/celebrations/seen',
    zValidator('json', celebrationSeenSchema),
    async (c) => {
      // [WI-143 / DS-054] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const body = c.req.valid('json');

      await markCelebrationsSeen(db, profileId, body.viewer);
      return c.json(celebrationSeenResponseSchema.parse({ ok: true }));
    },
  );
