import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  vocabularyCreateSchema,
  vocabularyReviewSchema,
  vocabularyListResponseSchema,
  vocabularyCreateResponseSchema,
  vocabularyReviewResponseSchema,
  vocabularyDeleteResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import {
  createVocabulary,
  deleteVocabulary,
  listVocabulary,
  reviewVocabulary,
} from '../services/vocabulary';
import {
  notFound,
  SubjectNotFoundError,
  VocabularyNotFoundError,
} from '../errors';

type VocabularyRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const vocabularyRoutes = new Hono<VocabularyRouteEnv>()
  .get('/subjects/:subjectId/vocabulary', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    try {
      const vocabulary = await listVocabulary(
        db,
        profileId,
        c.req.param('subjectId'),
      );
      return c.json(vocabularyListResponseSchema.parse({ vocabulary }));
    } catch (err) {
      // [FIX-API-6] Use typed instanceof check instead of string-matching message
      if (err instanceof SubjectNotFoundError) {
        return notFound(c, err.message);
      }
      throw err;
    }
  })
  .post(
    '/subjects/:subjectId/vocabulary',
    zValidator('json', vocabularyCreateSchema),
    async (c) => {
      // [WI-181 / DS-092] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const vocabulary = await createVocabulary(
          db,
          profileId,
          c.req.param('subjectId'),
          c.req.valid('json'),
        );
        return c.json(
          vocabularyCreateResponseSchema.parse({ vocabulary }),
          201,
        );
      } catch (err) {
        // [FIX-API-6] Use typed instanceof check instead of string-matching message
        if (err instanceof SubjectNotFoundError) {
          return notFound(c, err.message);
        }
        throw err;
      }
    },
  )
  .post(
    '/subjects/:subjectId/vocabulary/:vocabularyId/review',
    zValidator('json', vocabularyReviewSchema),
    async (c) => {
      // [WI-181 / DS-092] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const result = await reviewVocabulary(
          db,
          profileId,
          c.req.param('vocabularyId'),
          c.req.valid('json'),
          c.req.param('subjectId'),
        );
        return c.json(vocabularyReviewResponseSchema.parse(result));
      } catch (err) {
        // [FIX-API-6] Use typed instanceof check instead of string-matching message
        if (err instanceof VocabularyNotFoundError) {
          return notFound(c, err.message);
        }
        // Re-throw all other errors (transient DB, unexpected) so the global
        // onError handler classifies them correctly via isTransientDatabaseError()
        // → 503 + Retry-After, rather than masking them as 422.
        throw err;
      }
    },
  )
  .delete('/subjects/:subjectId/vocabulary/:vocabularyId', async (c) => {
    // [WI-181 / DS-092] Server-derived proxy-mode write guard.
    await assertNotProxyMode(c);
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { subjectId, vocabularyId } = c.req.param();

    const deleted = await deleteVocabulary(
      db,
      profileId,
      subjectId,
      vocabularyId,
    );
    if (!deleted) {
      return notFound(c, 'Vocabulary item not found');
    }
    return c.json(vocabularyDeleteResponseSchema.parse({ success: true }));
  });
