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
  onboardingSuccessResponseSchema,
  PRONOUNS_PROMPT_MIN_AGE,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId, requireAccount } from '../middleware/profile-scope';
import { assertOwnerAndParentAccess } from '../services/family-access';
import { notFound, forbidden } from '../errors';
import { calculateAge } from '../services/consent';
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
    // [CR-2026-05-19-H1] Required by assertOwnerAndParentAccess to gate
    // parent-admin routes to owner profiles only.
    profileMeta: ProfileMeta | undefined;
  };
};

export const onboardingRoutes = new Hono<OnboardingRouteEnv>()
  // ---- Conversation language ----------------------------------------------
  .patch(
    '/onboarding/language',
    zValidator('json', onboardingLanguagePatchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const profileId = requireProfileId(c.get('profileId'));
      // [CR-2026-05-21-011] conversationLanguage is owner-gated: a child on a
      // parent's account must not unilaterally change the AI tutor language.
      const activeProfileMetaLanguage = c.get('profileMeta');
      if (activeProfileMetaLanguage?.isOwner !== true) {
        return forbidden(
          c,
          'Only the account owner can change the conversation language.',
        );
      }
      const { conversationLanguage } = c.req.valid('json');
      try {
        await updateConversationLanguage(
          db,
          profileId,
          account.id,
          conversationLanguage,
        );
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json(onboardingSuccessResponseSchema.parse({ success: true }));
    },
  )
  .patch(
    '/onboarding/:profileId/language',
    zValidator('json', onboardingLanguagePatchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] isOwner gate + IDOR guard (see learner-profile.ts)
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      const { conversationLanguage } = c.req.valid('json');
      try {
        await updateConversationLanguage(
          db,
          childProfileId,
          account.id,
          conversationLanguage,
        );
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json(onboardingSuccessResponseSchema.parse({ success: true }));
    },
  )
  // ---- Pronouns -----------------------------------------------------------
  .patch(
    '/onboarding/pronouns',
    zValidator('json', onboardingPronounsPatchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const profileId = requireProfileId(c.get('profileId'));
      // WI-278: Server-side age gate — the client skips the pronouns screen for
      // under-13 users, but we enforce the same boundary on the server so that
      // a modified client cannot bypass it. Year-only age is used here (matches
      // the client gate). The parent-managed /:profileId/pronouns route is exempt
      // because a parent setting pronouns for their child is the allowed path.
      const profileMetaPronouns = c.get('profileMeta');
      if (
        profileMetaPronouns?.birthYear != null &&
        calculateAge(profileMetaPronouns.birthYear) < PRONOUNS_PROMPT_MIN_AGE
      ) {
        return forbidden(
          c,
          'Pronouns cannot be self-set for profiles under the minimum age.',
        );
      }
      const { pronouns } = c.req.valid('json');
      try {
        await updatePronouns(db, profileId, account.id, pronouns);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json(onboardingSuccessResponseSchema.parse({ success: true }));
    },
  )
  .patch(
    '/onboarding/:profileId/pronouns',
    zValidator('json', onboardingPronounsPatchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] isOwner gate + IDOR guard (see learner-profile.ts)
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      const { pronouns } = c.req.valid('json');
      try {
        await updatePronouns(db, childProfileId, account.id, pronouns);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json(onboardingSuccessResponseSchema.parse({ success: true }));
    },
  )
  // ---- Interest context ---------------------------------------------------
  .patch(
    '/onboarding/interests/context',
    zValidator('json', onboardingInterestsContextPatchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const profileId = requireProfileId(c.get('profileId'));
      // self-edit allowed: interests are personal to the learner, gating would break solo learning
      const { interests } = c.req.valid('json');
      try {
        await updateInterestsContext(db, profileId, account.id, interests);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json(onboardingSuccessResponseSchema.parse({ success: true }));
    },
  )
  .patch(
    '/onboarding/:profileId/interests/context',
    zValidator('json', onboardingInterestsContextPatchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const parentProfileId = requireProfileId(c.get('profileId'));
      const childProfileId = c.req.param('profileId');
      // [CR-2026-05-19-H1] isOwner gate + IDOR guard (see learner-profile.ts)
      await assertOwnerAndParentAccess(c, db, parentProfileId, childProfileId);
      const { interests } = c.req.valid('json');
      try {
        await updateInterestsContext(db, childProfileId, account.id, interests);
      } catch (err) {
        if (err instanceof OnboardingNotFoundError) {
          return notFound(c, 'Profile not found');
        }
        throw err;
      }
      return c.json(onboardingSuccessResponseSchema.parse({ success: true }));
    },
  );
