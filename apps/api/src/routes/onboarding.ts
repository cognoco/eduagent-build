// ---------------------------------------------------------------------------
// Onboarding Routes — BKT-C.1 / BKT-C.2
// PATCH endpoints for the three personalization dimensions surfaced during
// onboarding. Each has a self-service variant (writes to the active profile)
// and a parent-on-behalf-of-child variant (requires family_links proof).
//
// Per AGENTS.md "Hono route files keep handlers inline for RPC inference, but
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
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId, requireAccount } from '../middleware/profile-scope';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import {
  assertOwnerAndParentAccess,
  assertOwnerProfile,
} from '../services/family-access';
import { notFound } from '../errors';
import {
  updateInterestsContext,
  assertPronounsSelfEditAllowed,
  OnboardingNotFoundError,
} from '../services/onboarding';
import {
  updateConversationLanguageV2,
  updatePronounsV2,
} from '../services/identity-v2/onboarding-v2';

type OnboardingRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
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

// [WI-867] v2 always: collapsed from dispatch-with-flag pattern.
async function dispatchUpdateConversationLanguage(
  db: Database,
  profileId: string,
  accountId: string,
  conversationLanguage: Parameters<typeof updateConversationLanguageV2>[3],
): Promise<void> {
  const ok = await updateConversationLanguageV2(
    db,
    profileId,
    accountId,
    conversationLanguage,
  );
  if (!ok) throw new OnboardingNotFoundError(profileId);
}

async function dispatchUpdatePronouns(
  db: Database,
  profileId: string,
  accountId: string,
  pronouns: Parameters<typeof updatePronounsV2>[3],
): Promise<void> {
  const ok = await updatePronounsV2(db, profileId, accountId, pronouns);
  if (!ok) throw new OnboardingNotFoundError(profileId);
}

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
      assertOwnerProfile(
        c,
        'Only the account owner can change the conversation language.',
      );
      const { conversationLanguage } = c.req.valid('json');
      try {
        await dispatchUpdateConversationLanguage(
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
        await dispatchUpdateConversationLanguage(
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
      // WI-278: Server-side age gate (mirrors the client's self-skip so a
      // modified client cannot bypass it). The business rule lives in the
      // service guard; the parent-managed /:profileId/pronouns route is exempt
      // because a parent setting pronouns for their child is the allowed path.
      // Throws ForbiddenError → 403 for under-min-age profiles.
      //
      // Order note: age gate runs BEFORE assertNotProxyMode so an under-min-age
      // caller (which is also the typical proxy-mode scenario) gets the more
      // specific FORBIDDEN/age-related rejection rather than PROXY_MODE. Both
      // are 403; preserving the more specific error preserves UX and the
      // pronouns-age-gate integration test contract.
      assertPronounsSelfEditAllowed(c.get('profileMeta')?.birthYear);
      // [WI-160 / DS-071] Self-edit must be from an owner-profile session.
      // A parent in proxy mode (active profile = child, but old enough) should
      // use the /onboarding/:profileId/pronouns route instead.
      assertNotProxyMode(c);
      const { pronouns } = c.req.valid('json');
      try {
        await dispatchUpdatePronouns(db, profileId, account.id, pronouns);
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
        await dispatchUpdatePronouns(db, childProfileId, account.id, pronouns);
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
      // [WI-160 / DS-071] Self-edit must be from an owner-profile session.
      // A parent in proxy mode (active profile = child) should use the
      // /onboarding/:profileId/interests/context route instead, not the
      // self-edit path. (The prior "interests are personal" comment described
      // child-as-owner self-editing, which assertNotProxyMode preserves.)
      assertNotProxyMode(c);
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
