import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  recallTestSubmitSchema,
  relearnTopicSchema,
  teachingPreferenceSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  getSubjectRetention,
  getTopicRetention,
  processRecallTest,
  startRelearn,
  getSubjectNeedsDeepening,
  getTeachingPreference,
  setTeachingPreference,
  deleteTeachingPreference,
} from '../services/retention-data';

type RetentionRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const retentionRoutes = new Hono<RetentionRouteEnv>()
  // Get retention status for all topics in subject
  .get('/subjects/:subjectId/retention', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    const result = await getSubjectRetention(db, profileId, subjectId);
    return c.json(result);
  })

  // Get retention card for single topic
  .get('/topics/:topicId/retention', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const topicId = c.req.param('topicId');

    const card = await getTopicRetention(db, profileId, topicId);
    return c.json({ card });
  })

  // Submit a delayed recall test
  .post(
    '/retention/recall-test',
    zValidator('json', recallTestSubmitSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
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
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const input = c.req.valid('json');

      const result = await startRelearn(db, profileId, input);
      return c.json(result);
    }
  )

  // Get topics needing extra review
  .get('/subjects/:subjectId/needs-deepening', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    const result = await getSubjectNeedsDeepening(db, profileId, subjectId);
    return c.json(result);
  })

  // Get teaching method preference
  .get('/subjects/:subjectId/teaching-preference', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    const preference = await getTeachingPreference(db, profileId, subjectId);
    return c.json({ preference });
  })

  // Set teaching method preference
  .put(
    '/subjects/:subjectId/teaching-preference',
    zValidator('json', teachingPreferenceSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = c.get('profileId') ?? account.id;
      const subjectId = c.req.param('subjectId');
      const { method } = c.req.valid('json');

      const preference = await setTeachingPreference(
        db,
        profileId,
        subjectId,
        method
      );
      return c.json({ preference });
    }
  )

  // Reset teaching preference (FR66)
  .delete('/subjects/:subjectId/teaching-preference', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subjectId = c.req.param('subjectId');

    await deleteTeachingPreference(db, profileId, subjectId);
    return c.json({ message: 'Teaching preference reset' });
  });
