import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  recallTestSubmitSchema,
  relearnTopicSchema,
  teachingPreferenceSchema,
  libraryRetentionResponseSchema,
  subjectRetentionResponseSchema,
  topicRetentionResponseSchema,
  recallTestResponseSchema,
  relearnResponseSchema,
  needsDeepeningResponseSchema,
  teachingPreferenceEndpointResponseSchema,
  deleteTeachingPreferenceResponseSchema,
  stabilityResponseSchema,
  evaluateEligibilitySchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import {
  getSubjectRetention,
  getAllSubjectsRetention,
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
  // [BUG-732 / PERF-2] Aggregate retention across all subjects in one round-trip
  // (Library mount used to fan out N parallel /subjects/:id/retention calls).
  // MUST be registered before /subjects/:subjectId/retention so Hono routes
  // /library/retention to this handler, not the param-matching one.
  .get('/library/retention', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const result = await getAllSubjectsRetention(db, profileId);
    return c.json(libraryRetentionResponseSchema.parse(result));
  })

  // Get retention status for all topics in subject
  .get(
    '/subjects/:subjectId/retention',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');

      const result = await getSubjectRetention(db, profileId, subjectId);
      return c.json(subjectRetentionResponseSchema.parse(result));
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
      return c.json(topicRetentionResponseSchema.parse({ card }));
    }
  )

  // Submit a delayed recall test
  .post(
    '/retention/recall-test',
    zValidator('json', recallTestSubmitSchema),
    async (c) => {
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const input = c.req.valid('json');

      const result = await processRecallTest(db, profileId, input);
      return c.json(recallTestResponseSchema.parse({ result }));
    }
  )

  // Start relearning a topic
  .post(
    '/retention/relearn',
    zValidator('json', relearnTopicSchema),
    async (c) => {
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const input = c.req.valid('json');

      const result = await startRelearn(db, profileId, input);
      return c.json(relearnResponseSchema.parse(result));
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
      return c.json(needsDeepeningResponseSchema.parse(result));
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
      return c.json(
        teachingPreferenceEndpointResponseSchema.parse({ preference })
      );
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
        return c.json(
          teachingPreferenceEndpointResponseSchema.parse({ preference })
        );
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
      return c.json(
        deleteTeachingPreferenceResponseSchema.parse({
          message: 'Teaching preference reset',
        })
      );
    }
  )

  // Get topic stability status (FR93)
  // [BUG-831] subjectId query param must be a UUID. Defense-in-depth: validate
  // at the boundary before passing to service so a malformed value never
  // reaches downstream queries.
  .get(
    '/retention/stability',
    zValidator('query', z.object({ subjectId: z.string().uuid().optional() })),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('query');

      const topics = await getStableTopics(db, profileId, subjectId);
      return c.json(stabilityResponseSchema.parse({ topics }));
    }
  )

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
      return c.json(evaluateEligibilitySchema.parse(eligibility));
    }
  );
