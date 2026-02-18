import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { topicSkipSchema, curriculumChallengeSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getCurriculum,
  skipTopic,
  challengeCurriculum,
  explainTopicOrdering,
} from '../services/curriculum';
import { notFound, unauthorized } from '../errors';

type CurriculumRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const curriculumRoutes = new Hono<CurriculumRouteEnv>()
  // Get curriculum for a subject
  .get('/subjects/:subjectId/curriculum', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');
    if (!profileId)
      return unauthorized(
        c,
        'Profile selection required (X-Profile-Id header)'
      );
    const subjectId = c.req.param('subjectId');
    const curriculum = await getCurriculum(db, profileId, subjectId);
    return c.json({ curriculum });
  })
  // Skip a topic
  .post(
    '/subjects/:subjectId/curriculum/skip',
    zValidator('json', topicSkipSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = c.get('profileId');
      if (!profileId)
        return unauthorized(
          c,
          'Profile selection required (X-Profile-Id header)'
        );
      const subjectId = c.req.param('subjectId');
      const { topicId } = c.req.valid('json');
      try {
        await skipTopic(db, profileId, subjectId, topicId);
        return c.json({ message: 'Topic skipped', topicId });
      } catch (error) {
        if (error instanceof Error && error.message === 'Subject not found') {
          return notFound(c, 'Subject not found');
        }
        throw error;
      }
    }
  )
  // Challenge/regenerate curriculum
  .post(
    '/subjects/:subjectId/curriculum/challenge',
    zValidator('json', curriculumChallengeSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = c.get('profileId');
      if (!profileId)
        return unauthorized(
          c,
          'Profile selection required (X-Profile-Id header)'
        );
      const subjectId = c.req.param('subjectId');
      const { feedback } = c.req.valid('json');
      try {
        const curriculum = await challengeCurriculum(
          db,
          profileId,
          subjectId,
          feedback
        );
        return c.json({ curriculum });
      } catch (error) {
        if (error instanceof Error && error.message === 'Subject not found') {
          return notFound(c, 'Subject not found');
        }
        throw error;
      }
    }
  )
  // Explain topic ordering
  .get('/subjects/:subjectId/curriculum/topics/:topicId/explain', async (c) => {
    const db = c.get('db');
    const profileId = c.get('profileId');
    if (!profileId)
      return unauthorized(
        c,
        'Profile selection required (X-Profile-Id header)'
      );
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');
    try {
      const explanation = await explainTopicOrdering(
        db,
        profileId,
        subjectId,
        topicId
      );
      return c.json({ explanation });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Subject not found')
          return notFound(c, 'Subject not found');
        if (error.message === 'Topic not found')
          return notFound(c, 'Topic not found');
      }
      throw error;
    }
  });
