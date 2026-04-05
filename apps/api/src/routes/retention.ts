import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  recallTestSubmitSchema,
  relearnTopicSchema,
  teachingPreferenceSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  getSubjectRetention,
  getTopicRetention,
  processRecallTest,
  startRelearn,
  getSubjectNeedsDeepening,
  getTeachingPreference,
  setTeachingPreference,
  deleteTeachingPreference,
  getStableTopics,
} from '../services/retention-data';
import { checkEvaluateEligibility } from '../services/evaluate-data';
import { notFound, NotFoundError } from '../errors';

type RetentionRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

const topicParamSchema = z.object({
  topicId: z.string().uuid(),
});

export const retentionRoutes = new Hono<RetentionRouteEnv>()
  // Get retention status for all topics in subject
  .get(
    '/subjects/:subjectId/retention',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');

      const result = await getSubjectRetention(db, profileId, subjectId);
      return c.json(result);
    }
  )

  // Get retention card for single topic
  .get(
    '/topics/:topicId/retention',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');

      const card = await getTopicRetention(db, profileId, topicId);
      return c.json({ card });
    }
  )

  // Submit a delayed recall test
  .post(
    '/retention/recall-test',
    zValidator('json', recallTestSubmitSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const input = c.req.valid('json');

      const result = await processRecallTest(db, profileId, input);
      return c.json({ result });
    }
  )

  // Start relearning a topic
  .post(
    '/retention/relearn',
    zValidator('json', relearnTopicSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const input = c.req.valid('json');

      const result = await startRelearn(db, profileId, input);
      return c.json(result);
    }
  )

  // Get topics needing extra review
  .get(
    '/subjects/:subjectId/needs-deepening',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');

      const result = await getSubjectNeedsDeepening(db, profileId, subjectId);
      return c.json(result);
    }
  )

  // Get teaching method preference
  .get(
    '/subjects/:subjectId/teaching-preference',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');

      const preference = await getTeachingPreference(db, profileId, subjectId);
      return c.json({ preference });
    }
  )

  // Set teaching method preference (with optional analogy domain)
  .put(
    '/subjects/:subjectId/teaching-preference',
    zValidator('param', subjectParamSchema),
    zValidator('json', teachingPreferenceSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const { method, analogyDomain } = c.req.valid('json');

      try {
        const preference = await setTeachingPreference(
          db,
          profileId,
          subjectId,
          method,
          analogyDomain
        );
        return c.json({ preference });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    }
  )

  // Reset teaching preference (FR66)
  .delete(
    '/subjects/:subjectId/teaching-preference',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');

      await deleteTeachingPreference(db, profileId, subjectId);
      return c.json({ message: 'Teaching preference reset' });
    }
  )

  // Get topic stability status (FR93)
  .get('/retention/stability', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.query('subjectId');

    const topics = await getStableTopics(db, profileId, subjectId || undefined);
    return c.json({ topics });
  })

  // Check EVALUATE eligibility for a topic (FR128-129)
  .get(
    '/topics/:topicId/evaluate-eligibility',
    zValidator('param', topicParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { topicId } = c.req.valid('param');

      const eligibility = await checkEvaluateEligibility(
        db,
        profileId,
        topicId
      );
      return c.json(eligibility);
    }
  );
