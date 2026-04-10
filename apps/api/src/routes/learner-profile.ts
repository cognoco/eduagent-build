import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import {
  deleteMemoryItemSchema,
  grantMemoryConsentSchema,
  tellMentorInputSchema,
  toggleMemoryCollectionSchema,
  toggleMemoryEnabledSchema,
  toggleMemoryInjectionSchema,
  unsuppressInferenceSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  buildHumanReadableMemoryExport,
  deleteAllMemory,
  deleteMemoryItem,
  getOrCreateLearningProfile,
  grantMemoryConsent,
  toggleMemoryCollection,
  toggleMemoryEnabled,
  toggleMemoryInjection,
  unsuppressInference,
} from '../services/learner-profile';
import { parseLearnerInput } from '../services/learner-input';
import { assertParentAccess } from '../services/family-access';

type LearnerProfileRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const learnerProfileRoutes = new Hono<LearnerProfileRouteEnv>()
  .get('/learner-profile', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const profile = await getOrCreateLearningProfile(db, profileId);
    return c.json({ profile });
  })
  .get('/learner-profile/export-text', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const profile = await getOrCreateLearningProfile(db, profileId);
    return c.json({
      text: buildHumanReadableMemoryExport(profile),
      profile,
    });
  })
  .get('/learner-profile/:profileId/export-text', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    await assertParentAccess(db, parentProfileId, childProfileId);
    const profile = await getOrCreateLearningProfile(db, childProfileId);
    return c.json({
      text: buildHumanReadableMemoryExport(profile),
      profile,
    });
  })
  .get('/learner-profile/:profileId', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    await assertParentAccess(db, parentProfileId, childProfileId);
    const profile = await getOrCreateLearningProfile(db, childProfileId);
    return c.json({ profile });
  })
  .delete(
    '/learner-profile/item',
    zValidator('json', deleteMemoryItemSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const input = c.req.valid('json');
      await deleteMemoryItem(
        db,
        profileId,
        input.category,
        input.value,
        input.suppress ?? false,
        input.subject
      );
      return c.json({ success: true });
    }
  )
  .delete(
    '/learner-profile/:profileId/item',
    zValidator('json', deleteMemoryItemSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const input = c.req.valid('json');
      await deleteMemoryItem(
        db,
        childProfileId,
        input.category,
        input.value,
        input.suppress ?? false,
        input.subject
      );
      return c.json({ success: true });
    }
  )
  .delete('/learner-profile/all', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    await deleteAllMemory(db, profileId);
    return c.json({ success: true });
  })
  .delete('/learner-profile/:profileId/all', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    await assertParentAccess(db, parentProfileId, childProfileId);
    await deleteAllMemory(db, childProfileId);
    return c.json({ success: true });
  })
  .patch(
    '/learner-profile/memory-enabled',
    zValidator('json', toggleMemoryEnabledSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { memoryEnabled } = c.req.valid('json');
      await toggleMemoryEnabled(db, profileId, memoryEnabled);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/:profileId/memory-enabled',
    zValidator('json', toggleMemoryEnabledSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { memoryEnabled } = c.req.valid('json');
      await toggleMemoryEnabled(db, childProfileId, memoryEnabled);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/collection',
    zValidator('json', toggleMemoryCollectionSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { memoryCollectionEnabled } = c.req.valid('json');
      await toggleMemoryCollection(db, profileId, memoryCollectionEnabled);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/:profileId/collection',
    zValidator('json', toggleMemoryCollectionSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { memoryCollectionEnabled } = c.req.valid('json');
      await toggleMemoryCollection(db, childProfileId, memoryCollectionEnabled);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/injection',
    zValidator('json', toggleMemoryInjectionSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { memoryInjectionEnabled } = c.req.valid('json');
      await toggleMemoryInjection(db, profileId, memoryInjectionEnabled);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/:profileId/injection',
    zValidator('json', toggleMemoryInjectionSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { memoryInjectionEnabled } = c.req.valid('json');
      await toggleMemoryInjection(db, childProfileId, memoryInjectionEnabled);
      return c.json({ success: true });
    }
  )
  .post(
    '/learner-profile/:profileId/consent',
    zValidator('json', grantMemoryConsentSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { consent } = c.req.valid('json');
      await grantMemoryConsent(db, childProfileId, consent);
      return c.json({ success: true });
    }
  )
  .post(
    '/learner-profile/tell',
    zValidator('json', tellMentorInputSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { text } = c.req.valid('json');
      const result = await parseLearnerInput(db, profileId, text, 'learner');
      return c.json(result);
    }
  )
  .post(
    '/learner-profile/:profileId/tell',
    zValidator('json', tellMentorInputSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { text } = c.req.valid('json');
      const result = await parseLearnerInput(
        db,
        childProfileId,
        text,
        'parent'
      );
      return c.json(result);
    }
  )
  .post(
    '/learner-profile/unsuppress',
    zValidator('json', unsuppressInferenceSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { value } = c.req.valid('json');
      await unsuppressInference(db, profileId, value);
      return c.json({ success: true });
    }
  )
  .post(
    '/learner-profile/:profileId/unsuppress',
    zValidator('json', unsuppressInferenceSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { value } = c.req.valid('json');
      await unsuppressInference(db, childProfileId, value);
      return c.json({ success: true });
    }
  );
