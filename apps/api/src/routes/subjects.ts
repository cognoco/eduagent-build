import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  subjectResolveInputSchema,
  subjectClassifyInputSchema,
  languageSetupSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import {
  listSubjects,
  createSubjectWithStructure,
  configureLanguageSubject,
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
  // [CR-650 / CR-651] Local bare catch{} blocks were swallowing LLM and quota
  // failures with no Sentry capture and no error-type classification. The
  // global onError handler in index.ts already does both — it converts
  // UpstreamLlmError into a 502 LLM_UNAVAILABLE response and captures every
  // other thrown error to Sentry with userId/profileId/requestPath context.
  // Letting errors propagate is the correct behavior; the prior swallowing
  // hid real outages.
  .post(
    '/subjects/resolve',
    zValidator('json', subjectResolveInputSchema),
    async (c) => {
      const { rawInput } = c.req.valid('json');
      const result = await resolveSubjectName(rawInput);
      return c.json(result);
    }
  )
  .post(
    '/subjects/classify',
    zValidator('json', subjectClassifyInputSchema),
    async (c) => {
      const { text } = c.req.valid('json');
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const result = await classifySubject(db, profileId, text);
      return c.json(result);
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
        500,
        ERROR_CODES.INTERNAL_ERROR,
        'Subject creation failed — please try again'
      );
    }
  })
  .put(
    '/subjects/:id/language-setup',
    zValidator('json', languageSetupSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      try {
        const subject = await configureLanguageSubject(
          db,
          profileId,
          c.req.param('id'),
          c.req.valid('json')
        );
        return c.json({ subject });
      } catch (err) {
        if (err instanceof Error && err.message === 'Subject not found') {
          return notFound(c, 'Subject not found');
        }
        if (
          err instanceof Error &&
          err.message === 'Subject is not configured for language learning'
        ) {
          return apiError(c, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
        }
        throw err;
      }
    }
  )
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
