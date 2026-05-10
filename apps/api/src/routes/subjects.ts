import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  subjectResolveInputSchema,
  subjectClassifyInputSchema,
  languageSetupSchema,
  ERROR_CODES,
  subjectResolveResultSchema,
  subjectClassifyResultSchema,
  subjectListResponseSchema,
  subjectResponseSchema,
  createSubjectWithStructureResponseSchema,
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
  retryCurriculumForSubject,
  SubjectNotLanguageLearningError,
} from '../services/subject';
import { resolveSubjectName } from '../services/subject-resolve';
import { classifySubject } from '../services/subject-classify';
import { notFound, apiError, SubjectNotFoundError } from '../errors';

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
      return c.json(subjectResolveResultSchema.parse(result));
    },
  )
  .post(
    '/subjects/classify',
    zValidator('json', subjectClassifyInputSchema),
    async (c) => {
      const { text } = c.req.valid('json');
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const result = await classifySubject(db, profileId, text);
      return c.json(subjectClassifyResultSchema.parse(result));
    },
  )
  .get('/subjects', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const includeInactive = c.req.query('includeInactive') === 'true';
    const subjects = await listSubjects(db, profileId, { includeInactive });
    return c.json(subjectListResponseSchema.parse({ subjects }));
  })
  .post('/subjects', zValidator('json', subjectCreateSchema), async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');
    const profileId = requireProfileId(c.get('profileId'));
    // [FIX-API-1] Let errors propagate to the global onError handler in index.ts
    // which converts UpstreamLlmError → 502 LLM_UNAVAILABLE and captures all
    // others to Sentry. The old try/catch was masking quota and LLM errors
    // as generic 500s, making them invisible in Sentry.
    const result = await createSubjectWithStructure(db, profileId, input);
    return c.json(createSubjectWithStructureResponseSchema.parse(result), 201);
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
          c.req.valid('json'),
        );
        return c.json(subjectResponseSchema.parse({ subject }));
      } catch (err) {
        // [FIX-API-6] Use typed instanceof check instead of string-matching message
        if (err instanceof SubjectNotFoundError) {
          return notFound(c, err.message);
        }
        // [BUG-SUBJ-LANG] Typed error replaces message-string comparison.
        if (err instanceof SubjectNotLanguageLearningError) {
          return apiError(c, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
        }
        throw err;
      }
    },
  )
  .post('/subjects/:id/retry-curriculum', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    try {
      const dispatched = await retryCurriculumForSubject(
        db,
        profileId,
        c.req.param('id'),
      );
      return c.json({ dispatched });
    } catch (err) {
      if (err instanceof SubjectNotFoundError) {
        return notFound(c, err.message);
      }
      throw err;
    }
  })
  .get('/subjects/:id', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subject = await getSubject(db, profileId, c.req.param('id'));
    if (!subject) return notFound(c, 'Subject not found');
    return c.json(subjectResponseSchema.parse({ subject }));
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
        input,
      );
      if (!subject) return notFound(c, 'Subject not found');
      return c.json(subjectResponseSchema.parse({ subject }));
    },
  );
