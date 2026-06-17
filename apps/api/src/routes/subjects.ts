import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  subjectCreateSchema,
  subjectUpdateSchema,
  subjectResolveInputSchema,
  subjectClassifyInputSchema,
  languageSetupSchema,
  ERROR_CODES,
  subjectIdParamSchema,
  subjectResolveResultSchema,
  subjectClassifyResultSchema,
  subjectListResponseSchema,
  subjectResponseSchema,
  deleteSubjectResponseSchema,
  createSubjectWithStructureResponseSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import {
  requireProfileId,
  type ProfileMeta,
} from '../middleware/profile-scope';
import {
  listSubjects,
  createSubjectWithStructure,
  configureLanguageSubject,
  getSubject,
  updateSubject,
  deleteSubject,
  retryCurriculumForSubject,
  SubjectNotLanguageLearningError,
} from '../services/subject';
import { resolveSubjectName } from '../services/subject-resolve';
import { classifySubject } from '../services/subject-classify';
import { notFound, apiError, SubjectNotFoundError } from '../errors';
import { parseConversationLanguage } from '../services/llm';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile } from '../route-utils/route-context';
import { isIdentityV2Enabled } from '../config';

type SubjectRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
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
      // [BUG-93 / A1-CRIT] Was missing requireProfileId; combined with the
      // missing metering pattern this let any authenticated user (or
      // anonymous if profile auto-resolution failed) call the LLM-backed
      // resolver in a tight loop. Same class as BUG-623 (recall-bridge) and
      // BUG-653 (evaluate-depth). Both halves are now in place: route-level
      // requireProfileId here, and /subjects/resolve in
      // LLM_ROUTE_PATTERNS_POST_ONLY in middleware/metering.ts.
      const profileId = requireProfileId(c.get('profileId'));
      assertNotProxyMode(c);
      void profileId;
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
      assertNotProxyMode(c);
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
    assertNotProxyMode(c);
    // [FIX-API-1] Let errors propagate to the global onError handler in index.ts
    // which converts UpstreamLlmError → 502 LLM_UNAVAILABLE and captures all
    // others to Sentry. The old try/catch was masking quota and LLM errors
    // as generic 500s, making them invisible in Sentry.
    // i18n Phase 1 — thread conversation_language into subject-structure LLM.
    const subjectProfileMeta = c.get('profileMeta');
    const result = await createSubjectWithStructure(db, profileId, input, {
      conversationLanguage: parseConversationLanguage(
        subjectProfileMeta?.conversationLanguage,
      ),
      identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
    });
    return c.json(createSubjectWithStructureResponseSchema.parse(result), 201);
  })
  .put(
    '/subjects/:id/language-setup',
    // [F-166] UUID guard: malformed :id is rejected 4xx before reaching the DB.
    zValidator('param', subjectIdParamSchema),
    zValidator('json', languageSetupSchema),
    async (c) => {
      // [WI-177 / DS-088] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { id } = c.req.valid('param');
      try {
        const subject = await configureLanguageSubject(
          db,
          profileId,
          id,
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
  .post(
    '/subjects/:id/retry-curriculum',
    // [F-166] UUID guard: malformed :id is rejected 4xx before reaching the DB.
    zValidator('param', subjectIdParamSchema),
    async (c) => {
      // [WI-177 / DS-088] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { id } = c.req.valid('param');
      try {
        const dispatched = await retryCurriculumForSubject(db, profileId, id);
        return c.json({ dispatched });
      } catch (err) {
        if (err instanceof SubjectNotFoundError) {
          return notFound(c, err.message);
        }
        throw err;
      }
    },
  )
  .get(
    '/subjects/:id',
    // [F-166] UUID guard: malformed :id is rejected 4xx before reaching the DB.
    zValidator('param', subjectIdParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { id } = c.req.valid('param');
      const subject = await getSubject(db, profileId, id);
      if (!subject) return notFound(c, 'Subject not found');
      return c.json(subjectResponseSchema.parse({ subject }));
    },
  )
  .delete(
    '/subjects/:id',
    zValidator('param', subjectIdParamSchema),
    async (c) => {
      // [learn-3] Server-derived proxy-mode write guard; subject delete is
      // irreversible and must never be available from parent proxy sessions.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      const { id } = c.req.valid('param');
      try {
        const result = await deleteSubject(db, profileId, id);
        return c.json(deleteSubjectResponseSchema.parse(result));
      } catch (err) {
        if (err instanceof SubjectNotFoundError) {
          return notFound(c, err.message);
        }
        throw err;
      }
    },
  )
  .patch(
    '/subjects/:id',
    // [F-166] UUID guard: malformed :id is rejected 4xx before reaching the DB.
    zValidator('param', subjectIdParamSchema),
    zValidator('json', subjectUpdateSchema),
    async (c) => {
      // [WI-177 / DS-088] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const db = c.get('db');
      const input = c.req.valid('json');
      const profileId = requireProfileId(c.get('profileId'));
      const { id } = c.req.valid('param');
      const subject = await updateSubject(db, profileId, id, input);
      if (!subject) return notFound(c, 'Subject not found');
      return c.json(subjectResponseSchema.parse({ subject }));
    },
  );
