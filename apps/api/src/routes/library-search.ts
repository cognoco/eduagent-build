import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  librarySearchQuerySchema,
  librarySearchResultSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertCanReadProfile } from '../services/family-access';
import { searchLibrary } from '../services/library-search';

type SearchRouteEnv = {
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

export const librarySearchRoutes = new Hono<SearchRouteEnv>().get(
  '/library/search',
  zValidator('query', librarySearchQuerySchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    // [WI-2877] Central middleware (WI-2128) proves self-or-managed-charge
    // for the installed profile; consume its target-bound proof when
    // present, else run the fail-closed fallback (direct/unproven mounts).
    await assertCanReadProfile(c, profileId);
    const { q } = c.req.valid('query');

    const results = await searchLibrary(db, profileId, q);
    return c.json(librarySearchResultSchema.parse(results));
  },
);
