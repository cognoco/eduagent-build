// ---------------------------------------------------------------------------
// Onboarding Routes — BKT-C.1 / BKT-C.2
// PATCH endpoints for the three personalization dimensions surfaced during
// onboarding. Each has a self-service variant (writes to the active profile)
// and a parent-on-behalf-of-child variant (requires family_links proof).
//
// Per CLAUDE.md "Hono route files keep handlers inline for RPC inference, but
// business logic belongs in services/" — this file is pure glue between the
// Zod validators, the auth/scope middleware, and services/onboarding.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  onboardingLanguagePatchSchema,
  onboardingPronounsPatchSchema,
  onboardingInterestsContextPatchSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import { assertParentAccess } from '../services/family-access';
import { notFound } from '../errors';
import {
  updateConversationLanguage,
  updatePronouns,
  updateInterestsContext,
  OnboardingNotFoundError,
} from '../services/onboarding';

type OnboardingRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
  };
};

export const onboardingRoutes = new Hono<OnboardingRouteEnv>()
  // ---- Conversation language ----------------------------------------------
  .patch(
    '/onboarding/language',
    zValidator('json', onboardingLanguagePatchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = requireProfileId(c.get('profileId'));
      const { conversationLanguage } = c.req.valid('json');
      try {
        await updateConversationLanguage(
          db,
          profileId,
          account.id,
          conversationLanguage
        );
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json({ success: true });
    }
  )
  .patch(
    '/onboarding/:profileId/language',
    zValidator('json', onboardingLanguagePatchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { conversationLanguage } = c.req.valid('json');
      try {
        await updateConversationLanguage(
          db,
          childProfileId,
          account.id,
          conversationLanguage
        );
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json({ success: true });
    }
  )
  // ---- Pronouns -----------------------------------------------------------
  .patch(
    '/onboarding/pronouns',
    zValidator('json', onboardingPronounsPatchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = requireProfileId(c.get('profileId'));
      const { pronouns } = c.req.valid('json');
      try {
        await updatePronouns(db, profileId, account.id, pronouns);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json({ success: true });
    }
  )
  .patch(
    '/onboarding/:profileId/pronouns',
    zValidator('json', onboardingPronounsPatchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { pronouns } = c.req.valid('json');
      try {
        await updatePronouns(db, childProfileId, account.id, pronouns);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json({ success: true });
    }
  )
  // ---- Interest context ---------------------------------------------------
  .patch(
    '/onboarding/interests/context',
    zValidator('json', onboardingInterestsContextPatchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const profileId = requireProfileId(c.get('profileId'));
      const { interests } = c.req.valid('json');
      try {
        await updateInterestsContext(db, profileId, account.id, interests);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json({ success: true });
    }
  )
  .patch(
    '/onboarding/:profileId/interests/context',
    zValidator('json', onboardingInterestsContextPatchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      await assertParentAccess(db, parentProfileId, childProfileId);
      const { interests } = c.req.valid('json');
      try {
        await updateInterestsContext(db, childProfileId, account.id, interests);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json({ success: true });
    }
  );
