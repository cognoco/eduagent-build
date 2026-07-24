import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Database } from '@eduagent/database';
import {
  deleteMemoryItemSchema,
  grantMemoryConsentSchema,
  learnerProfileExportTextResponseSchema,
  learnerProfileGetResponseSchema,
  learnerProfileSuccessResponseSchema,
  parseLearnerInputResultSchema,
  tellMentorInputSchema,
  toggleMemoryCollectionSchema,
  toggleMemoryInjectionSchema,
  unsuppressInferenceSchema,
  updateAccommodationModeSchema,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireAccount } from '../middleware/profile-scope';
import type { ProfileMeta } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
import {
  buildHumanReadableMemoryExport,
  deleteAllMemory,
  deleteMemoryItem,
  getOrCreateLearningProfile,
  grantMemoryConsent,
  toggleMemoryCollection,
  toggleMemoryInjection,
  unsuppressInference,
  updateAccommodationMode,
} from '../services/learner-profile';
import { parseLearnerInput } from '../services/learner-input';
import {
  assertCanManageOwnConsent,
  assertCanReadProfile,
  assertChargeNotCredentialed,
  assertOwnerAndParentAccess,
} from '../services/family-access';
import { assertChildDashboardDataVisible } from '../services/dashboard';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import {
  getOrCreateMemoryProjection,
  toLearnerSelfView,
} from '../services/memory/projection';
import { isMemoryFactsReadEnabled } from '../config';

type LearnerProfileRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    MEMORY_FACTS_READ_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const learnerProfileRoutes = new Hono<LearnerProfileRouteEnv>()
  .get('/learner-profile', async (c) => {
    const { db, profileId } = withProfile(c);
    // [WI-2416] Header-resolved profileId is only org-checked; verify caller
    // authority (self or guardian of an uncredentialed charge) before reading.
    await assertCanReadProfile(c, profileId);
    const projection = await getOrCreateMemoryProjection(db, profileId, {
      memoryFactsReadEnabled: isMemoryFactsReadEnabled(
        c.env.MEMORY_FACTS_READ_ENABLED,
      ),
    });
    return c.json(
      learnerProfileGetResponseSchema.parse({
        profile: toLearnerSelfView(projection),
      }),
    );
  })
  .get('/learner-profile/export-text', async (c) => {
    const { db, profileId } = withProfile(c);
    // [WI-2416] Header-resolved profileId is only org-checked; verify caller
    // authority (self or guardian of an uncredentialed charge) before reading.
    await assertCanReadProfile(c, profileId);
    const profile = await getOrCreateLearningProfile(db, profileId);
    return c.json(
      learnerProfileExportTextResponseSchema.parse({
        text: buildHumanReadableMemoryExport(profile),
        profile,
      }),
    );
  })
  .get('/learner-profile/:profileId/export-text', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    await assertChargeNotCredentialed(db, childProfileId);
    // [WI-156] Child consent gate: blocks access when child GDPR consent is not active
    await assertChildDashboardDataVisible(db, childProfileId);
    const profile = await getOrCreateLearningProfile(db, childProfileId);
    return c.json(
      learnerProfileExportTextResponseSchema.parse({
        text: buildHumanReadableMemoryExport(profile),
        profile,
      }),
    );
  })
  .get('/learner-profile/:profileId', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    await assertChargeNotCredentialed(db, childProfileId);
    // [WI-156] Child consent gate: blocks access when child GDPR consent is not active
    await assertChildDashboardDataVisible(db, childProfileId);
    const profile = await getOrCreateLearningProfile(db, childProfileId);
    return c.json(learnerProfileGetResponseSchema.parse({ profile }));
  })
  .delete(
    '/learner-profile/item',
    zValidator('json', deleteMemoryItemSchema),
    async (c) => {
      // [WI-371 / DS-185] Proxy callers must use the owner-gated
      // /:profileId/item route; the self route is not consent-managed and was
      // otherwise unguarded (not metered), so a parent acting as a child could
      // erase the child's memory items here. assertCanManageOwnConsent is not
      // used because erasure is not a consent toggle.
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const input = c.req.valid('json');
      await deleteMemoryItem(
        db,
        profileId,
        accountId,
        input.category,
        input.value,
        input.suppress ?? false,
        input.subject,
        {
          callerPersonId: c.get('callerPersonId'),
        },
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .delete(
    '/learner-profile/:profileId/item',
    zValidator('json', deleteMemoryItemSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] No child-consent read-gate here: erasure (right to erasure)
      // must remain available even when the child's consent is withdrawn.
      const input = c.req.valid('json');
      // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
      await deleteMemoryItem(
        db,
        childProfileId,
        undefined,
        input.category,
        input.value,
        input.suppress ?? false,
        input.subject,
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .delete('/learner-profile/all', async (c) => {
    assertCanManageOwnConsent(c.get('profileMeta'));
    const { db, profileId } = withProfile(c);
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const accountId = requireAccount(c.get('account')).id;
    await deleteAllMemory(db, profileId, accountId, {
      callerPersonId: c.get('callerPersonId'),
    });
    return c.json({ success: true });
  })
  .delete('/learner-profile/:profileId/all', async (c) => {
    const { db, profileId: parentProfileId } = withProfile(c);
    const childProfileId = c.req.param('profileId');
    // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
    await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
    await assertChargeNotCredentialed(db, childProfileId);
    // [WI-156] No child-consent read-gate here: erasure (right to erasure)
    // must remain available even when the child's consent is withdrawn.
    // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
    await deleteAllMemory(db, childProfileId, undefined);
    return c.json({ success: true });
  })
  .patch(
    '/learner-profile/collection',
    zValidator('json', toggleMemoryCollectionSchema),
    async (c) => {
      // [CR-2026-05-21-010] Minor non-owner profiles cannot toggle memory
      // collection on self — data-collection consent is parent-controlled.
      assertCanManageOwnConsent(c.get('profileMeta'));
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const { memoryCollectionEnabled } = c.req.valid('json');
      await toggleMemoryCollection(
        db,
        profileId,
        accountId,
        memoryCollectionEnabled,
        {
          callerPersonId: c.get('callerPersonId'),
        },
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .patch(
    '/learner-profile/:profileId/collection',
    zValidator('json', toggleMemoryCollectionSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] No child-consent read-gate here: disabling collection is a
      // privacy-reducing action that must remain available post-withdrawal.
      const { memoryCollectionEnabled } = c.req.valid('json');
      // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
      await toggleMemoryCollection(
        db,
        childProfileId,
        undefined,
        memoryCollectionEnabled,
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .patch(
    '/learner-profile/injection',
    zValidator('json', toggleMemoryInjectionSchema),
    async (c) => {
      // [CR-2026-05-21-010] Minor non-owner profiles cannot toggle memory
      // injection on self — injection consent is parent-controlled.
      assertCanManageOwnConsent(c.get('profileMeta'));
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const { memoryInjectionEnabled } = c.req.valid('json');
      await toggleMemoryInjection(
        db,
        profileId,
        accountId,
        memoryInjectionEnabled,
        {
          callerPersonId: c.get('callerPersonId'),
        },
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .patch(
    '/learner-profile/:profileId/injection',
    zValidator('json', toggleMemoryInjectionSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] No child-consent read-gate here: disabling injection is a
      // privacy-reducing action that must remain available post-withdrawal.
      const { memoryInjectionEnabled } = c.req.valid('json');
      // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
      await toggleMemoryInjection(
        db,
        childProfileId,
        undefined,
        memoryInjectionEnabled,
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .post(
    '/learner-profile/consent',
    zValidator('json', grantMemoryConsentSchema),
    async (c) => {
      // [CR-2026-05-21-010] Minor non-owner profiles cannot self-grant or
      // self-revoke memory consent — the parent's grant (via /:profileId/consent)
      // must not be overridden by the child acting on self.
      assertCanManageOwnConsent(c.get('profileMeta'));
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const { consent } = c.req.valid('json');
      await grantMemoryConsent(db, profileId, accountId, consent, {
        callerPersonId: c.get('callerPersonId'),
      });
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .post(
    '/learner-profile/:profileId/consent',
    zValidator('json', grantMemoryConsentSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] No child-consent read-gate here: this manages mentor-memory
      // consent, so the credentialed-charge operational guard still applies.
      const { consent } = c.req.valid('json');
      // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
      await grantMemoryConsent(db, childProfileId, undefined, consent);
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .post(
    '/learner-profile/tell',
    zValidator('json', tellMentorInputSchema),
    async (c) => {
      // [WI-371 / DS-185] Route-level proxy guard (defense-in-depth alongside
      // the metering middleware, which also guards this LLM-metered route). A
      // parent acting as a child (isOwner === false) must not inject
      // mentor-memory content via the child's self screen; the owner-gated
      // /:profileId/tell route is the sanctioned parent path.
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
      // parseLearnerInput unconditionally dispatches the LLM
      // (parseLearnerInputToAnalysis calls the LLM router).
      await assertLlmConsent(db, profileId);
      const { text } = c.req.valid('json');
      const result = await parseLearnerInput(db, profileId, text, 'learner');
      return c.json(parseLearnerInputResultSchema.parse(result));
    },
  )
  .post(
    '/learner-profile/:profileId/tell',
    zValidator('json', tellMentorInputSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] Child consent gate: blocks access when child GDPR consent is not active
      await assertChildDashboardDataVisible(db, childProfileId);
      // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5) — a
      // separate, LLM-specific check from the GDPR/parental gate above.
      // parseLearnerInput unconditionally dispatches the LLM
      // (parseLearnerInputToAnalysis calls the LLM router) for the CHILD's
      // profile.
      await assertLlmConsent(db, childProfileId);
      const { text } = c.req.valid('json');
      const result = await parseLearnerInput(
        db,
        childProfileId,
        text,
        'parent',
      );
      return c.json(parseLearnerInputResultSchema.parse(result));
    },
  )
  .post(
    '/learner-profile/unsuppress',
    zValidator('json', unsuppressInferenceSchema),
    async (c) => {
      // [WI-371 / DS-185] Same rationale as DELETE /item: un-hiding an
      // inference is a memory-content write, not a consent toggle, and the
      // self route was unguarded. Proxy callers use the owner-gated
      // /:profileId/unsuppress route.
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const { value } = c.req.valid('json');
      await unsuppressInference(db, profileId, accountId, value, {
        callerPersonId: c.get('callerPersonId'),
      });
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .post(
    '/learner-profile/:profileId/unsuppress',
    zValidator('json', unsuppressInferenceSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] Child consent gate: blocks access when child GDPR consent is not active
      await assertChildDashboardDataVisible(db, childProfileId);
      const { value } = c.req.valid('json');
      // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
      await unsuppressInference(db, childProfileId, undefined, value);
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .patch(
    '/learner-profile/accommodation-mode',
    zValidator('json', updateAccommodationModeSchema),
    async (c) => {
      // [SEC-L2-ACCMODE] Server-derived proxy-mode write guard. Every sibling
      // self-route in this file gates proxy callers (assertNotProxyMode on
      // /tell, /unsuppress, /item; assertCanManageOwnConsent on the consent
      // toggles) — this route was the lone unguarded self-write. Accommodation
      // mode is not metered, so the metering middleware's assertNotProxyMode
      // does not cover it. Without this guard a parent acting as a child
      // (isOwner === false) could mutate the child's accommodation mode through
      // the self route, bypassing the owner + parent-link verification on the
      // /:profileId/accommodation-mode route. A proxy caller must use that
      // owner-gated route instead.
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const { accommodationMode } = c.req.valid('json');
      await updateAccommodationMode(
        db,
        profileId,
        accountId,
        accommodationMode,
        {
          callerPersonId: c.get('callerPersonId'),
        },
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  )
  .patch(
    '/learner-profile/:profileId/accommodation-mode',
    zValidator('json', updateAccommodationModeSchema),
    async (c) => {
      const { db, profileId: parentProfileId } = withProfile(c);
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] assertOwnerAndParentAccess: isOwner gate + IDOR guard
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      await assertChargeNotCredentialed(db, childProfileId);
      // [WI-156] Child consent gate: blocks access when child GDPR consent is not active
      await assertChildDashboardDataVisible(db, childProfileId);
      const { accommodationMode } = c.req.valid('json');
      // accountId omitted: ownership verified via assertOwnerAndParentAccess (parent chain)
      await updateAccommodationMode(
        db,
        childProfileId,
        undefined,
        accommodationMode,
      );
      return c.json(
        learnerProfileSuccessResponseSchema.parse({ success: true }),
      );
    },
  );
