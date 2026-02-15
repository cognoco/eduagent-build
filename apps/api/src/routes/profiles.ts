import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
} from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const profileRoutes = new Hono<AuthEnv>()
  .get('/profiles', async (c) => {
    // TODO: Query profiles for user's account using c.get('user')
    return c.json({ profiles: [] });
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const input = c.req.valid('json');
    // TODO: Create profile with createScopedRepository pattern
    return c.json(
      {
        profile: {
          id: 'placeholder',
          ...input,
          accountId: 'placeholder',
          isOwner: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      201
    );
  })
  .get('/profiles/:id', async (c) => {
    // TODO: Fetch profile using scoped repository via c.req.param('id')
    return c.json({ profile: null });
  })
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      // TODO: Update profile via c.req.param('id') and c.req.valid('json')
      return c.json({ profile: null });
    }
  )
  .post(
    '/profiles/switch',
    zValidator('json', profileSwitchSchema),
    async (c) => {
      const { profileId } = c.req.valid('json');
      // TODO: Verify profile belongs to user's account, set active profile
      return c.json({ message: 'Profile switched', profileId });
    }
  );
