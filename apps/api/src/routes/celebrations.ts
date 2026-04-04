import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { celebrationSeenSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
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
  .get('/celebrations/pending', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const viewer = c.req.query('viewer') === 'parent' ? 'parent' : 'child';
    const celebrations = await getPendingCelebrations(db, profileId, viewer);

    if (viewer === 'parent') {
      return c.json({ pendingCelebrations: celebrations });
    }

    const celebrationLevel = await getCelebrationLevel(db, profileId);

    return c.json({
      pendingCelebrations: filterCelebrationsByLevel(
        celebrations,
        celebrationLevel
      ),
    });
  })
  .post(
    '/celebrations/seen',
    zValidator('json', celebrationSeenSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const body = c.req.valid('json');

      await markCelebrationsSeen(db, profileId, body.viewer);
      return c.json({ ok: true });
    }
  );
