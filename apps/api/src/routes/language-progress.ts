import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Database } from '@eduagent/database';
import { languageProgressSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertCanReadProfile } from '../services/family-access';
import { getCurrentLanguageProgress } from '../services/language-curriculum';
import { notFound } from '../errors';

type LanguageProgressRouteEnv = {
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

// [WI-980] Guard :subjectId against non-UUID input — mirrors sibling routes
// (e.g. book-suggestions.ts:33-35) that already validate path params.
const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

export const languageProgressRoutes = new Hono<LanguageProgressRouteEnv>().get(
  '/subjects/:subjectId/cefr-progress',
  zValidator('param', subjectParamSchema),
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    // [WI-2877] Central middleware (WI-2128) proves self-or-managed-charge
    // for the installed profile; consume its target-bound proof when
    // present, else run the fail-closed fallback (direct/unproven mounts).
    await assertCanReadProfile(c, profileId);
    const { subjectId } = c.req.valid('param');
    const progress = await getCurrentLanguageProgress(db, profileId, subjectId);

    if (!progress) {
      return notFound(c, 'Language progress not found');
    }

    return c.json(languageProgressSchema.parse(progress));
  },
);
