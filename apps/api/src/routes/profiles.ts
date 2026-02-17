import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { notFound, forbidden } from '../lib/errors';
import { findOrCreateAccount } from '../services/account';
import {
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  switchProfile,
} from '../services/profile';

type ProfileEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database };
};

export const profileRoutes = new Hono<ProfileEnv>()
  .get('/profiles', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const account = await findOrCreateAccount(
      db,
      user.userId,
      user.email ?? ''
    );
    const profiles = await listProfiles(db, account.id);
    return c.json({ profiles });
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const input = c.req.valid('json');
    const account = await findOrCreateAccount(
      db,
      user.userId,
      user.email ?? ''
    );
    const isFirstProfile = (await listProfiles(db, account.id)).length === 0;
    const profile = await createProfile(db, account.id, input, isFirstProfile);
    return c.json({ profile }, 201);
  })
  .get('/profiles/:id', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const account = await findOrCreateAccount(
      db,
      user.userId,
      user.email ?? ''
    );
    const profile = await getProfile(db, c.req.param('id'), account.id);
    if (!profile) return notFound(c, 'Profile not found');
    return c.json({ profile });
  })
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const user = c.get('user');
      const input = c.req.valid('json');
      const account = await findOrCreateAccount(
        db,
        user.userId,
        user.email ?? ''
      );
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
      const user = c.get('user');
      const { profileId } = c.req.valid('json');
      const account = await findOrCreateAccount(
        db,
        user.userId,
        user.email ?? ''
      );
      const result = await switchProfile(db, profileId, account.id);
      if (!result)
        return forbidden(c, 'Profile does not belong to this account');
      return c.json({ message: 'Profile switched', profileId });
    }
  );
