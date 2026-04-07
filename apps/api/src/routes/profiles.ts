import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { notFound, forbidden, validationError } from '../errors';
import {
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  switchProfile,
  ProfileValidationError,
} from '../services/profile';
import { getSubscriptionByAccountId, canAddProfile } from '../services/billing';

type ProfileEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database; account: Account; profileId: string | undefined };
};

export const profileRoutes = new Hono<ProfileEnv>()
  .get('/profiles', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profiles = await listProfiles(db, account.id);
    return c.json({ profiles });
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const input = c.req.valid('json');

    // Single read to determine existing profiles — used for both the
    // isFirstProfile flag and the billing guard, eliminating the TOCTOU
    // race where concurrent requests could both pass separate reads.
    const existingProfiles = await listProfiles(db, account.id);
    const isFirstProfile = existingProfiles.length === 0;

    // Enforce per-tier profile limits via canAddProfile as the single
    // authoritative check. First profile creation is always allowed.
    if (!isFirstProfile) {
      const subscription = await getSubscriptionByAccountId(db, account.id);
      if (!subscription || !(await canAddProfile(db, subscription.id))) {
        return forbidden(
          c,
          'Your subscription does not support additional profiles. Please upgrade to Family or Pro.'
        );
      }
    }

    // BUG-239: When the owner (parent) creates a non-first profile (child),
    // pass the parent's profileId so consent can be granted immediately
    // instead of entering the child-initiated consent request loop.
    // Security: verify the CALLER's active profile matches the owner profile.
    // A child authenticated under the same Clerk account must not bypass
    // consent by creating sibling profiles.
    let parentProfileId: string | undefined;
    if (!isFirstProfile) {
      const ownerProfile = existingProfiles.find((p) => p.isOwner);
      const callerProfileId = c.get('profileId');
      if (ownerProfile && callerProfileId === ownerProfile.id) {
        parentProfileId = ownerProfile.id;
      }
    }

    try {
      const profile = await createProfile(
        db,
        account.id,
        input,
        isFirstProfile,
        parentProfileId
      );
      return c.json({ profile }, 201);
    } catch (err) {
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
    return c.json({ profile });
  })
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const input = c.req.valid('json');
      const profile = await updateProfile(
        db,
        c.req.param('id'),
        account.id,
        input
      );
      if (!profile) return notFound(c, 'Profile not found');
      return c.json({ profile });
    }
  )
  .post(
    '/profiles/switch',
    zValidator('json', profileSwitchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const { profileId } = c.req.valid('json');
      const result = await switchProfile(db, profileId, account.id);
      if (!result)
        return forbidden(c, 'Profile does not belong to this account');
      return c.json({ message: 'Profile switched', profileId });
    }
  );
