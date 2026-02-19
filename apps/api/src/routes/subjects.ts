import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { subjectCreateSchema, subjectUpdateSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  listSubjects,
  createSubject,
  getSubject,
  updateSubject,
} from '../services/subject';
import { notFound } from '../errors';

type SubjectRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string;
  };
};

export const subjectRoutes = new Hono<SubjectRouteEnv>()
  .get('/subjects', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    // Use profileId from profile-scope middleware, fallback to account.id
    const profileId = c.get('profileId') ?? account.id;
    const subjects = await listSubjects(db, profileId);
    return c.json({ subjects });
  })
  .post('/subjects', zValidator('json', subjectCreateSchema), async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const input = c.req.valid('json');
    const profileId = c.get('profileId') ?? account.id;
    const subject = await createSubject(db, profileId, input);
    return c.json({ subject }, 201);
  })
  .get('/subjects/:id', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profileId = c.get('profileId') ?? account.id;
    const subject = await getSubject(db, profileId, c.req.param('id'));
    if (!subject) return notFound(c, 'Subject not found');
    return c.json({ subject });
  })
  .patch(
    '/subjects/:id',
    zValidator('json', subjectUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const input = c.req.valid('json');
      const profileId = c.get('profileId') ?? account.id;
      const subject = await updateSubject(
        db,
        profileId,
        c.req.param('id'),
        input
      );
      if (!subject) return notFound(c, 'Subject not found');
      return c.json({ subject });
    }
  );
