import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { getCurrentLanguageProgress } from '../services/language-curriculum';
import { notFound } from '../errors';

type LanguageProgressRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const languageProgressRoutes = new Hono<LanguageProgressRouteEnv>().get(
  '/subjects/:subjectId/cefr-progress',
  async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const progress = await getCurrentLanguageProgress(
      db,
      profileId,
      c.req.param('subjectId')
    );

    if (!progress) {
      return notFound(c, 'Language progress not found');
    }

    return c.json(progress);
  }
);
