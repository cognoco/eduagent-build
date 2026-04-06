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

type ProfileEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database; account: Account };
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
    const existingProfiles = await listProfiles(db, account.id);
    const isFirstProfile = existingProfiles.length === 0;

    // BUG-239: When an owner (parent) creates a non-first profile (child),
    // pass the parent's profileId so consent can be granted immediately
    // instead of entering the child-initiated consent request loop.
    let parentProfileId: string | undefined;
    if (!isFirstProfile) {
      const ownerProfile = existingProfiles.find((p) => p.isOwner);
      if (ownerProfile) {
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
