import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { subjectCreateSchema, subjectUpdateSchema } from '@eduagent/schemas';
import type { AuthEnv } from '../middleware/auth';

export const subjectRoutes = new Hono<AuthEnv>()
  .get('/subjects', async (c) => {
    // TODO: Query subjects for current user's profile
    return c.json({ subjects: [] });
  })
  .post('/subjects', zValidator('json', subjectCreateSchema), async (c) => {
    const input = c.req.valid('json');
    return c.json(
      {
        subject: {
          id: 'placeholder',
          profileId: 'placeholder',
          ...input,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      201
    );
  })
  .get('/subjects/:id', async (c) => {
    // TODO: Fetch subject by ID
    return c.json({ subject: null });
  })
  .patch(
    '/subjects/:id',
    zValidator('json', subjectUpdateSchema),
    async (c) => {
      // TODO: Update subject
      return c.json({ subject: null });
    }
  );
