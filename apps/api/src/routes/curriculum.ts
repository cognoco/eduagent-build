import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  topicSkipSchema,
  topicUnskipSchema,
  curriculumChallengeSchema,
  curriculumTopicAddSchema,
  curriculumAdaptRequestSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getCurriculum,
  skipTopic,
  unskipTopic,
  challengeCurriculum,
  explainTopicOrdering,
  addCurriculumTopic,
  adaptCurriculumFromPerformance,
} from '../services/curriculum';
import { notFound, unauthorized, apiError } from '../errors';

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
        if (error instanceof Error) {
          if (error.message === 'Subject not found')
            return notFound(c, 'Subject not found');
          if (error.message === 'Curriculum not found')
            return notFound(c, 'Curriculum not found');
          if (error.message === 'Topic not found in curriculum')
            return notFound(c, 'Topic not found in curriculum');
        }
        throw error;
      }
    }
  )
  // Unskip (restore) a topic
  .post(
    '/subjects/:subjectId/curriculum/unskip',
    zValidator('json', topicUnskipSchema),
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
        await unskipTopic(db, profileId, subjectId, topicId);
        return c.json({ message: 'Topic restored', topicId });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Subject not found')
            return notFound(c, 'Subject not found');
          if (error.message === 'Curriculum not found')
            return notFound(c, 'Curriculum not found');
          if (error.message === 'Topic not found in curriculum')
            return notFound(c, 'Topic not found in curriculum');
          if (error.message === 'Topic is not skipped')
            return apiError(
              c,
              422,
              ERROR_CODES.VALIDATION_ERROR,
              'Topic is not skipped'
            );
        }
        throw error;
      }
    }
  )
  // Challenge/regenerate curriculum
  .post(
    '/subjects/:subjectId/curriculum/topics',
    zValidator('json', curriculumTopicAddSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = c.get('profileId');
      if (!profileId)
        return unauthorized(
          c,
          'Profile selection required (X-Profile-Id header)'
        );
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      try {
        const result = await addCurriculumTopic(
          db,
          profileId,
          subjectId,
          input
        );
        return c.json(result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Subject not found')
            return notFound(c, 'Subject not found');
          if (error.message === 'Curriculum not found')
            return notFound(c, 'Curriculum not found');
        }
        throw error;
      }
    }
  )
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
  // Performance-driven curriculum adaptation (FR21)
  .post(
    '/subjects/:subjectId/curriculum/adapt',
    zValidator('json', curriculumAdaptRequestSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = c.get('profileId');
      if (!profileId)
        return unauthorized(
          c,
          'Profile selection required (X-Profile-Id header)'
        );
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');

      const result = await adaptCurriculumFromPerformance(
        db,
        profileId,
        subjectId,
        input
      );
      return c.json(result);
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
