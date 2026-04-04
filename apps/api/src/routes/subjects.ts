import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  subjectResolveInputSchema,
  subjectClassifyInputSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  listSubjects,
  createSubjectWithStructure,
  getSubject,
  updateSubject,
} from '../services/subject';
import { resolveSubjectName } from '../services/subject-resolve';
import { classifySubject } from '../services/subject-classify';
import { notFound, apiError } from '../errors';

type SubjectRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

export const subjectRoutes = new Hono<SubjectRouteEnv>()
  .post(
    '/subjects/resolve',
    zValidator('json', subjectResolveInputSchema),
    async (c) => {
      const { rawInput } = c.req.valid('json');
      try {
        const result = await resolveSubjectName(rawInput);
        return c.json(result);
      } catch {
        return apiError(
          c,
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Subject name resolution failed — please try again'
        );
      }
    }
  )
  .post(
    '/subjects/classify',
    zValidator('json', subjectClassifyInputSchema),
    async (c) => {
      const { text } = c.req.valid('json');
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const result = await classifySubject(db, profileId, text);
        return c.json(result);
      } catch {
        return apiError(
          c,
          500,
          ERROR_CODES.INTERNAL_ERROR,
          'Subject classification failed'
        );
      }
    }
  )
  .get('/subjects', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const includeInactive = c.req.query('includeInactive') === 'true';
    const subjects = await listSubjects(db, profileId, { includeInactive });
    return c.json({ subjects });
  })
  .post('/subjects', zValidator('json', subjectCreateSchema), async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const profileId = requireProfileId(c.get('profileId'));
    try {
      const result = await createSubjectWithStructure(db, profileId, input);
      return c.json(result, 201);
    } catch (err) {
      console.error('[POST /subjects] Unhandled error:', err);
      return apiError(
        c,
        502,
        ERROR_CODES.INTERNAL_ERROR,
        'Subject creation failed — please try again'
      );
    }
  })
  .get('/subjects/:id', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subject = await getSubject(db, profileId, c.req.param('id'));
    if (!subject) return notFound(c, 'Subject not found');
    return c.json({ subject });
  })
  .patch(
    '/subjects/:id',
    zValidator('json', subjectUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const input = c.req.valid('json');
      const profileId = requireProfileId(c.get('profileId'));
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
