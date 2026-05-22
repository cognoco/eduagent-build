import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
  profileResponseSchema,
  profileListResponseSchema,
  profileSwitchResponseSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import { notFound, forbidden, validationError, apiError } from '../errors';
import {
  listProfiles,
  createProfileWithLimitCheck,
  getProfile,
  updateProfile,
  switchProfile,
  countProfiles,
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
    const account = c.get('account');
    const profiles = await listProfiles(db, account.id);
    return c.json(profileListResponseSchema.parse({ profiles }));
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const input = c.req.valid('json');

    // [CR-2026-05-19-H1 / BUG-407] Only the account owner can create additional
    // profiles. Two distinct cases:
    //
    // 1. profileMeta is present: straightforward — enforce isOwner === true.
    // 2. profileMeta is absent: could be a first-profile creation (brand-new
    //    account, no profiles yet) OR a broken/edge state where meta failed to
    //    load despite existing profiles. The old heuristic treated "meta absent"
    //    as "first profile" and allowed the request — this is wrong when the
    //    account already has profiles but meta resolution failed silently.
    //
    //    Fix: do a real DB count. If 0 profiles exist, allow (first-profile
    //    path). If 1+ exist, the owner must have been in meta — reject 403.
    const activeProfileMetaCreate = c.get('profileMeta');
    if (activeProfileMetaCreate) {
      if (activeProfileMetaCreate.isOwner !== true) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can create additional profiles.',
        );
      }
    } else {
      // profileMeta absent — check DB to determine if this is a first-profile creation.
      // TODO(G1): move countProfiles+403 logic to services/profile.ts as assertProfileCreationAllowed(db, accountId)
      const existingCount = await countProfiles(db, account.id);
      if (existingCount > 0) {
        // Profiles exist but no owner meta resolved — never allow (fail closed).
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can create additional profiles.',
        );
      }
      // existingCount === 0: brand-new account, first profile creation is always allowed.
    }

    try {
      const profile = await createProfileWithLimitCheck(db, account.id, input, {
        // [OPT-C] Default 'true' when binding missing (safe default; matches config default).
        adultOwnerGateEnabled: c.env?.ADULT_OWNER_GATE_ENABLED !== 'false',
      });

      return c.json(profileResponseSchema.parse({ profile }), 201);
    } catch (err) {
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
    const account = c.get('account');
    const profile = await getProfile(db, c.req.param('id'), account.id);
    if (!profile) return notFound(c, 'Profile not found');
    return c.json(profileResponseSchema.parse({ profile }));
  })
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
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
      const account = c.get('account');
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
