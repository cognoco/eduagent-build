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
  updateAccommodationModeSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
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
  updateAccommodationMode,
} from '../services/learner-profile';
import { parseLearnerInput } from '../services/learner-input';
import { assertParentAccess } from '../services/family-access';

type LearnerProfileRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
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
      const accountId = c.get('account').id;
      const input = c.req.valid('json');
      await deleteMemoryItem(
        db,
        profileId,
        accountId,
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
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await deleteMemoryItem(
        db,
        childProfileId,
        undefined,
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
    const accountId = c.get('account').id;
    await deleteAllMemory(db, profileId, accountId);
    return c.json({ success: true });
  })
  .delete('/learner-profile/:profileId/all', async (c) => {
    const db = c.get('db');
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('profileId');
    await assertParentAccess(db, parentProfileId, childProfileId);
    // accountId omitted: ownership verified via assertParentAccess (parent chain)
    await deleteAllMemory(db, childProfileId, undefined);
    return c.json({ success: true });
  })
  .patch(
    '/learner-profile/memory-enabled',
    zValidator('json', toggleMemoryEnabledSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const { memoryEnabled } = c.req.valid('json');
      await toggleMemoryEnabled(db, profileId, accountId, memoryEnabled);
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
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await toggleMemoryEnabled(db, childProfileId, undefined, memoryEnabled);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/collection',
    zValidator('json', toggleMemoryCollectionSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const { memoryCollectionEnabled } = c.req.valid('json');
      await toggleMemoryCollection(
        db,
        profileId,
        accountId,
        memoryCollectionEnabled
      );
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
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await toggleMemoryCollection(
        db,
        childProfileId,
        undefined,
        memoryCollectionEnabled
      );
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/injection',
    zValidator('json', toggleMemoryInjectionSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const { memoryInjectionEnabled } = c.req.valid('json');
      await toggleMemoryInjection(
        db,
        profileId,
        accountId,
        memoryInjectionEnabled
      );
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
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await toggleMemoryInjection(
        db,
        childProfileId,
        undefined,
        memoryInjectionEnabled
      );
      return c.json({ success: true });
    }
  )
  .post(
    '/learner-profile/consent',
    zValidator('json', grantMemoryConsentSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const { consent } = c.req.valid('json');
      await grantMemoryConsent(db, profileId, accountId, consent);
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
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await grantMemoryConsent(db, childProfileId, undefined, consent);
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
      const accountId = c.get('account').id;
      const { value } = c.req.valid('json');
      await unsuppressInference(db, profileId, accountId, value);
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
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await unsuppressInference(db, childProfileId, undefined, value);
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/accommodation-mode',
    zValidator('json', updateAccommodationModeSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const { accommodationMode } = c.req.valid('json');
      await updateAccommodationMode(
        db,
        profileId,
        accountId,
        accommodationMode
      );
      return c.json({ success: true });
    }
  )
  .patch(
    '/learner-profile/:profileId/accommodation-mode',
    zValidator('json', updateAccommodationModeSchema),
    async (c) => {
      const db = c.get('db');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { accommodationMode } = c.req.valid('json');
      // accountId omitted: ownership verified via assertParentAccess (parent chain)
      await updateAccommodationMode(
        db,
        childProfileId,
        undefined,
        accommodationMode
      );
      return c.json({ success: true });
    }
  );
