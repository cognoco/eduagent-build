import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  topicSkipSchema,
  topicUnskipSchema,
  curriculumChallengeSchema,
  curriculumTopicAddSchema,
  curriculumAdaptRequestSchema,
  curriculumTopicAddResponseSchema,
  curriculumAdaptResponseSchema,
  cloneFromChildRequestSchema,
  cloneFromChildResponseSchema,
  getCurriculumResponseSchema,
  undoCloneFromChildRequestSchema,
  undoCloneFromChildResponseSchema,
  topicSkipResponseSchema,
  topicUnskipResponseSchema,
  challengeCurriculumResponseSchema,
  explainTopicResponseSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import type { ProfileMeta } from '../middleware/profile-scope';
import { parseConversationLanguage } from '../services/llm';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import {
  getCurriculum,
  skipTopic,
  unskipTopic,
  challengeCurriculum,
  explainTopicOrdering,
  addCurriculumTopic,
  adaptCurriculumFromPerformance,
} from '../services/curriculum';
import {
  assertOwnerProfile,
  assertCallerIsAccountOwner,
} from '../services/family-access';
import {
  cloneTopicFromChild,
  undoCloneFromChild,
} from '../services/family-bridge';
import {
  notFound,
  apiError,
  ForbiddenError,
  NotFoundError,
  TopicNotSkippedError,
} from '../errors';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';

const logger = createLogger();

type CurriculumRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    // [WI-1989] The authenticated caller's own person id, resolved server-side
    // by accountMiddleware — required by assertCallerIsAccountOwner.
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

export const curriculumRoutes = new Hono<CurriculumRouteEnv>()
  .post(
    '/curriculum/clone-from-child',
    zValidator('json', cloneFromChildRequestSchema),
    async (c) => {
      assertOwnerProfile(c);
      // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
      await assertCallerIsAccountOwner(c);

      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const input = c.req.valid('json');

      try {
        const result = await cloneTopicFromChild(db, profileId, input);
        return c.json(cloneFromChildResponseSchema.parse(result));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, 'Topic not found');
        }
        if (error instanceof ForbiddenError) {
          // [audit-2026-05-30] 404 is deliberate (don't leak existence of
          // another account's topics — mirrors filing.ts:75-77). But the
          // authorization failure must remain observable for IDOR audit.
          logger.warn(
            '[curriculum.clone-from-child] ForbiddenError → 404 (IDOR-safe)',
            { profileId, error: error.message },
          );
          captureException(error, {
            extra: {
              context: 'curriculum.clone-from-child.forbidden',
              profileId,
            },
          });
          return notFound(c, 'Topic not found');
        }
        throw error;
      }
    },
  )
  .delete(
    '/curriculum/clone-from-child/undo',
    zValidator('json', undoCloneFromChildRequestSchema),
    async (c) => {
      assertOwnerProfile(c);
      // [WI-1989] Caller-identity gate — see assertCallerIsAccountOwner doc.
      await assertCallerIsAccountOwner(c);

      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { createdIds } = c.req.valid('json');

      const result = await undoCloneFromChild(db, profileId, createdIds);
      return c.json(undoCloneFromChildResponseSchema.parse(result));
    },
  )
  // Get curriculum for a subject
  .get('/subjects/:subjectId/curriculum', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const curriculum = await getCurriculum(db, profileId, subjectId);
    return c.json(getCurriculumResponseSchema.parse({ curriculum }));
  })
  // Skip a topic
  .post(
    '/subjects/:subjectId/curriculum/skip',
    zValidator('json', topicSkipSchema),
    async (c) => {
      // [WI-147 / DS-058] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const { topicId } = c.req.valid('json');
      try {
        await skipTopic(db, profileId, subjectId, topicId);
        return c.json(
          topicSkipResponseSchema.parse({ message: 'Topic skipped', topicId }),
        );
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  // Unskip (restore) a topic
  .post(
    '/subjects/:subjectId/curriculum/unskip',
    zValidator('json', topicUnskipSchema),
    async (c) => {
      // [WI-147 / DS-058] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const { topicId } = c.req.valid('json');
      try {
        await unskipTopic(db, profileId, subjectId, topicId);
        return c.json(
          topicUnskipResponseSchema.parse({
            message: 'Topic restored',
            topicId,
          }),
        );
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        // [FIX-API-6] Use typed instanceof check instead of string-matching message
        if (error instanceof TopicNotSkippedError) {
          return apiError(c, 422, ERROR_CODES.VALIDATION_ERROR, error.message);
        }
        throw error;
      }
    },
  )
  // Challenge/regenerate curriculum
  .post(
    '/subjects/:subjectId/curriculum/topics',
    zValidator('json', curriculumTopicAddSchema),
    async (c) => {
      // [WI-147 / DS-058] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');
      // [WI-2396] Consent-withdrawal gate — immediately before LLM dispatch
      // (canon R5). addCurriculumTopic dispatches the LLM only for
      // mode='preview' (previewCurriculumTopic -> the LLM router); mode='create'
      // is a pure DB insert. Gate every mode EXCEPT the proven-deterministic
      // 'create', and fail closed — the discriminated-union schema admits only
      // 'create'/'preview' today, and any future mode stays gated.
      if (input.mode !== 'create') {
        await assertLlmConsent(db, profileId);
      }
      try {
        const result = await addCurriculumTopic(
          db,
          profileId,
          subjectId,
          input,
        );
        return c.json(curriculumTopicAddResponseSchema.parse(result));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  .post(
    '/subjects/:subjectId/curriculum/challenge',
    zValidator('json', curriculumChallengeSchema),
    async (c) => {
      // [WI-147 / DS-058] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const { feedback } = c.req.valid('json');
      // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
      await assertLlmConsent(db, profileId);
      try {
        const curriculum = await challengeCurriculum(
          db,
          profileId,
          subjectId,
          feedback,
        );
        return c.json(challengeCurriculumResponseSchema.parse({ curriculum }));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  // Performance-driven curriculum adaptation (FR21)
  .post(
    '/subjects/:subjectId/curriculum/adapt',
    zValidator('json', curriculumAdaptRequestSchema),
    async (c) => {
      // [WI-147 / DS-058] Server-derived proxy-mode write guard.
      await assertNotProxyMode(c);
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const subjectId = c.req.param('subjectId');
      const input = c.req.valid('json');

      try {
        const result = await adaptCurriculumFromPerformance(
          db,
          profileId,
          subjectId,
          input,
        );
        return c.json(curriculumAdaptResponseSchema.parse(result));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  // Explain topic ordering
  .get('/subjects/:subjectId/curriculum/topics/:topicId/explain', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const subjectId = c.req.param('subjectId');
    const topicId = c.req.param('topicId');
    // [WI-2396] Consent-withdrawal gate before LLM dispatch (canon R5).
    await assertLlmConsent(db, profileId);
    try {
      const profileMeta = c.get('profileMeta');
      const explanation = await explainTopicOrdering(
        db,
        profileId,
        subjectId,
        topicId,
        {
          conversationLanguage: parseConversationLanguage(
            profileMeta?.conversationLanguage,
          ),
        },
      );
      return c.json(explainTopicResponseSchema.parse({ explanation }));
    } catch (error) {
      if (error instanceof NotFoundError) {
        return notFound(c, error.message);
      }
      throw error;
    }
  });
