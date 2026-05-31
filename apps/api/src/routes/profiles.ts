import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileAppContextUpdateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
  profileResponseSchema,
  profileListResponseSchema,
  profileSwitchResponseSchema,
  ERROR_CODES,
  ForbiddenError,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireAccount } from '../middleware/profile-scope';
import { isIdentityV1Enabled } from '../config';

import { notFound, forbidden, validationError, apiError } from '../errors';
import {
  listProfiles,
  createProfileWithLimitCheck,
  getProfile,
  updateProfile,
  updateProfileAppContext,
  switchProfile,
  assertProfileCreationAllowed,
  ProfileValidationError,
  ProfileLimitError,
} from '../services/profile';

type ProfileEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    // [OPT-C] Kill switch for the server-side adult-owner rule. Set to 'false'
    // in Doppler to disable the gate (emergency rollback). Default 'true'.
    ADULT_OWNER_GATE_ENABLED?: string;
    MODE_IDENTITY_V1_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const profileRoutes = new Hono<ProfileEnv>()
  .get('/profiles', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    const profiles = await listProfiles(db, account.id);
    return c.json(profileListResponseSchema.parse({ profiles }));
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    const input = c.req.valid('json');

    // [CR-2026-05-19-H1 / BUG-407] Profile-creation authorization is owned by
    // the service layer (assertProfileCreationAllowed). It throws ForbiddenError
    // for the not-owner / fail-closed cases; the route translates that to 403.
    try {
      await assertProfileCreationAllowed(db, account.id, c.get('profileMeta'));

      const profile = await createProfileWithLimitCheck(db, account.id, input, {
        // [OPT-C] Default 'true' when binding missing (safe default; matches config default).
        adultOwnerGateEnabled: c.env?.ADULT_OWNER_GATE_ENABLED !== 'false',
        identityV1Enabled: isIdentityV1Enabled(c.env?.MODE_IDENTITY_V1_ENABLED),
        clerkUserId: c.get('user')?.userId,
      });

      return c.json(profileResponseSchema.parse({ profile }), 201);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        // Covers both the route-entry gate (assertProfileCreationAllowed) and
        // the service-side adult-owner gate inside createProfileWithLimitCheck.
        return apiError(c, 403, ERROR_CODES.FORBIDDEN, err.message);
      }
      if (err instanceof ProfileLimitError) {
        // [FIX-API-7] 402 Payment Required is the correct status for a quota gate
        // that requires a subscription upgrade. 403 Forbidden implies a permissions
        // issue the user can't resolve; 402 routes the mobile upgrade modal correctly.
        return apiError(
          c,
          402,
          ERROR_CODES.PROFILE_LIMIT_EXCEEDED,
          'Your subscription does not support additional profiles. Please upgrade to Family or Pro.',
        );
      }
      if (err instanceof ProfileValidationError) {
        return validationError(c, { [err.field]: [err.message] });
      }
      throw err;
    }
  })
  .get('/profiles/:id', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    const profile = await getProfile(db, c.req.param('id'), account.id);
    if (!profile) return notFound(c, 'Profile not found');
    return c.json(profileResponseSchema.parse({ profile }));
  })
  .patch(
    '/profiles/:id/app-context',
    zValidator('json', profileAppContextUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = requireAccount(c.get('account'));
      const id = c.req.param('id');
      const { defaultAppContext } = c.req.valid('json');

      const activeProfileId = c.get('profileId');
      const profileMeta = c.get('profileMeta');
      if (profileMeta?.isOwner !== true && id !== activeProfileId) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can update other profiles.',
        );
      }

      let profile: Awaited<ReturnType<typeof updateProfileAppContext>>;
      try {
        profile = await updateProfileAppContext(
          db,
          id,
          account.id,
          defaultAppContext,
        );
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return apiError(c, 403, ERROR_CODES.FORBIDDEN, err.message);
        }
        throw err;
      }
      if (!profile) return notFound(c, 'Profile not found');
      return c.json(profileResponseSchema.parse({ profile }));
    },
  )
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const id = c.req.param('id');
      const input = c.req.valid('json');

      // [CR-2026-05-19-H1] Only the account owner (or the profile itself) can
      // update a profile. A child profile on a parent's account must not be
      // able to edit sibling profiles (IDOR). Self-updates are always allowed
      // so a non-owner can still update their own displayName/avatar/colorScheme.
      const activeProfileId = c.get('profileId');
      const profileMeta = c.get('profileMeta');
      if (profileMeta?.isOwner !== true && id !== activeProfileId) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can update other profiles.',
        );
      }

      const profile = await updateProfile(db, id, account.id, input);
      if (!profile) return notFound(c, 'Profile not found');
      return c.json(profileResponseSchema.parse({ profile }));
    },
  )
  .post(
    '/profiles/switch',
    zValidator('json', profileSwitchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const { profileId } = c.req.valid('json');
      // No isOwner check here by design: switching the active profile is
      // account-scoped and purely per-device (not destructive). Any profile on
      // the account can legitimately switch to another profile on the same
      // account — e.g., a child handing the device back to a parent.
      // [CR-2026-05-19-H1 note: intentionally left without owner gate]
      const result = await switchProfile(db, profileId, account.id);
      if (!result)
        return forbidden(c, 'Profile does not belong to this account');
      return c.json(
        profileSwitchResponseSchema.parse({
          message: 'Profile switched',
          profileId,
        }),
      );
    },
  );
