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
import { assertCanReadProfile } from '../services/family-access';
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
    // [WI-2877] Set server-side by accountMiddleware — required by
    // assertCanReadProfile.
    account: { id: string } | undefined;
    callerPersonId: string | undefined;
  };
};

export const celebrationRoutes = new Hono<CelebrationRouteEnv>()
  .get(
    '/celebrations/pending',
    zValidator('query', pendingCelebrationsQuerySchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      // [WI-2877] Central middleware (WI-2128) proves self-or-managed-charge
      // for the installed profile; consume its target-bound proof when
      // present, else run the fail-closed fallback (direct/unproven mounts).
      // The viewer query param below is client input steering presentation
      // (level filtering) only — it never contributes read authority.
      await assertCanReadProfile(c, profileId);
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
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const body = c.req.valid('json');

      await markCelebrationsSeen(db, profileId, body.viewer);
      return c.json(celebrationSeenResponseSchema.parse({ ok: true }));
    },
  );
