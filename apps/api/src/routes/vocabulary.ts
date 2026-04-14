import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  vocabularyCreateSchema,
  vocabularyReviewSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  createVocabulary,
  deleteVocabulary,
  listVocabulary,
  reviewVocabulary,
} from '../services/vocabulary';
import { apiError, notFound } from '../errors';
import { ERROR_CODES } from '@eduagent/schemas';

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
        c.req.param('subjectId')
      );
      return c.json({ vocabulary });
    } catch (err) {
      if (err instanceof Error && err.message === 'Subject not found') {
        return notFound(c, 'Subject not found');
      }
      throw err;
    }
  })
  .post(
    '/subjects/:subjectId/vocabulary',
    zValidator('json', vocabularyCreateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const vocabulary = await createVocabulary(
          db,
          profileId,
          c.req.param('subjectId'),
          c.req.valid('json')
        );
        return c.json({ vocabulary }, 201);
      } catch (err) {
        if (err instanceof Error && err.message === 'Subject not found') {
          return notFound(c, 'Subject not found');
        }
        throw err;
      }
    }
  )
  .post(
    '/subjects/:subjectId/vocabulary/:vocabularyId/review',
    zValidator('json', vocabularyReviewSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const result = await reviewVocabulary(
          db,
          profileId,
          c.req.param('vocabularyId'),
          c.req.valid('json'),
          c.req.param('subjectId')
        );
        return c.json(result);
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === 'Vocabulary item not found'
        ) {
          return notFound(c, 'Vocabulary item not found');
        }
        return apiError(
          c,
          422,
          ERROR_CODES.VALIDATION_ERROR,
          err instanceof Error ? err.message : 'Vocabulary review failed'
        );
      }
    }
  )
  .delete('/subjects/:subjectId/vocabulary/:vocabularyId', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const { subjectId, vocabularyId } = c.req.param();

    const deleted = await deleteVocabulary(
      db,
      profileId,
      subjectId,
      vocabularyId
    );
    if (!deleted) {
      return notFound(c, 'Vocabulary item not found');
    }
    return c.json({ success: true });
  });
